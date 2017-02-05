#!/bin/sh
set -e

domain=$1
email=$2

staging=""
if [ "$VULCAIN_ENV_MODE" == "test" -o -n "$STAGING"]; then
    staging="--staging"
fi

folder="/etc/letsencrypt/live/$domain"

if [ ! -d $folder ]; then
    certbot certonly --text -n --keep --email $email --agree-tos --webroot -w /app/letsencrypt -d $domain $staging
    if [ -e ${folder}/fullchain.pem ]; then
        cat ${folder}/privkey.pem ${folder}/fullchain.pem | tee ${folder}/haproxy.pem >/dev/null
    fi
fi

