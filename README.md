# Health-Meta

Calorie calculator, AI food scanner, meal and workout tracker, streaks and meal reminders.

- **Frontend:** React + Vite (`src/`)
- **Backend:** Python FastAPI (`backend/`), served on Vercel from `api/index.py`
- **Database:** SQL. A local SQLite file when developing; Postgres (Neon) when live on Vercel.
  Every signup, login, failed login and logout is saved. Passwords are stored only as one-way hashes.

## Run it on your computer (Windows)

```powershell
# one time
npm install
cd backend
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env
cd ..

# every time: two terminals
npm run backend   # terminal 1: API on http://localhost:8000
npm run dev       # terminal 2: app on http://localhost:3000
```

## Put it online

Follow **[DEPLOY.md](DEPLOY.md)**: GitHub + Vercel + a free Neon Postgres database, about 15 minutes.

## See the stored data (SQL)

```powershell
cd backend
.venv\Scripts\python show_data.py                          # all demo queries
.venv\Scripts\python show_data.py "SELECT * FROM users"    # your own query
```

It reads the local database, or the online one when `DATABASE_URL` is set in `backend/.env`.
The demo queries are in [backend/demo_queries.sql](backend/demo_queries.sql).
Tables, API routes and more: [backend/README.md](backend/README.md).
