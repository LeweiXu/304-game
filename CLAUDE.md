# 304

A website for playing 304 (a Sri Lankan four-player partnership trick-taking card game) in the browser. First target is single player against three bots. Online multiplayer with real people comes later, so don't build for it yet, but don't paint us into a corner either.

This repo started as a fork of a friend's 304 project. That code is gone; only the rules docs were kept. Don't go digging through git history to resurrect the old engine or apps unless asked.

## Layout

```
frontend/     React + Vite + TS site: play page (game frame), rules page, themes. See frontend/README.md
  vercel.json, .env.*   Vercel config, API base url per environment
backend/      FastAPI app (main.py). Health check only until multiplayer.
  304-api.service   systemd user unit installed on the homeserver
engine/       rules engine, pure TS, no runtime deps. The frontend imports it as `@engine`. See engine/README.md
bots/         bots (naive.ts) + RL env: observation encoder, batched VecEnv, Node env server, Python client in bots/python. Frontend imports bots as `@bots`. See bots/README.md
public/       304-project-overview.md: repo briefing for RL planning. Keep it in sync when the engine API, action space, observation or env change.
deploy.sh     pushes backend/ to the homeserver, installs deps, restarts it
docs/rules/   the rules. Source of truth for the engine and for the rules page.
docs/DEPLOYMENT.md   how the hosting fits together
```

## Decisions so far

- Frontend: React (Vite + TypeScript). Backend: FastAPI. Engine: its own top-level `engine/`, worked on separately from the site.
- Look and feel comes from the original site in the fork: Crimson Pro body, Inter headings, house-rule badges, § tags. Four colour themes (graphite default, parchment, tea, indigo), each with light and dark; users pick in the nav.
- The rules page renders `docs/rules/rules.md` directly, so rules changes are markdown edits.
- The play page will be a box for the game inside that site shell. Its design is still open.
- Bots: `bots/src/naive.ts` is the placeholder. Next: RL-trained agents at several difficulty levels, trained in Python against `bots/` (Node env server, numpy client). Training most likely on the dev machine (RTX 5070).
- Not implemented yet: caps, PCC, absolute hand, Spoilt Trumps calls, penalties. Games always play all 8 rounds.

## Rules are the source of truth

- [docs/rules/rules.md](docs/rules/rules.md): the house rules, written for people. Bidding, trump, play, caps, scoring.
- [docs/rules/play_invariants.md](docs/rules/play_invariants.md): what must hold at every play-phase state and every legal move.
- [docs/rules/caps_formalism.md](docs/rules/caps_formalism.md): the formal definition of caps (single-dummy, per information set).

If code and these docs disagree, the docs win, or we change the docs on purpose first. Rule numbers like `§B-4` are worth citing in code comments and test names.

## Engine principles

- The rules engine is pure TypeScript with no DOM, no framework, no timers. State in, action in, new state out. The UI and the bots both sit on top of it.
- Hidden information matters. Each seat only ever sees its own projected view of the state (own hand, public plays, face-down trump hidden). Bots get that same view, never the full deal, so they can't cheat and so the same code works later when a server holds the real state.
- Bots are deterministic given (their view, rng seed). Use a seeded RNG, never `Math.random()` inside engine or bot code.
- Heavy bot thinking runs in a Web Worker so the table never freezes.
- Keep it RL-friendly: `engine/src/actions.ts` numbers every action and builds a legal mask, `viewFor` is the observation, `apply` is the step. Training will probably happen in Python, so don't let the engine depend on anything browser-only.
- `legalActions` is the single authority on what's allowed. UI and bots pick from it; never re-derive rules in the frontend.

## Hosting

- Frontend: Vercel, root dir `frontend/`, at https://304.leweixu.com. Deploys on push to `main`.
- Backend: homeserver (`homeserver` ssh alias) at `~/304_Project`, systemd user service `304-api` on port 8003, exposed as https://304-api.leweixu.com through the shared Cloudflare tunnel. Deploy with `./deploy.sh`. Python 3.12 venv at `~/venv-304`, config in `~/304-api.env`.
- Same setup as the logarium and webnovels projects in `~/personal_projects/`. Details in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Local dev: backend `uvicorn main:app --reload --port 8003` from the `~/venvs/304-venv` venv, frontend `npm run dev` (port 5173). Tests: `npm test` in engine, bots and frontend; `pytest` in backend and bots/python (venv `~/venvs/304-bots`, needs `npm run build` in bots first). See the README.

## Working here

- Test the engine hard (rule edge cases from rules.md make good test cases). Tests prove the code runs, not that the UI looks right, so for UI changes actually open it in a browser and look.
- Commit each finished, test-green piece of work directly on `main`. Stage specific files, never `git add -A`.
- Pushing to `main` deploys the frontend, so only push when a change should go live (or when asked).
- Deploying the backend (`./deploy.sh`) touches the homeserver; fine for backend changes, but say when you've done it.
- No auto-commit hooks in this repo.
