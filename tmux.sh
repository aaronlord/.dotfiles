#!/usr/bin/env bash

pane=$1; path=$2

if [ -z "$pane" ] || [ -z "$path" ]; then
  echo "Usage: $0 <pane-id> <path>"
  exit 1
fi

# Pane 1: code
tmux rename-window -t $pane "code"
tmux send-keys -t $pane "nvim" C-m

# Pane 2: misc
tmux new-window -d -t $pane -c "$path"

changes=$(git status 2> /dev/null | tail -n 1)

if [ "$changes" == "nothing to commit, working tree clean" ]; then
    tmux send-keys -t $pane:2 "git pull" C-m
fi

# Pane 3: papa
tmux new-window -d -n "papa" -t $pane -c "$path"
tmux send-keys -t $pane:3  "gh copilot" C-m
