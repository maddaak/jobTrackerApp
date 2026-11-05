#!/bin/sh
# First-time setup: makes .env with fresh secrets, and a certificate if mkcert is installed.
# Safe to run again: a value you've already set is never replaced. It works only on this computer:
# CI runs it with networking switched off.
set -eu
cd "$(dirname "$0")"

random_hex() {
    od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'
}

# Replaces a value only while it is still .env.example's public placeholder. Values are never printed.
fill() {
    name=$1
    bytes=$2
    if grep -q "^$name=change_me" .env; then
        tmp=$(mktemp)
        sed "s/^$name=change_me.*/$name=$(random_hex "$bytes")/" .env > "$tmp"
        cat "$tmp" > .env
        rm -f "$tmp"
        echo "  $name: made a new random value"
    else
        echo "  $name: already set, kept"
    fi
}

echo "Job Tracker setup. This works only on this computer and sends nothing over the network."
echo
echo "Secrets, in .env (the values are never shown):"
if [ -f .env ]; then
    echo "  Using the .env already here; only values still on a change_me placeholder are filled."
    new_env=false
else
    if [ ! -f .env.example ]; then
        echo "There's no .env.example next to this script. Download it from the repo first." >&2
        exit 1
    fi
    cp .env.example .env
    chmod 600 .env
    echo "  Made .env from .env.example, readable only by you."
    new_env=true
fi

# The database keeps the password it was first started with, so an existing .env's is left alone.
if [ "$new_env" = true ]; then
    fill POSTGRES_PASSWORD 16
else
    echo "  POSTGRES_PASSWORD: kept, since the database keeps the one it first started with"
fi
fill INTERNAL_TOKEN 32
# Added in V4.0.0, so a .env made before it doesn't have the line yet.
if ! grep -q "^SCRAPER_TOKEN=" .env; then
    # A .env saved without a final newline would otherwise get this glued onto its last value.
    [ -z "$(tail -c 1 .env)" ] || echo >> .env
    echo "SCRAPER_TOKEN=change_me" >> .env
    echo "  SCRAPER_TOKEN: added, new in V4.0.0"
fi
fill SCRAPER_TOKEN 32
# HS512 needs at least 64 bytes; 32 random bytes written as hex are 64 characters.
fill JWT_SECRET 32

echo
echo "Certificate, in certs/:"
if [ -f certs/localhost.pem ] && [ -f certs/localhost-key.pem ]; then
    scheme=https
    echo "  Already has one, kept. The app will use https."
elif command -v mkcert > /dev/null 2>&1; then
    echo "  mkcert is installed, so it's making a certificate for localhost on this computer:"
    mkdir -p certs
    mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1
    scheme=https
    echo "  Made certs/localhost.pem and certs/localhost-key.pem. The app will use https; if your browser"
    echo "  still warns, run 'mkcert -install' once."
else
    scheme=http
    echo "  mkcert isn't installed, so none was made. The app will use plain http, which is fine on this"
    echo "  machine; the README says how to add https."
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
echo "The first start downloads the app's public images; your data and .env stay on this computer."
echo "Then open $scheme://localhost:${port:-5173} and register."
