from fastapi.testclient import TestClient

from main import app, cors_origins

client = TestClient(app)


def test_health():
    for path in ("/", "/health"):
        res = client.get(path)
        assert res.status_code == 200
        assert res.json() == {"ok": True, "service": "304-api"}


def test_cors_allows_the_site():
    res = client.options(
        "/health",
        headers={"Origin": "https://304.leweixu.com", "Access-Control-Request-Method": "GET"},
    )
    assert res.headers["access-control-allow-origin"] == "https://304.leweixu.com"


def test_cors_rejects_strangers():
    res = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in res.headers


def test_cors_origins_from_env(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", " https://a.example , ,https://b.example")
    assert cors_origins() == ["https://a.example", "https://b.example"]
