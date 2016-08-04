FROM haproxy:1.6

RUN echo deb http://ftp.debian.org/debian jessie-backports main >> /etc/apt/sources.list && \
    apt-get update && apt-get -y install curl && \
    curl -fsSL https://deb.nodesource.com/setup_6.x | sh && \
    apt-get -y install certbot -t jessie-backports && \
    apt-get -y install nodejs supervisor cron && apt-get clean

EXPOSE 29000
EXPOSE 443
EXPOSE 80

# Persistent volume for certificates
VOLUME /etc/letsencrypt

RUN mkdir -p /var/log/supervisor /app/letsencrypt/.well-known/acme-challenge

# Application
WORKDIR /app

COPY assets/supervisord.conf /etc/supervisord.conf

# all week
RUN echo "0 0 * * 0 /app/cert-renewal.sh >> /var/log/renew.log 2>&1" | crontab -
COPY assets/cert-renewal.sh /app/cert-renewal.sh
RUN chmod +x /app/cert-renewal.sh

COPY assets/cert-creation.sh /app/cert-creation.sh
RUN chmod +x /app/cert-creation.sh

COPY assets/global.cfg /var/haproxy/haproxy.default
COPY node_modules/ /app/node_modules
COPY dist/ /app

ENTRYPOINT ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]