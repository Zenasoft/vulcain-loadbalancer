# Vulcain load-balancer

Public proxy for vulcain environnement based on haproxy with automatic letsencrypt certificat generation and renewal
To use on vulcain platform.

## Installation

``` bash
docker volume create --name Certificates

docker service create --name load-balancer -p 80:80 -p 443:443 -p 29000:29000 --network net-$env \
    -e VULCAIN_SERVER=${server} -e VULCAIN_ENV=$env -e VULCAIN_TOKEN=xxxxx -e VULCAIN_ENV_MODE=prod \
    -e EXPIRATION_EMAIL=xxx@mail.com \
    --mount type=volume,src=Certificates,dst=/etc/letsencrypt \
    vulcain/load-balancer
```

Must be in the same network than vulcain microservices.

| Variables | Description | Mandatory
|-|-|:-:
| **VULCAIN_ENV** | Vulcain environnement name | true
| **VULCAIN_TOKEN** | Valid vulcain token | true
| **VULCAIN_SERVER**  | Vulcain server address | true
| **VULCAIN_ENV_MODE** | 'test' or 'prod' (prod by default) | false
| **EXPIRATION_EMAIL** | email for letsencrypt certificate expirations | true

> test mode use only port 80 and disable certificates management.

* Accept only https connection (request on port 80 are redirected)
* port 29000 is used for management and must not be accessible from outside

## API

POST: host:29000/update : update configurations
data: see [ServiceDefinitions](src/model.ts)

GET: host:29000/restart : Restart haproxy

GET: host:29000/health : Health endpoint

GET: host:29000/infos?env=xxx : Show current configuration for a specific environment