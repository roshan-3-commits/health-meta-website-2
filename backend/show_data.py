"""Show what is stored in the Health-Meta database, using plain SQL.

Usage (from the backend folder):
  .venv\\Scripts\\python show_data.py                  run every query in demo_queries.sql
  .venv\\Scripts\\python show_data.py "SELECT ..."     run your own query
  .venv\\Scripts\\python show_data.py -i               type queries live (empty line to quit)

Which database:
  - Local SQLite file backend/healthmeta.db (default)
  - The online (Vercel / Neon) Postgres database, if DATABASE_URL is set in backend/.env
Opened read-only, so nothing can be changed or deleted by mistake.
"""
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")
QUERIES_FILE = HERE / "demo_queries.sql"
SQLITE_PATH = HERE / "healthmeta.db"
MAX_CELL = 40

PG_TABLES_SQL = (
    "SELECT table_name FROM information_schema.tables "
    "WHERE table_schema = 'public' ORDER BY table_name"
)


def make_engine():
    url = (os.getenv("DATABASE_URL") or "").strip()
    if url:
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        label = "online Postgres database (DATABASE_URL)"
        args = {"options": "-c default_transaction_read_only=on"} if url.startswith("postgresql") else {}
        return create_engine(url, connect_args=args), label, False
    if not SQLITE_PATH.exists():
        sys.exit(f"No database yet at {SQLITE_PATH}. Start the backend once (npm run backend).")
    url = f"sqlite:///file:{SQLITE_PATH.as_posix()}?mode=ro&uri=true"
    return create_engine(url), str(SQLITE_PATH), True


def print_rows(headers: list[str], rows: list) -> None:
    cells = [[("NULL" if v is None else str(v))[:MAX_CELL] for v in row] for row in rows]
    widths = [max([len(h)] + [len(r[i]) for r in cells]) for i, h in enumerate(headers)]
    line = "+" + "+".join("-" * (w + 2) for w in widths) + "+"
    print(line)
    print("| " + " | ".join(h.ljust(w) for h, w in zip(headers, widths)) + " |")
    print(line)
    for r in cells:
        print("| " + " | ".join(c.ljust(w) for c, w in zip(r, widths)) + " |")
    print(line)
    print(f"{len(rows)} row(s)\n")


def run(engine, is_sqlite: bool, sql: str, title: str = "") -> None:
    if not is_sqlite and "sqlite_master" in sql:
        sql = PG_TABLES_SQL
    if title:
        print(f"=== {title} ===")
    print(sql.strip(), "\n")
    try:
        with engine.connect() as conn:
            result = conn.execute(text(sql))
            if result.returns_rows:
                print_rows(list(result.keys()), result.fetchall())
            else:
                print("(done)\n")
    except SQLAlchemyError as e:
        print(f"SQL error: {getattr(e, 'orig', e)}\n")


def load_demo_queries() -> list[tuple[str, str]]:
    text_ = QUERIES_FILE.read_text(encoding="utf-8")
    parts = re.split(r"^-- title:\s*(.+)$", text_, flags=re.M)
    return [(parts[i].strip(), parts[i + 1].strip()) for i in range(1, len(parts), 2)]


def main() -> None:
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")
    engine, label, is_sqlite = make_engine()
    print(f"Database: {label}\n")

    args = sys.argv[1:]
    if args == ["-i"]:
        while True:
            sql = input("sql> ").strip()
            if not sql:
                break
            run(engine, is_sqlite, sql)
    elif args:
        run(engine, is_sqlite, " ".join(args))
    else:
        for title, sql in load_demo_queries():
            run(engine, is_sqlite, sql, title)


if __name__ == "__main__":
    main()
