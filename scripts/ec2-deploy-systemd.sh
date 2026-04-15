#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE_NAME="${SERVICE_NAME:-egl-scheduler}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
APP_USER="${APP_USER:-$(whoami)}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4010/health}"
HEALTH_TIMEOUT_SEC="${HEALTH_TIMEOUT_SEC:-60}"

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

[[ -s "$ENV_FILE" ]] || die "Required env file missing or empty: $ENV_FILE"
chmod 600 "$ENV_FILE" || true

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

log "Waiting for health check: $HEALTH_URL (timeout ${HEALTH_TIMEOUT_SEC}s)"
start_ts="$(date +%s)"
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  now_ts="$(date +%s)"
  elapsed="$((now_ts - start_ts))"
  if (( elapsed >= HEALTH_TIMEOUT_SEC )); then
    sudo journalctl -u "$SERVICE_NAME" -n 120 --no-pager || true
    die "Service did not become healthy within ${HEALTH_TIMEOUT_SEC}s"
  fi
  sleep 2
done

log "Health check passed"

log "Deployment completed successfully"
