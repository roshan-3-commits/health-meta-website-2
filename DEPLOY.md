# Deploy Health-Meta: GitHub + Vercel + Neon

When you finish, the app is live at `https://<your-project>.vercel.app`, and every
signup and login is saved in an online Postgres database. Each `git push` updates the
site automatically. Everything below is free.

You need: a GitHub account, Git, and Node.js 20 or newer.

---

## 1. Put the code on GitHub

1. Create an **empty** repository on https://github.com/new. Don't add a README,
   .gitignore or license.
2. Open **Windows PowerShell** (not the VS Code terminal) in this project folder and run:

   ```powershell
   git init
   git config user.name  "Your Name"
   git config user.email "you@example.com"
   git add .
   git commit -m "Health-Meta: Python backend + SQL database"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

3. If GitHub asks you to sign in, choose **Sign in with your browser**. If it asks for a
   password, paste a token from https://github.com/settings/tokens/new with the `repo`
   box ticked. Your normal GitHub password does not work there.

## 2. Create the project on Vercel

1. Go to https://vercel.com and choose **Sign up / Log in with GitHub**.
2. Click **Add New → Project** and **Import** your repository.
3. Leave all settings as they are. `vercel.json` already sets them:
   - the website is built by Vite into `dist/`
   - the Python API lives in `api/index.py` and answers every `/api/...` request
4. Click **Deploy** and wait about 2 minutes.

## 3. Add the SQL database (Neon Postgres)

Without this step, signups are lost whenever Vercel restarts the API.

1. In your Vercel project, open the **Storage** tab, click **Create Database**, choose
   **Neon (Postgres)**, then **Continue**.
2. Pick the free plan and the region closest to your users (e.g. Singapore or Mumbai),
   then **Create**.
3. When asked, **connect it to your project** with all environments ticked. Vercel then
   adds `DATABASE_URL` to the project for you.
4. Open **Deployments**, click **⋯** on the latest deployment, and choose **Redeploy**.

The tables (`users`, `sessions`, `auth_events`, `email_logs`) are created automatically
on the first request.

## 4. Environment variables (Vercel → Settings → Environment Variables)

| Name | Needed? | Value |
|---|---|---|
| `DATABASE_URL` | yes | Added automatically in step 3 |
| `ADMIN_API_KEY` | recommended | A long random password; turns on `/api/admin/...` |
| `GEMINI_API_KEY` | optional | Gemini key for the AI food scanner (kept on the server) |
| `GOOGLE_CLIENT_ID` | optional | See step 5 |
| `VITE_GOOGLE_CLIENT_ID` | optional | The same value as `GOOGLE_CLIENT_ID` |
| `GMAIL_APP_PASSWORD`, `WELCOME_FROM_EMAIL` | optional | To really send welcome emails from Gmail |

Do **not** set `VITE_GEMINI_API_KEY` on Vercel. Anything starting with `VITE_` is visible
to every visitor of the site.

After changing variables, **Redeploy** (Deployments → ⋯ → Redeploy).

## 5. Optional: "Continue with Google" button

The button stays hidden until this is set up. Email/password works without it.

1. Go to https://console.cloud.google.com, create a project, then open
   **APIs & Services → OAuth consent screen**, choose External, fill in the app name
   and your email, and save.
2. Open **Credentials → Create credentials → OAuth client ID** and choose
   **Web application**.
3. Under **Authorized JavaScript origins**, add:
   - `https://<your-project>.vercel.app`
   - `http://localhost:3000`
4. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`) into both
   `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` on Vercel, then **Redeploy**.

## 6. Check it works

1. Open `https://<your-project>.vercel.app/api/health`. It should show `{"status":"ok",...}`.
2. Open the site, **Create Account**, log out and log in again.
3. See the saved rows:
   - **In the browser:** Vercel → Storage → your database → **Open in Neon** →
     **SQL Editor**, then run `SELECT id, name, email, provider, login_count, created_at FROM users;`
     (more queries: `backend/demo_queries.sql`)
   - **From your computer:** put the same `DATABASE_URL` in `backend/.env` and run
     `.venv\Scripts\python show_data.py`

## 7. The GitHub link (`github.io`)

Every push to `main` also publishes the website on GitHub Pages
(`.github/workflows/main.yml`).

1. In the GitHub repository: **Settings -> Pages -> Source: GitHub Actions** (once).
2. The **Actions** tab shows the deploy; when it is green the link is
   `https://<your-username>.github.io/<your-repo>/`.

GitHub cannot run the Python backend, so choose one:

- **Not connected to a backend:** signup and login work, but each account is saved only in
  the visitor's own browser. Nothing goes into the SQL database, and the account does not
  exist on other devices. The sign-in window says so.
- **Connected to your Vercel backend (accounts in SQL):**
  1. GitHub repository: **Settings -> Secrets and variables -> Actions -> Variables ->
     New repository variable**: name `API_URL`, value `https://<your-project>.vercel.app`
     (no slash at the end).
  2. If your GitHub username is not `roshan-3-commits`, set `CORS_ORIGINS` on Vercel to
     `https://<your-username>.github.io` and Redeploy.
  3. **Actions -> Deploy Health-Meta to GitHub Pages -> Run workflow**.

## Updating the live site

```powershell
git add .
git commit -m "describe the change"
git push
```

Vercel redeploys automatically in about 2 minutes.

## Problems?

| You see | Fix |
|---|---|
| `Request failed (405)` on a `github.io` link | That link still has the old code. Push this version to that repository and wait for the **Actions** tab to finish. |
| `The Health Meta server is not available` | The address in the `API_URL` variable is wrong, or the backend is down. Open `<that address>/api/health`. |
| `Cannot reach the server` on a `github.io` link | Add your `https://<username>.github.io` to `CORS_ORIGINS` on Vercel, then Redeploy. |
| Signups disappear | `DATABASE_URL` is missing; do step 3, then Redeploy. |
| `Google sign-in is not set up on the server` | Set `GOOGLE_CLIENT_ID` (step 5) and Redeploy. |
| Google popup error `origin_mismatch` | Add your exact `vercel.app` address to Authorized JavaScript origins. |
| Anything else | Vercel → your project → **Logs** shows the Python error. |
