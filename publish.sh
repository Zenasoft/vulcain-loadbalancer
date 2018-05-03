#!/bin/bash
set -e

version=2.0.0-beta04
docker build --platform linux -t vulcain/load-balancer:$version .
docker push vulcain/load-balancer:$version

docker tag vulcain/load-balancer:$version vulcain/load-balancer:latest
docker push vulcain/load-balancer:latest