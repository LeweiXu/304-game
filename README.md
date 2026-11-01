# 304

A site for playing 304, the Sri Lankan four-player partnership trick-taking game, against bots (and later, other people).

Very early days. The old site from the upstream fork has been cleared out; only the rules docs survived.

- `frontend/` - the browser app (game table, engine, bots)
- `backend/` - multiplayer server, later
- `docs/rules/` - the house rules and the formal specs the engine has to follow
- `design-*.html` - three throwaway design mockups, open them straight in a browser

## Running it locally

Backend (no install needed, just Node 18+):

```bash
node backend/server.mjs          # http://localhost:8003/health
```

Frontend: not scaffolded yet. Once it is, it'll be the usual Vite flow:

```bash
cd frontend
npm install
npm run dev                      # http://localhost:5173
```

The frontend finds the backend through `VITE_API_BASE`: `frontend/.env.development` points at `http://localhost:8003`, `frontend/.env.production` at `https://304-api.leweixu.com`. Bot games won't need the backend at all.

## Where it runs in production

- Frontend: Vercel, https://304.leweixu.com, deploys on push to `main`.
- Backend: the homeserver at `~/304_Project`, systemd user service `304-api` on port 8003, public at https://304-api.leweixu.com through the Cloudflare tunnel. Deploy with `./deploy.sh`.

Full runbook (Cloudflare, Vercel setup, service commands, checks): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## License

[MIT](LICENSE)
