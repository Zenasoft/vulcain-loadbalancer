#!/bin/sh

docker build -t hub.sovinty.com/vulcain/haproxy:1.7 .
docker push hub.sovinty.com/vulcain/haproxy:1.7