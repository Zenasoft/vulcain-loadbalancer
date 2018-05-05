# Running with kubernetes

Start instances in kube-system with:

```js
kubectl apply -f vulcain.yaml
```

An external ip address will be created for service **vulcain-ingress-public**

## Exposing a service as https

Let's say you want expose a service to your own personal domain name like ~~a.mydomain.com~~

First create a 'A' dns entry initialized with the **vulcain-ingress-public** ip address.

Then add the following annotations to your service description :

annotations:
  - "ingress.vulcain.io/tlsDomain": "a.mydomain.com",
  - "ingress.vulcain.io/tlsEmail": "letsencrypt mail"

**tlsEmail** must be a valid email address used to create let's encrypt certificate

You can create many services with different domain name or share a domain and use path filter

For service1:
annotations:
  - "ingress.vulcain.io/tlsDomain": "a.mydomain.com",
  - "ingress.vulcain.io/tlsEmail": "letsencrypt mail"
  - "ingress.vulcain.io/path": "/service1/"

And service2:

annotations:
  - "ingress.vulcain.io/tlsDomain": "a.mydomain.com",
  - "ingress.vulcain.io/tlsEmail": "letsencrypt mail"
  - "ingress.vulcain.io/path": "/service2/"

