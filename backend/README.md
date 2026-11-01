# backend

Bot games run fully in the browser, so for now this is just `server.mjs`, a no-dependency Node script that answers `/health`. It's deployed to the homeserver (see `../docs/DEPLOYMENT.md`) so the hosting path is proven before any multiplayer code exists.

When we do, this is where the game server lives: rooms, seating, and the authoritative copy of each game's state (so nobody can peek at other hands from their browser). The idea is that it runs the same rules engine as the frontend rather than a second implementation.
