"""304 API.

Bot games run entirely in the browser, so for now this only answers health
checks. It's deployed anyway so the homeserver, tunnel and CORS path is proven
before multiplayer code lands here.

Config comes from the environment (on the server: ~/304-api.env):
  CORS_ORIGINS  comma-separated list of allowed browser origins
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

DEFAULT_ORIGINS = "https://304.leweixu.com,http://localhost:5173,http://127.0.0.1:5173"


def cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ORIGINS", DEFAULT_ORIGINS)
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(title="304 API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/")
@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "304-api"}
