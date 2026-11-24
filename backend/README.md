# Health-Meta Python Backend

FastAPI + SQLAlchemy. It replaces the old Node `server.ts` and adds real accounts
with saved login / logout history.

## Run it locally (Windows)

```powershell
# one time
cd backend
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env          # then edit .env

# every time - terminal 1 (backend, port 8000)
npm run backend

# terminal 2 (frontend, port 3000; /api is proxied to the backend)
npm run dev
```

Open http://localhost:3000. API docs (try every route in the browser): http://localhost:8000/docs

Run the tests: `cd backend && .venv\Scripts\python tests\test_api.py`

## What is saved

Database: `backend/healthmeta.db` (SQLite) unless `DATABASE_URL` is set.

| Table | What it holds |
|---|---|
| `users` | email, name, provider (password / google / guest), scrypt password hash, created, last login, last logout, login count |
| `sessions` | one row per login: IP, browser, login time, last seen, expiry, logout time and reason (`user` or `expired`) |
| `auth_events` | every `register`, `login`, `login_failed` (with reason), `logout`, with time, IP and browser |
| `email_logs` | every welcome / alert email and whether it was sent |

Passwords are never stored in plain text. Session tokens are stored only as SHA-256 hashes.

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | `{email, password, name}` → `{token, user}` |
| POST | `/api/auth/login` | `{email, password}` → `{token, user}` |
| POST | `/api/auth/google` | `{accessToken}` from Google sign-in; checked with Google against GOOGLE_CLIENT_ID |
| POST | `/api/auth/guest` | `{name, email}`; refused if the email has a real account |
| POST | `/api/auth/logout` | header `Authorization: Bearer <token>` |
| GET | `/api/auth/me` | current user |
| GET | `/api/auth/history` | this user's login/logout events |
| GET | `/api/admin/auth-events?email=&event=` | all events; header `X-Admin-Key: <ADMIN_API_KEY>` |
| GET | `/api/admin/sessions?active_only=true` | who is logged in now |
| POST | `/api/scan-food`, `/api/send-email-alert`, `/api/send-welcome-email`, `/api/verify-smtp` | same as the old Node server |
| GET | `/api/welcome-email-logs`, `/api/health` | same as the old Node server |

Example, see the last 20 logins:

```powershell
curl -H "X-Admin-Key: YOUR_KEY" "http://localhost:8000/api/admin/auth-events?event=login&limit=20"
```

## Production

Deploy on Vercel with a Neon Postgres database: see [../DEPLOY.md](../DEPLOY.md).
`api/index.py` (project root) loads this app; `vercel.json` sends every `/api/...` request to it.

You can also run it on any server: `npm run build`, then `npm start` (port 8000). The backend
serves `dist/` too. Behind nginx, set `TRUST_PROXY=1` so real client IPs are saved.
