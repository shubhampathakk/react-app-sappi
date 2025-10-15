#!/bin/sh

# This command finds the nginx.conf.template, replaces the ${PORT} variable
# with the actual port number from the environment, and creates the final
# config file that Nginx will use.
envsubst '${PORT}' < /etc/nginx/conf.d/nginx.conf.template > /etc/nginx/conf.d/default.conf

# This command starts the Nginx web server in the foreground, which is
# required for the container to keep running in Cloud Run.
nginx -g 'daemon off;'

