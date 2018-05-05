#!/bin/sh
set -e

domain=$1
email=$2

staging=""
if [ -n "$STAGING" ] ; then
    staging="--staging"
fi

dn=$domain

folder="/etc/letsencrypt/live/$dn"

if [ ! -d $folder ]; then
    certbot certonly --text -n --keep --email $email --server https://acme-v02.api.letsencrypt.org/directory \
            --agree-tos --webroot -w /app/letsencrypt -d $domain $staging

   # if [ -e ${folder}/fullchain.pem ]; then
   #     cat ${folder}/privkey.pem ${folder}/fullchain.pem | tee ${folder}/haproxy.pem >/dev/null
   # fi
fi

