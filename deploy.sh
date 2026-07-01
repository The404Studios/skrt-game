#!/bin/bash
# SKRT Derby — Production Deploy Script
# Uses gunicorn + nginx to serve on port 80/443
# Run as root or with sudo

set -e

APP_DIR="/opt/skrt-game"
DOMAIN="skrt.online"
USER="${SUDO_USER:-$USER}"

echo "=== SKRT Derby Deploy ==="

# 1. Install dependencies
echo "[1/5] Installing system packages..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv nginx certbot python3-certbot-nginx

# 2. Setup app
echo "[2/5] Setting up app..."
mkdir -p "$APP_DIR"
cp -r . "$APP_DIR"
cd "$APP_DIR"

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Create systemd service
echo "[3/5] Creating systemd service..."
cat > /etc/systemd/system/skrt-derby.service << 'SERVICE'
[Unit]
Description=SKRT Derby Game Server
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/skrt-game
ExecStart=/opt/skrt-game/venv/bin/gunicorn -w 4 -k geventwebsocket.gunicorn.workers.GeventWebSocketWorker -b 127.0.0.1:8000 server:app
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable skrt-derby
systemctl restart skrt-derby

# 4. Configure nginx
echo "[4/5] Configuring nginx..."
cat > /etc/nginx/sites-available/skrt-derby << 'NGINX'
server {
    listen 80;
    server_name skrt.online www.skrt.online;

    # Game WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # Static files
    location /static/ {
        alias /opt/skrt-game/static/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # Everything else to Flask
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/skrt-derby /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 5. SSL via certbot
echo "[5/5] Setting up SSL..."
certbot --nginx -d skrt.online -d www.skrt.online --non-interactive --agree-tos --email admin@skrt.online || echo "SSL skipped (domain not pointed yet)"

echo ""
echo "=== Deploy Complete ==="
echo "Game running at: http://skrt.online"
echo "Check status: systemctl status skrt-derby"
echo "View logs: journalctl -u skrt-derby -f"
