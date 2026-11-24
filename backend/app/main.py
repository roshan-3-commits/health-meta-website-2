"""Health-Meta Python backend (FastAPI).

Run (from the backend folder):
    .venv\\Scripts\\python -m uvicorn app.main:app --reload --port 8000
API docs: http://localhost:8000/docs
"""
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR.parent / ".env")  # also accept the project-root .env

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from . import auth, emails, food  # noqa: E402
from .database import init_db  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


_db_ready = False


def ensure_db() -> None:
    """Create tables once per process (serverless hosts may skip the startup event)."""
    global _db_ready
    if not _db_ready:
        init_db()
        _db_ready = True


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_db()
    yield


app = FastAPI(title="Health-Meta API", version="2.0.0", lifespan=lifespan)


@app.middleware("http")
async def _db_ready_middleware(request, call_next):
    ensure_db()
    return await call_next(request)

origins = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,"
    "https://roshan-3-commits.github.io").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware, allow_origins=origins, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


app.include_router(auth.router)
app.include_router(auth.admin_router)
app.include_router(food.router)
app.include_router(emails.router)


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def api_not_found(path: str):
    return JSONResponse(status_code=404, content={"success": False, "error": f"Unknown API route: /api/{path}"})


# Serve the built React app (npm run build -> dist/) when it exists.
DIST = BACKEND_DIR.parent / "dist"
if DIST.is_dir():
    if (DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        target = (DIST / path).resolve()
        if path and target.is_file() and DIST.resolve() in target.parents:
            return FileResponse(target)
        return FileResponse(DIST / "index.html")
