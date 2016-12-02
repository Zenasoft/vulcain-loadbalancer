#!/bin/sh
docker rm -f haproxy || true

docker build -t haproxy-test -f Dockerfile.test .

docker run -d --name haproxy -p 9090:9090 \
   -v $(pwd)/data/config/test.conf:/usr/local/etc/haproxy/haproxy.cfg \
   haproxy-test