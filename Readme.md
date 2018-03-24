# Vulcain load-balancer

Public proxy based on haproxy with automatic letsencrypt certificate generation and renewal.
Kubernetes compliant. Automatic configure services based on kubernetes events.

## Installation

Create a volume to shared certificates

``` bash
docker volume create --name Certificates

docker service create --name load-balancer -p 80:80 -p 443:443 -p 29000:29000 \
    --mount type=volume,src=Certificates,dst=/etc/letsencrypt \
    vulcain/load-balancer
```

* Accept only https connection (request on port 80 are redirected)
* port 29000 is used for api management and must not be accessible publicly

| Env. variable | | |
| MODE | optional | dry-run or test. if 'test', use only port 80 and disable certificates management |
| CONFIG_FOLDER | optional | default to '/etc/vulcain/services.yml' |
| VULCAIN_SERVER| optional | See Server api |
| VULCAIN_TOKEN| optional (1) | |
| VULCAIN_ENV| optional (1) | |
| KUBERNETES_CONFIG_FILE| optional | Kubernetes config file |

> (1) Required if **VULCAIN_SERVER** is set

## API

POST: host:29000/update : update configurations
data: see [ServiceDefinitions](src/model.ts)

GET: host:29000/restart : Restart haproxy

GET: host:29000/health : Health endpoint

GET: host:29000/status : Show current configuration

## Server API

GET /api/service.config?env=
