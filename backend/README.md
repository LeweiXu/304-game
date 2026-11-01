# backend

Empty on purpose for now. Bot games run fully in the browser, so there's no server until we add online multiplayer.

When we do, this is where the game server lives: rooms, seating, and the authoritative copy of each game's state (so nobody can peek at other hands from their browser). The idea is that it runs the same rules engine as the frontend rather than a second implementation.
