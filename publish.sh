#!/bin/bash
set -e

version=1.1.23
docker build -t vulcain/load-balancer:$version .
docker push vulcain/load-balancer:$version