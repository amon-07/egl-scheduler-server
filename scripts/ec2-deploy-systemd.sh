#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE_NAME="${SERVICE_NAME:-egl-scheduler}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.production}"
APP_USER="${APP_USER:-$(whoami)}"

log() {
  printf '[scheduler-deploy] %s\n' "$*"
}

die() {
  printf '[scheduler-deploy] error: %s\n' "$*" >&2
  exit 1
}

[[ -d "$APP_DIR" ]] || die "APP_DIR not found: $APP_DIR"
command -v node >/dev/null 2>&1 || die "node is required but not found"

NODE_BIN="$(command -v node)"

cd "$APP_DIR"

if [[ -f package-lock.json ]]; then
  log "Installing dependencies with npm ci --omit=dev"
  npm ci --omit=dev
else
  log "Installing dependencies with npm install --omit=dev"
  npm install --omit=dev
fi

if [[ -f "$ENV_FILE" ]]; then
  log "Linking env file: $ENV_FILE -> $APP_DIR/.env"
  ln -sfn "$ENV_FILE" "$APP_DIR/.env"
  chmod 600 "$ENV_FILE" || true
else
  log "Warning: env file not found at $ENV_FILE"
fi

SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
log "Writing systemd service: $SERVICE_PATH"
sudo tee "$SERVICE_PATH" >/dev/null <<EOF
[Unit]
Description=EGL Scheduler Server
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
ExecStart=$NODE_BIN src/index.js
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

log "Reloading systemd and restarting ${SERVICE_NAME}"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

log "Service status"
sudo systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,20p'

log "Deployment completed successfully"

