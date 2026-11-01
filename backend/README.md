# backend

FastAPI. Bot games run entirely in the browser, so for now this only answers `/health`. It's deployed to the homeserver anyway, so the tunnel and CORS path is proven before multiplayer code lands here.

Later this is where online games live: rooms, seating, and the authoritative copy of each game's state, so nobody can peek at other hands from their browser.

```bash
python3 -m venv ~/venvs/304-venv
~/venvs/304-venv/bin/pip install -r requirements-dev.txt
~/venvs/304-venv/bin/uvicorn main:app --reload --port 8003
~/venvs/304-venv/bin/python -m pytest
```

Config is environment variables only: `CORS_ORIGINS` (comma separated, defaults to the live site plus localhost:5173). Deploy with `../deploy.sh`; the server side is described in `../public/DEPLOYMENT.md`.
