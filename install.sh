#!/bin/bash

repo="git@github.com:aaronlord/.dotfiles.git"
dir="$HOME/.dotfiles"

set -u

abort() {
  printf "%s\n" "$@" >&2
  exit 1
}

if [ -z "${BASH_VERSION:-}" ]
then
  abort "Bash is required to interpret this script."
fi

if [[ -t 1 ]]
then
  tty_escape() { printf "\033[%sm" "$1"; }
else
  tty_escape() { :; }
fi
tty_mkbold() { tty_escape "1;$1"; }
tty_blue="$(tty_mkbold 34)"
tty_green="$(tty_mkbold 32)"
tty_red="$(tty_mkbold 31)"
tty_reset="$(tty_escape 0)"

shell_join() {
  local arg
  printf "%s" "$1"
  shift
  for arg in "$@"
  do
    printf " "
    printf "%s" "${arg// /\ }"
  done
}

chomp() {
    printf "%s" "${1/"$'\n'"/}"
}

info() {
    printf "${tty_green} %s\n" "$(shell_join "$@")"
}

line() {
    printf "${tty_blue}=>${tty_reset} %s\n" "$(shell_join "$@")"
}

warn() {
    printf "${tty_red}Warning${tty_reset}: %s\n" "$(chomp "$1")" >&2
}


info "Cloning .dotfiles"

line "$repo -> $dir"
git clone $repo $dir

info "Creating symlinks"

line "$dir/.bash_aliases -> $HOME/.bash_aliases" 
ln -s $dir/.bash_profile $HOME/.bash_aliases

line "$dir/.tmux.conf -> $HOME/.tmux.conf"
ln -s $dir/.tmux.conf $HOME/.tmux.conf

line "$dir/.tigrc -> $HOME/.tigrc"
ln -s $dir/.tigrc $HOME/.tigrc

info "Saucy"
line "source $HOME/.bashrc"
source $HOME/.bashrc
