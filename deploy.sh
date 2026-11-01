#!/usr/bin/env bash
# Push backend/ to the homeserver and (re)start its systemd user service.
# Frontend deploys separately: Vercel builds it on every push to main.
#
# On the server:
#   ~/304_Project/      the synced backend code (rsync --delete, so don't keep state here)
#   ~/venv-304/         Python venv, created on first deploy
#   ~/304-api.env       config (CORS_ORIGINS), created on first deploy, never overwritten
#   ~/.config/systemd/user/304-api.service
set -euo pipefail

SERVER="${SERVER:-homeserver}"   # ssh alias from ~/.ssh/config
DEST="304_Project"
SERVICE="304-api"
PORT=8003
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_OPTS=(-o BatchMode=yes)

echo "Syncing backend to $SERVER:~/$DEST"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude-from="$HERE/backend/deploy-exclude.txt" \
  "$HERE/backend/" "$SERVER:$DEST/"

echo "Installing deps and restarting $SERVICE"
ssh "${SSH_OPTS[@]}" "$SERVER" bash -s -- "$DEST" "$SERVICE" "$PORT" <<'REMOTE'
set -euo pipefail
dest="$1"; service="$2"; port="$3"
venv="$HOME/venv-304"
envfile="$HOME/304-api.env"

[ -x "$venv/bin/python" ] || python3 -m venv "$venv"
"$venv/bin/pip" install -q --upgrade pip
"$venv/bin/pip" install -q -r "$HOME/$dest/requirements.txt"
"$venv/bin/python" -m compileall -q "$HOME/$dest"

if [ ! -f "$envfile" ]; then
  printf 'CORS_ORIGINS=https://304.leweixu.com,http://localhost:5173,http://127.0.0.1:5173\n' > "$envfile"
fi
chmod 600 "$envfile"

mkdir -p "$HOME/.config/systemd/user"
cp "$HOME/$dest/$service.service" "$HOME/.config/systemd/user/$service.service"
systemctl --user daemon-reload
systemctl --user enable "$service" >/dev/null
systemctl --user restart "$service"
for _ in {1..30}; do
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
