"""Database connection.

Local default: a SQLite file (backend/healthmeta.db), nothing extra to install.
Online (Vercel): set DATABASE_URL to a Postgres database, e.g. Neon:
  postgresql://user:pass@host/healthmeta?sslmode=require
(postgres:// and postgresql:// are both accepted.)
"""
import logging
import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

log = logging.getLogger("healthmeta.db")

BACKEND_DIR = Path(__file__).resolve().parent.parent
ON_VERCEL = bool(os.getenv("VERCEL"))


def _database_url() -> str:
    url = (os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or "").strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    if url:
        return url
    if ON_VERCEL:
        # Vercel's disk is read-only and wiped often; /tmp works but data is LOST.
        log.warning("DATABASE_URL is not set: using a temporary SQLite file. Data will not be kept!")
        return "sqlite:////tmp/healthmeta.db"
    return f"sqlite:///{(BACKEND_DIR / 'healthmeta.db').as_posix()}"


DATABASE_URL = _database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
    # Serverless functions should not keep connections open between requests.
    poolclass=NullPool if (ON_VERCEL and not IS_SQLITE) else None,
    pool_pre_ping=not IS_SQLITE,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _upgrade_old_tables() -> None:
    """Small in-place upgrades for databases created by older versions."""
    insp = inspect(engine)
    if "users" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("users")}
        if "google_sub" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN google_sub VARCHAR(128)"))
            log.info("Added users.google_sub column")


def init_db() -> None:
    from . import models  # noqa: F401  (registers tables)

    Base.metadata.create_all(bind=engine)
    _upgrade_old_tables()
