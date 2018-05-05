#!/bin/sh

# Obsolete file

echo "---- Running renew script $(date) ----"

# renew and set a flag (as a file) if a renew has occured
rm /tmp/__renew > /dev/null 2>&1 || true
certbot renew --post-hook "touch /tmp/__renew"

if [ -f /tmp/__renew ]; then
    for domain_path in $(find /etc/letsencrypt/live -mindepth 1 -maxdepth 1 -type d); do
        cat ${domain_path}/privkey.pem ${domain_path}/fullchain.pem | \
            tee ${domain_path}/haproxy.pem >/dev/null
    done
    # restart proxy
    wget http://localhost:29000/restart
fi

