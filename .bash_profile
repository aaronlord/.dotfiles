for file in `find ~/.dotfiles/includes`; do
    [ -f "$file" ] && source "$file"
done

unset file

if command -v tmux &> /dev/null && [ -n "$PS1" ] && [[ ! "$TERM" =~ screen ]] && [[ ! "$TERM" =~ tmux ]] && [ -z "$TMUX" ]; then
  exec tmux
fi
