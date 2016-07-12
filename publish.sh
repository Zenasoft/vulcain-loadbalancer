#!/bin/bash
set -e

docker build -t vulcain/load_balancer:latest .
docker push vulcain/load_balancer:latest