#!/bin/bash
set -e

version=1.1.11
docker build -t vulcain/load-balancer:$version .
docker push vulcain/load-balancer:$version