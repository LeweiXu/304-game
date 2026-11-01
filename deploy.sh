#!/usr/bin/env bash
# Push backend/ to the homeserver and (re)start its systemd user service.
# Frontend deploys separately: Vercel builds it on every push to main.
set -euo pipefail

SERVER="${SERVER:-homeserver}"   # ssh alias from ~/.ssh/config
DEST="304_Project/"              # relative to the server's home
SERVICE="304-api"
PORT=8003
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_OPTS=(-o BatchMode=yes)

echo "Syncing backend to $SERVER:~/$DEST"
rsync -avz --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude-from="$HERE/backend/deploy-exclude.txt" \
  "$HERE/backend/" "$SERVER:$DEST"

echo "Installing and restarting $SERVICE"
ssh "${SSH_OPTS[@]}" "$SERVER" bash -s -- "$DEST" "$SERVICE" "$PORT" <<'REMOTE'
set -euo pipefail
dest="$1"; service="$2"; port="$3"
mkdir -p "$HOME/.config/systemd/user"
cp "$HOME/$dest/$service.service" "$HOME/.config/systemd/user/$service.service"
systemctl --user daemon-reload
systemctl --user enable "$service" >/dev/null
systemctl --user restart "$service"
for _ in {1..20}; do
  if curl --fail --silent "http://127.0.0.1:$port/health" >/dev/null; then
    systemctl --user is-active "$service"
    exit 0
  fi
  sleep 0.5
done
systemctl --user status "$service" --no-pager -n 30
echo "The API did not pass its health check." >&2
exit 1
REMOTE

echo "Done. Public check: curl https://304-api.leweixu.com/health"
