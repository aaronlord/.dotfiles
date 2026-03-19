#!/usr/bin/env bash

pane=$1; path=$2

if [ -z $pane ] || [ -z $path ]; then
    echo "Usage: tmux.sh <pane> <path>"
    exit 1
fi

tmux send-keys -t $pane "nvim" C-m
tmux new-window -d -t $pane -c "$path"

changes=$(git status 2> /dev/null | tail -n 1)

if [ "$changes" == "nothing to commit, working tree clean" ]; then
    tmux send-keys -t $pane:2 "git pull" C-m
fi

tmux new-window -d -t $pane -c "$path"
tmux send-keys -t $pane:3 "laratail" C-m
