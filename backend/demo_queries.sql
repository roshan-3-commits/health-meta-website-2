-- Health-Meta: demo SQL queries
-- Run all:      .venv\Scripts\python show_data.py
-- Run one:      .venv\Scripts\python show_data.py "SELECT * FROM users"
-- Each query below needs a "-- title:" line above it.

-- title: 1. All tables in the database
SELECT name AS table_name FROM sqlite_master WHERE type = 'table' ORDER BY name;

-- title: 2. Registered users (password is stored only as a hash)
SELECT id, name, email, provider, login_count, created_at, last_login_at, last_logout_at
FROM users
ORDER BY id;

-- title: 2b. How passwords are stored (scrypt hash, never the real password)
SELECT email, provider, password_hash
FROM users
WHERE provider = 'password'
ORDER BY id;

-- title: 3. Every login session (one row per login)
SELECT s.id, u.email, s.provider, s.ip_address, s.created_at AS logged_in,
       s.logged_out_at AS logged_out, s.logout_reason
FROM sessions s
JOIN users u ON u.id = s.user_id
ORDER BY s.id DESC;

-- title: 4. Who is logged in right now
SELECT u.name, u.email, s.created_at AS logged_in, s.expires_at
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.logged_out_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP;

-- title: 5. Full login / logout history (latest first)
SELECT id, event, email, provider, detail, ip_address, created_at
FROM auth_events
ORDER BY id DESC
LIMIT 20;

-- title: 6. Failed login attempts
SELECT email, detail AS reason, ip_address, created_at
FROM auth_events
WHERE event = 'login_failed'
ORDER BY id DESC;

-- title: 7. Count of each event type
SELECT event, COUNT(*) AS total
FROM auth_events
GROUP BY event
ORDER BY total DESC;

-- title: 8. Emails sent by the app
SELECT id, kind, to_email, subject, status, created_at
FROM email_logs
ORDER BY id DESC
LIMIT 20;
