#!/bin/sh
domain=$1
email=$2

folder="/etc/letsencrypt/live/$domain"

if [ ! -d $folder ]; then
    certbot certonly --text -n --keep --email $email --agree-tos --webroot -w /app/letsencrypt -d $domain --staging
    cat ${folder}/privkey.pem ${folder}/fullchain.pem | tee ${folder}/haproxy.pem >/dev/null
fi

