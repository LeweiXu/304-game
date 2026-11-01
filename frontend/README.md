# frontend

The browser app: the table, the cards, the rules engine and the bots. Everything you need to play against bots runs here, with no server.

Nothing is scaffolded yet. The plan (still being decided) is Vite + TypeScript, with the pure rules engine under `src/engine/` and bots under `src/bots/`. Static assets (card art, fonts, favicon) go in `frontend/public/`, which is what Vite serves as-is.
