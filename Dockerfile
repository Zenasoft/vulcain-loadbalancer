FROM haproxy:1.6

RUN echo deb http://ftp.debian.org/debian jessie-backports main >> /etc/apt/sources.list && \
    apt-get update && apt-get -y install curl && \
    curl -fsSL https://deb.nodesource.com/setup_6.x | sh && \
    apt-get -y install certbot -t jessie-backports && \
    apt-get -y install nodejs supervisor cron && apt-get clean

EXPOSE 29000

# Haproxy configuration shared with discovery
VOLUME /var/haproxy
# Persistent volume for certificates
VOLUME /etc/letsencrypt/live

# Application
WORKDIR /app

# All monday at 5 o'clock
RUN echo "* 5 * * mon root /app/cert-renewal.sh" > /etc/crontab

RUN mkdir -p /var/log/supervisor /app/letsencrypt/.well-known/acme-challenge
ADD assets/cert-renewal.sh /app/cert-renewal.sh
RUN chmod +x /app/cert-renewal.sh

COPY assets/supervisord.conf /etc/supervisord.conf

COPY assets/global.cfg /var/haproxy/haproxy.default
COPY node_modules/ /app/node_modules
COPY dist/ /app

ENTRYPOINT ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]