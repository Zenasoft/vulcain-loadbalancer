#!/bin/sh

docker run -d --name haproxy -p 80:80 \
   -v $(pwd)/data/config/test.conf:/usr/local/etc/haproxy/haproxy.cfg \
   haproxy:1.6