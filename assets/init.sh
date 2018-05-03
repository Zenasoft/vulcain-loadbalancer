#!/bin/sh
set -ex

folder="/var/vulcain/initial"

if [ ! -d $folder ]; then
  cp -r -n $folder/. /etc/letsencrypt
fi

/usr/bin/supervisord -c /etc/supervisord.conf
