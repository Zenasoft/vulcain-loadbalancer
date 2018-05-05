FROM node:9-alpine as build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json /app/
RUN npm install

COPY src/ /app/src/
RUN npm run build

# ---------------------------
FROM haproxy:1.8

RUN apt-get update && apt-get upgrade -y && apt-get -y install curl supervisor cron gnupg && \
    curl -sL https://deb.nodesource.com/setup_8.x | bash - && \
    apt-get -y install nodejs && \
    curl https://dl.eff.org/certbot-auto -O && chmod a+x certbot-auto && mv certbot-auto /usr/bin/certbot && certbot --install-only -n && \
    apt-get clean && rm -rf rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

EXPOSE 1936
EXPOSE 29000
EXPOSE 443
EXPOSE 80

# Persistent volume for certificates
VOLUME /etc/letsencrypt

RUN mkdir -p /var/log/supervisor /app/letsencrypt/.well-known/acme-challenge

# Application
WORKDIR /app

COPY package.json package-lock.json tsconfig.json /app/
RUN npm install

COPY assets/supervisord.conf /etc/supervisord.conf
COPY assets/init.sh /app/init.sh
RUN chmod +x /app/init.sh

# cron job for renewal (useless since cerbot provides this functionality)
RUN echo "0 0 * * 0 /usr/bin/certbot renew --quiet --no-self-upgrade" | crontab -
#COPY assets/cert-renewal.sh /app/cert-renewal.sh
#RUN chmod +x /app/cert-renewal.sh

COPY assets/cert-creation.sh /app/cert-creation.sh
RUN chmod +x /app/cert-creation.sh

COPY assets/global.default assets/test.default /var/haproxy/
COPY --from=build /app/dist/ /app/

#ENTRYPOINT ["node", "--inspect-brk", "/app/index.js"]
ENTRYPOINT ["/app/init.sh"]