for file in `find ~/.dotfiles/includes`; do
    [ -f "$file" ] && source "$file"
done

unset file
