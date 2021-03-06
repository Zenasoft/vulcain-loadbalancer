# Vulcain load-balancer

Public proxy based on haproxy with automatic letsencrypt certificate generation and renewal.
Kubernetes compliant. Automatic configure services based on kubernetes events and annotations.

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
|---------------|----|----|
| MODE | optional | 'dry-run' or 'test'. if 'test', use only port 80 and disable certificates management |
| CONFIG_FILE | optional | Initial configuration - default to '/etc/vulcain/services.yml' |
| KUBERNETES_CONFIG_FILE| optional | Kubernetes config file |
| STAGING | optional | Generate staging certificates if equals to 'true' |


## API

POST: host:29000/update : update rules

POST: host:29000/delete : delete rules

data: see [ServiceDefinitions](src/model.ts)

example:
```js
{
    "tlsEmail": "letsencrypt mail",
    rules: [
        {
            "tlsDomain": "a.mydomain.com", // A certificate will be created except if it's a sub domain of a wildcard domains
            "hostname": "a.mydomain.com", // Optional if equals to tlsDomain
            "path": "/api/", // Filter by path (optional)
            "serviceName": "service.namespace" // Kubernetes service
        }
    ]
}
```

GET: host:29000/restart : Restart haproxy

GET: host:29000/status : Show current configuration

## Kubernetes

livenessProbe : GET http://localhost:29000/healthz

### Using annotations for registering service automatically

See [Kubernetes](./kubernetes/Readme.md)


