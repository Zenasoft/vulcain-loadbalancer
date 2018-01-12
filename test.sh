#!/bin/sh
#docker rm -f haproxy || true

docker build -t haproxy-test -f Dockerfile.test .

docker run -d --name haproxy -p 29000:29000 -p 80:80 -e MODE=test -v $(pwd)/data/config/test.cfg:/usr/local/etc/haproxy/haproxy.cfg haproxy-test

docker logs haproxy

