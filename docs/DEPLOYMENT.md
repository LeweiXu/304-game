# Deployment

Same shape as LOG, G8 and the novels app: frontend on Vercel, backend on the homeserver behind the shared Cloudflare tunnel.

| Piece | Where | URL |
|---|---|---|
| Frontend | Vercel, root directory `frontend/` | https://304.leweixu.com |
| Backend | homeserver (`homeserver` ssh alias, 192.168.20.17), `localhost:8003` | https://304-api.leweixu.com |

Ports 8000 (G8), 8001 (LOG) and 8002 (novels) were taken, so 304 uses **8003**.

## Backend

Lives on the server at `~/304_Project/`, runs as the systemd user service `304-api` (lingering is on, so it survives reboots). Right now it's a zero-dependency Node script that only answers `/health`, since bot games don't need a server. The homeserver has Node 18.

Deploy (from WSL, at the repo root):

```bash
./deploy.sh      # rsync backend/ to the server, install the unit, restart, health check
```

Server-side config goes in `~/304-api.env` (outside the synced folder, so `rsync --delete` never wipes it). Things it can set: `PORT`, `CORS_ORIGINS` (comma separated, defaults to the Vercel domain plus localhost:5173).

```bash
ssh homeserver 'systemctl --user status 304-api'
ssh homeserver 'journalctl --user -u 304-api -f'
```

## Cloudflare

The tunnel is `1cbaa714-8ef3-4abf-a888-3e7dc29b936d` (token based, edited in the dashboard under Zero Trust, Networks, Tunnels). Published application `304-api.leweixu.com` points at `http://localhost:8003`, with a proxied CNAME to `1cbaa714-8ef3-4abf-a888-3e7dc29b936d.cfargotunnel.com`.

For the Cloudflare 404 vs 502 troubleshooting notes, see `~/personal_projects/logarium/CLOUDFLARE.md`; it's the same tunnel.

## Frontend (Vercel)

1. New Vercel project from this repo, **Root Directory** `frontend`, preset Vite.
2. `VITE_API_BASE` comes from the committed `frontend/.env.production`. If you also set it in the Vercel dashboard, the dashboard value wins.
3. Add the custom domain `304.leweixu.com` in Vercel, then the CNAME it asks for in the `leweixu.com` Cloudflare zone (DNS only, not proxied).
4. `frontend/vercel.json` rewrites everything to `index.html` for SPA routing.

Vercel redeploys on every push to `main`.

## Checks

```bash
curl https://304-api.leweixu.com/health
# {"ok":true,"service":"304-api"}
curl -s -D - -o /dev/null -X OPTIONS -H 'Origin: https://304.leweixu.com' \
  -H 'Access-Control-Request-Method: POST' https://304-api.leweixu.com/health | grep -i allow-origin
```
