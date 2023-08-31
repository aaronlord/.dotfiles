#!/usr/bin/env bash

languages="php rust"

if [[ ! -f ~/.tmux-cht-languages ]]; then
    echo $languages | tr ' ' "\n" > ~/.tmux-cht-languages
fi

commands="curl wget scp ssh tmux grep find tar"

if [[ ! -f ~/.tmux-cht-command ]]; then
    echo $commands | tr ' ' "\n" > ~/.tmux-cht-command
fi

selected=`cat ~/.tmux-cht-languages ~/.tmux-cht-command | fzf`

if [[ -z $selected ]]; then
    exit 0
fi

read -p "Enter Query: " query

if grep -qs "$selected" ~/.tmux-cht-languages; then
    query=`echo $query | tr ' ' '+'`
    tmux neww bash -c "echo \"curl cht.sh/$selected/$query/\" & curl cht.sh/$selected/$query & while [ : ]; do sleep 1; done"
else
    tmux neww bash -c "echo \"curl cht.sh/$selected~$query/\" & curl cht.sh/$selected~$query & while [ : ]; do sleep 1; done"
fi
