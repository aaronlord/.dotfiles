#!/usr/bin/env bash

pane=$1; path=$2

if [ -z "$pane" ] || [ -z "$path" ]; then
  echo "Usage: $0 <pane-id> <path>"
  exit 1
fi

tmux rename-window -t $pane "vim"
tmux send-keys -t $pane "nvim" C-m

tmux new-window -d -n "misc" -t $pane -c "$path"

if git -C "$path" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    has_changes=$(git -C "$path" status 2> /dev/null | tail -n 1)

    if [ "$has_changes" != "nothing to commit, working tree clean" ]; then
        tmux send-keys -t $pane:2 "git pull" C-m
    fi
fi
