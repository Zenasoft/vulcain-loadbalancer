#!/bin/bash
set -e

version=2.0.0-beta03
docker build -t vulcain/load-balancer:$version .
docker push vulcain/load-balancer:$version