"""Run from the backend folder:  .venv\\Scripts\\python -m pytest -q   (or: python tests/test_api.py)"""
import os
import sys
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp, 'test.db').as_posix()}"
os.environ["ADMIN_API_KEY"] = "test-admin-key"
os.environ["GEMINI_API_KEY"] = ""
os.environ["GOOGLE_CLIENT_ID"] = "test-client.apps.googleusercontent.com"
for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASS", "GMAIL_APP_PASSWORD"):
    os.environ[k] = ""
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def test_full_auth_flow():
    with TestClient(app) as c:
        r = c.post("/api/auth/register", json={"email": "Asha@Example.com", "password": "secret12", "name": "Asha"})
        assert r.status_code == 200, r.text
        token1 = r.json()["token"]
        assert r.json()["user"]["email"] == "asha@example.com"

        # duplicate register
        assert c.post("/api/auth/register", json={"email": "asha@example.com", "password": "x" * 8}).status_code == 409
        # wrong password is rejected and logged
        assert c.post("/api/auth/login", json={"email": "asha@example.com", "password": "nope"}).status_code == 401
        # short password rejected
        assert c.post("/api/auth/register", json={"email": "b@example.com", "password": "123"}).status_code == 422

        r = c.post("/api/auth/login", json={"email": "asha@example.com", "password": "secret12"},
                   headers={"User-Agent": "pytest-browser"})
        assert r.status_code == 200
        token2 = r.json()["token"]
        assert r.json()["user"]["loginCount"] == 2

        me = c.get("/api/auth/me", headers={"Authorization": f"Bearer {token2}"})
        assert me.status_code == 200 and me.json()["user"]["displayName"] == "Asha"

        assert c.post("/api/auth/logout", headers={"Authorization": f"Bearer {token2}"}).json()["success"]
        # token no longer works after logout
        assert c.get("/api/auth/me", headers={"Authorization": f"Bearer {token2}"}).status_code == 401
        # second logout is harmless
        assert c.post("/api/auth/logout", headers={"Authorization": f"Bearer {token2}"}).status_code == 200

        hist = c.get("/api/auth/history", headers={"Authorization": f"Bearer {token1}"}).json()["events"]
        assert [e["event"] for e in hist] == ["logout", "login", "login_failed", "login", "register"]
        assert hist[1]["userAgent"] == "pytest-browser"

        # guest cannot take over a real account
        assert c.post("/api/auth/guest", json={"name": "x", "email": "asha@example.com"}).status_code == 409
        g = c.post("/api/auth/guest", json={"name": "Guest", "email": "guest@example.com"})
        assert g.status_code == 200 and g.json()["user"]["provider"] == "guest"

        # admin routes
        assert c.get("/api/admin/auth-events").status_code == 403
        adm = c.get("/api/admin/auth-events", headers={"X-Admin-Key": "test-admin-key"}).json()
        assert adm["count"] == 7
        sess = c.get("/api/admin/sessions", params={"active_only": True},
                     headers={"X-Admin-Key": "test-admin-key"}).json()["sessions"]
        assert {s["email"] for s in sess} == {"asha@example.com", "guest@example.com"}


def test_existing_routes():
    with TestClient(app) as c:
        assert c.get("/api/health").json()["status"] == "ok"
        r = c.post("/api/scan-food", json={"query": "paneer butter masala"}).json()
        assert r["success"] and r["data"]["foodName"].startswith("Paneer") and r["foodName"] == r["data"]["foodName"]
        assert c.post("/api/scan-food", json={"query": "mystery stew"}).json()["foodName"] == "Mystery Stew"

        w = c.post("/api/send-welcome-email", json={"toEmail": "asha@example.com", "userName": "<b>Asha</b>"}).json()
        assert w["success"] and w["transportType"] == "simulation"
        logs = c.get("/api/welcome-email-logs").json()
        assert logs["count"] >= 1 and logs["logs"][0]["toEmail"] == "asha@example.com"
        assert c.post("/api/send-welcome-email", json={}).status_code == 400

        a = c.post("/api/send-email-alert", json={"to": "asha@example.com", "text": "Lunch time"}).json()
        assert a["success"] and a["targetEmail"] == "asha@example.com"
        assert c.post("/api/verify-smtp", json={}).status_code == 400
        assert c.get("/api/nope").status_code == 404


class _FakeResp:
    def __init__(self, status, data):
        self.status_code, self._data = status, data

    def json(self):
        return self._data


def test_google_login(monkeypatch=None):
    """Google token is accepted only when Google says it was issued to our client ID."""
    import httpx

    def fake_get(url, params=None, headers=None, timeout=None):
        token = (params or {}).get("access_token") or (headers or {}).get("Authorization", "")[7:]
        aud = "test-client.apps.googleusercontent.com" if token == "good-token-123" else "someone-else"
        if "tokeninfo" in url:
            return _FakeResp(200, {"aud": aud, "sub": "g-42"})
        return _FakeResp(200, {"sub": "g-42", "email": "Ravi@Gmail.com", "email_verified": True,
                               "name": "Ravi", "picture": "https://example.com/p.png"})

    real_get = httpx.get
    httpx.get = fake_get
    try:
        with TestClient(app) as c:
            bad = c.post("/api/auth/google", json={"accessToken": "stolen-token-999"})
            assert bad.status_code == 401, bad.text
            r = c.post("/api/auth/google", json={"accessToken": "good-token-123"})
            assert r.status_code == 200, r.text
            u = r.json()["user"]
            assert u["email"] == "ravi@gmail.com" and u["provider"] == "google" and u["displayName"] == "Ravi"
    finally:
        httpx.get = real_get


def test_gemini_model_fallback():
    """A busy model is skipped; a refused key fails at once."""
    import asyncio

    from app import food

    class Err(Exception):
        def __init__(self, code):
            super().__init__(f"error {code}")
            self.code = code

    def client_for(codes):
        calls = []

        class Models:
            async def generate_content(self, model, contents, config):
                calls.append(model)
                code = codes[len(calls) - 1]
                if code != 200:
                    raise Err(code)
                return "answer"
        return type("C", (), {"aio": type("A", (), {"models": Models()})()})(), calls

    client, calls = client_for([503, 404, 200])
    resp, model = asyncio.run(food._generate(client, [], None))
    assert resp == "answer" and model == food.GEMINI_MODELS[2] and len(calls) == 3
    client, calls = client_for([200])  # the two busy models are skipped next time
    _, model = asyncio.run(food._generate(client, [], None))
    assert model == food.GEMINI_MODELS[2]
    food._busy_until.clear()
    client, calls = client_for([400, 200])
    try:
        asyncio.run(food._generate(client, [], None))
        raise AssertionError("a refused key must not be retried")
    except Err:
        assert len(calls) == 1



if __name__ == "__main__":
    test_full_auth_flow()
    test_existing_routes()
    test_google_login()
    test_gemini_model_fallback()
    print("all tests passed")
