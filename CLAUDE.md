# 304

A website for playing 304 (a Sri Lankan four-player partnership trick-taking card game) in the browser. First target is single player against three bots. Online multiplayer with real people comes later, so don't build for it yet, but don't paint us into a corner either.

This repo started as a fork of a friend's 304 project. That code is gone; only the rules docs were kept. Don't go digging through git history to resurrect the old engine or apps unless asked.

## Layout

```
frontend/     browser app: UI, rules engine, bots. Everything needed for bot games.
  public/     static assets Vite serves as-is (card art, fonts, favicon)
  vercel.json, .env.production   Vercel config, API base url
backend/      multiplayer server. Just a health check until we do multiplayer.
  304-api.service   systemd user unit installed on the homeserver
deploy.sh     pushes backend/ to the homeserver and restarts it
docs/rules/   the rules. Source of truth for what the engine must do.
docs/DEPLOYMENT.md   how the hosting fits together
design-*.html throwaway design mockups at the repo root, delete once a direction is picked
```

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

## Hosting

- Frontend: Vercel, root dir `frontend/`, at https://304.leweixu.com. Deploys on push to `main`.
- Backend: homeserver (`homeserver` ssh alias), systemd user service `304-api` on port 8003, exposed as https://304-api.leweixu.com through the shared Cloudflare tunnel. Deploy with `./deploy.sh`. Node 18 on the server.
- Same setup as the logarium and webnovels projects in `~/personal_projects/`. Details in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Working here

- Test the engine hard (rule edge cases from rules.md make good test cases). Tests prove the code runs, not that the UI looks right, so for UI changes actually open it in a browser and look.
- Commit each finished, test-green piece of work directly on `main`. Stage specific files, never `git add -A`.
- Pushing to `main` deploys the frontend, so only push when a change should go live (or when asked).
- Deploying the backend (`./deploy.sh`) touches the homeserver; fine for backend changes, but say when you've done it.
- No auto-commit hooks in this repo.
