#!/bin/sh
# Runs setup.sh in a temporary copy against the .env files that have gone wrong before, so a real .env is
# never touched. Run from anywhere: sh e2e/setup.test.sh
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0

fail() {
    echo "FAIL $1"
    failures=$((failures + 1))
}

# A fresh copy of the two files setup.sh needs, with the given .env (or none).
fresh() {
    rm -rf "$work/app"
    mkdir "$work/app"
    cp "$repo/setup.sh" "$repo/.env.example" "$work/app/"
}

run_setup() {
    sh "$work/app/setup.sh" > /dev/null 2>&1 || fail "setup.sh exited with an error"
}

# An .env from before V4.0.0: secrets already set, no SCRAPER_TOKEN line.
pre_v4_env() {
    printf 'POSTGRES_PASSWORD=keepme\nINTERNAL_TOKEN=%s\nJWT_SECRET=%s\nANTHROPIC_MODEL=claude-sonnet-5' \
        "$(printf 'a%.0s' $(seq 64))" "$(printf 'b%.0s' $(seq 64))"
}

check_scraper_token() {
    grep -Eq '^SCRAPER_TOKEN=[0-9a-f]{64}$' "$work/app/.env" || fail "$1: SCRAPER_TOKEN is not 64 hex characters on its own line"
}

# Saved without a final newline: the token used to be glued onto the last value.
fresh
pre_v4_env > "$work/app/.env"
{ pre_v4_env; echo; } > "$work/expected"
run_setup
head -c "$(wc -c < "$work/expected")" "$work/app/.env" | cmp -s - "$work/expected" || fail "no final newline: an existing line changed"
check_scraper_token "no final newline"

# With a final newline, nothing is added between the old lines and the token.
fresh
{ pre_v4_env; echo; } > "$work/app/.env"
cp "$work/app/.env" "$work/expected"
run_setup
head -c "$(wc -c < "$work/expected")" "$work/app/.env" | cmp -s - "$work/expected" || fail "final newline: an existing line changed"
[ "$(wc -l < "$work/app/.env")" -eq 5 ] || fail "final newline: expected 5 lines, got $(wc -l < "$work/app/.env")"
check_scraper_token "final newline"

# Running again changes nothing.
cp "$work/app/.env" "$work/expected"
run_setup
cmp -s "$work/app/.env" "$work/expected" || fail "second run changed .env"

# A fresh install gets every placeholder filled, the database password included.
fresh
run_setup
grep -q 'change_me' "$work/app/.env" && fail "fresh install: a change_me placeholder is left"
grep -Eq '^JWT_SECRET=[0-9a-f]{64}$' "$work/app/.env" || fail "fresh install: JWT_SECRET is not 64 hex characters"
check_scraper_token "fresh install"

if [ "$failures" -eq 0 ]; then
    echo "setup.sh: all checks passed"
else
    exit 1
fi
