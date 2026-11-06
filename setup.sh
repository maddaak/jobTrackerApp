#!/bin/sh
# First-time setup: makes .env with fresh secrets, and a certificate if mkcert is installed.
# Safe to run again: a value you've already set is never replaced.
set -eu
cd "$(dirname "$0")"

random_hex() {
    od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'
}

# Replaces a value only while it is still .env.example's public placeholder.
fill() {
    name=$1
    bytes=$2
    if grep -q "^$name=change_me" .env; then
        tmp=$(mktemp)
        sed "s/^$name=change_me.*/$name=$(random_hex "$bytes")/" .env > "$tmp"
        cat "$tmp" > .env
        rm -f "$tmp"
        echo "  set $name"
    fi
}

if [ -f .env ]; then
    echo "Using the .env already here."
    new_env=false
else
    if [ ! -f .env.example ]; then
        echo "There's no .env.example next to this script. Download it from the repo first." >&2
        exit 1
    fi
    cp .env.example .env
    chmod 600 .env
    echo "Made .env from .env.example."
    new_env=true
fi

# The database keeps the password it was first started with, so an existing .env's is left alone.
if [ "$new_env" = true ]; then
    fill POSTGRES_PASSWORD 16
fi
fill INTERNAL_TOKEN 32
# Added in V4.0.0, so a .env made before it doesn't have the line yet.
if ! grep -q "^SCRAPER_TOKEN=" .env; then
    # A .env saved without a final newline would otherwise get this glued onto its last value.
    [ -z "$(tail -c 1 .env)" ] || echo >> .env
    echo "SCRAPER_TOKEN=change_me" >> .env
fi
fill SCRAPER_TOKEN 32
# HS512 needs at least 64 bytes; 32 random bytes written as hex are 64 characters.
fill JWT_SECRET 32

if [ -f certs/localhost.pem ] && [ -f certs/localhost-key.pem ]; then
    scheme=https
    echo "certs/ already has a certificate."
elif command -v mkcert > /dev/null 2>&1; then
    mkdir -p certs
    mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1
    scheme=https
    echo "Made a certificate in certs/. If your browser still warns, run 'mkcert -install' once."
else
    scheme=http
    echo "No mkcert, so the app will run on plain http. That's fine on this machine; the README says how to add https."
fi

if [ -f docker-compose.yml ] && [ -d core ]; then
    start="docker compose -f docker-compose.images.yml up -d    (or: docker compose up -d --build, to build from source)"
else
    start="docker compose -f docker-compose.images.yml up -d"
fi

port=$(sed -n 's/^WEB_PORT=//p' .env)

echo
echo "Done. Start it with:"
echo "  $start"
echo "then open $scheme://localhost:${port:-5173} and register."
