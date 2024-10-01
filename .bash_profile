for file in `find ~/.dotfiles/includes`; do
    [ -f "$file" ] && source "$file"
done

unset file
export DOCKER_CLIENT_TIMEOUT=180
export COMPOSE_HTTP_TIMEOUT=180
