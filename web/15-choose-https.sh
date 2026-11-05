#!/bin/sh
# Runs before nginx starts. A certificate in certs/ means https; none means plain http, which browsers
# already treat as secure on localhost, so trying the app needs no mkcert.
set -eu

CERT=/etc/nginx/certs/localhost.pem
KEY=/etc/nginx/certs/localhost-key.pem

if [ -f "$CERT" ] && [ -f "$KEY" ]; then
    # Plain http on this port (497) is sent to https, so an emailed http:// link works with either setup.
    printf 'listen 443 ssl;\nssl_certificate %s;\nssl_certificate_key %s;\nerror_page 497 =301 https://$http_host$request_uri;\n' \
        "$CERT" "$KEY" > /etc/nginx/listen.conf
    echo "15-choose-https: certificate found, serving https"
else
    echo 'listen 443;' > /etc/nginx/listen.conf
    echo "15-choose-https: no certificate in certs/, serving plain http"
fi

# Opt-in, for a real domain: it makes browsers refuse plain http for the host for a year, which on
# localhost would catch every other app served there. Browsers ignore it over http, so it's safe behind
# a proxy that ends https.
if [ "${HSTS:-false}" = "true" ]; then
    echo 'add_header Strict-Transport-Security "max-age=31536000" always;' > /etc/nginx/hsts.conf
    echo "15-choose-https: sending Strict-Transport-Security"
else
    echo '# HSTS is off; set HSTS=true in .env to send it.' > /etc/nginx/hsts.conf
fi
