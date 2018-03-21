FROM haproxy:1.7

RUN echo deb http://ftp.debian.org/debian jessie-backports main >> /etc/apt/sources.list && \
    apt-get update && apt-get upgrade -y && apt-get -y install curl && \
    curl -fsSL https://deb.nodesource.com/setup_6.x | sh && \
    apt-get -y install nodejs supervisor cron && apt-get clean

RUN curl https://dl.eff.org/certbot-auto -O && chmod a+x certbot-auto && mv certbot-auto /usr/bin/certbot && certbot --install-only -n

EXPOSE 1936
EXPOSE 29000
EXPOSE 443
EXPOSE 80

# Persistent volume for certificates
VOLUME /etc/letsencrypt

RUN mkdir -p /var/log/supervisor /app/letsencrypt/.well-known/acme-challenge

# Application
WORKDIR /app

COPY assets/supervisord.conf /etc/supervisord.conf

# all week (useless since cerbot provides this functionality)
#RUN echo "0 0 * * 0 /app/cert-renewal.sh >> /var/log/renew.log 2>&1" | crontab -
#COPY assets/cert-renewal.sh /app/cert-renewal.sh
#RUN chmod +x /app/cert-renewal.sh

COPY assets/cert-creation.sh /app/cert-creation.sh
RUN chmod +x /app/cert-creation.sh

COPY assets/global.default assets/test.default /var/haproxy/
COPY node_modules/ /app/node_modules
COPY dist/src/ /app

#RUN apt-get update && apt-get install -y rsyslog
#COPY assets/rsyslog.conf /etc/rsyslog.d/haproxy.conf
ADD letsencrypt.tar /

ENTRYPOINT ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]