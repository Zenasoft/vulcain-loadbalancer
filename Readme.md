# Vulcain load-balancer

Public proxy for vulcain environnement based on haproxy with automatic letsencrypt certificat generation and renewal

## Installation

``` bash
docker volume create --name Certificates

docker service create --name load-balancer -p 80:80 -p 443:443 -p 29000:29000 --network net-$cluster \
    -e VULCAIN_SERVER=${server} -e VULCAIN_CLUSTER=$cluster -e VULCAIN_TOKEN=xxxxx \
    --mount type=volume,src=Certificates,dst=/etc/letsencrypt \
    vulcain/load_balancer
```

* **VULCAIN_CLUSTER** : A valid environnement name in vulcain
* **VULCAIN_TOKEN**   : A token with
* **VULCAIN_CLUSTER** : A valid environnement name in vulcain


* Accept only https connection (request on port 80 are redirected)
* port 29000 is used for management and can not be accessible from outside

## API

POST: host:29000/update : update configurations
data: see [ServiceDefinitions](src/model.ts)

GET: host:29000/restart : Restart haproxy