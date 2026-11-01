# 304

A site for playing 304, the Sri Lankan four-player partnership trick-taking game, against bots (and later, other people).

You can play full matches against a simple bot. Caps and PCC aren't in yet.

- `frontend/` - the React site (play page, rules page, themes)
- `backend/` - FastAPI server on the homeserver, health check only for now
- `engine/` - the rules engine and bots (TypeScript, no dependencies)
- `docs/rules/` - the house rules and the formal specs the engine has to follow

## Running it locally

Backend (Python 3.12):

```bash
cd backend
python3 -m venv ~/venvs/304-venv
~/venvs/304-venv/bin/pip install -r requirements-dev.txt
~/venvs/304-venv/bin/uvicorn main:app --reload --port 8003    # http://localhost:8003/health
```

Frontend (Node 22+), in another terminal:

```bash
cd frontend
npm install
npm run dev                      # http://localhost:5173
```

The frontend finds the backend through `VITE_API_BASE`: `frontend/.env.development` points at `http://localhost:8003`, `frontend/.env.production` at `https://304-api.leweixu.com`.

Tests: `npm test` in `engine/` and `frontend/` (run `npm install` in each first), `~/venvs/304-venv/bin/python -m pytest` in `backend/`.

## Where it runs in production

- Frontend: Vercel, https://304.leweixu.com, deploys on push to `main`.
- Backend: the homeserver at `~/304_Project` (venv at `~/venv-304`), systemd user service `304-api` on port 8003, public at https://304-api.leweixu.com through the Cloudflare tunnel. Deploy with `./deploy.sh`.

Full runbook (Cloudflare, Vercel setup, service commands, checks): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## License

[MIT](LICENSE)
