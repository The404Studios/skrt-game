#!/bin/bash
# SKRT Derby — Quick Tunnel
# Expose local :5000 to the internet via serveo.net
# Accessible at: https://{random}.serveo.net

LOCAL_PORT="${1:-5000}"
SUBDOMAIN="${2:-skrt}"

echo "[TUNNEL] Exposing localhost:$LOCAL_PORT to internet..."

# Try to use a custom subdomain
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R "${SUBDOMAIN}:80:localhost:${LOCAL_PORT}" serveo.net 2>&1 | while read line; do
    echo "[TUNNEL] $line"
    if echo "$line" | grep -q "Forwarding"; then
        URL=$(echo "$line" | grep -oP 'https?://[^\s]+')
        echo "[TUNNEL] Public URL: $URL"
    fi
done
