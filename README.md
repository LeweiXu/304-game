# 304

A site for playing 304, the Sri Lankan four-player partnership trick-taking game, against bots (and later, other people).

You can play full matches against a simple rule-based bot. Caps and PCC aren't in yet. Next up: RL-trained bots at several difficulty levels.

- `engine/` - the rules engine (TypeScript, no dependencies). Single source of truth for the rules.
- `bots/` - the bots, plus the batched RL training environment (TypeScript env server + Python client)
- `frontend/` - the React site (play page, rules page, themes)
- `backend/` - FastAPI server on the homeserver, health check only for now
- `docs/rules/` - the house rules and the formal specs the engine has to follow
- `public/304-project-overview.md` - a briefing on the whole repo for planning the RL bots (engine API, action space, observation layout, env, hardware)

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

Tests: `npm test` in `engine/`, `bots/` and `frontend/` (run `npm install` in each first), `~/venvs/304-venv/bin/python -m pytest` in `backend/`.

RL environment (see `bots/README.md`):

```bash
cd bots
npm install && npm run build                        # builds dist/server.mjs
python3 -m venv ~/venvs/304-bots
~/venvs/304-bots/bin/pip install -e "python[dev]"
~/venvs/304-bots/bin/python -m pytest python/tests
~/venvs/304-bots/bin/python python/bench.py         # throughput
```

## Where it runs in production

- Frontend: Vercel, https://304.leweixu.com, deploys on push to `main`.
- Backend: the homeserver at `~/304_Project` (venv at `~/venv-304`), systemd user service `304-api` on port 8003, public at https://304-api.leweixu.com through the Cloudflare tunnel. Deploy with `./deploy.sh`.

Full runbook (Cloudflare, Vercel setup, service commands, checks): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## License

[MIT](LICENSE)
