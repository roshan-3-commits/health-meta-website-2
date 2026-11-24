"""Login / logout API. Every register, login, failed login and logout is saved.

Routes (all under /api/auth):
  POST /register   email + password + name  -> new account, logged in
  POST /login      email + password         -> logged in
  POST /google     Google access token       -> logged in (token is checked with Google)
  POST /guest      name + email              -> guest login (no password)
  POST /logout     Bearer token              -> session closed
  GET  /me         Bearer token              -> current user
  GET  /history    Bearer token              -> this user's login/logout history

Admin (header X-Admin-Key must equal ADMIN_API_KEY in .env):
  GET /api/admin/auth-events   all events, newest first
  GET /api/admin/sessions      all sessions (who is logged in right now, etc.)
"""
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .database import get_db
from .models import AuthEvent, Session, User, utcnow

router = APIRouter(prefix="/api/auth", tags=["auth"])
admin_router = APIRouter(prefix="/api/admin", tags=["admin"])

SESSION_DAYS = int(os.getenv("SESSION_DAYS", "30"))


# ---------- password hashing (stdlib scrypt) ----------
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _, n, r, p, salt_hex, hash_hex = stored.split("$")
        digest = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt_hex), n=int(n), r=int(r), p=int(p)
        )
        return hmac.compare_digest(digest.hex(), hash_hex)
    except (ValueError, TypeError):
        return False


# ---------- helpers ----------
def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _client_info(request: Request) -> tuple[str, str]:
    ip = request.client.host if request.client else ""
    # Vercel and other proxies put the real client IP in X-Forwarded-For.
    if os.getenv("TRUST_PROXY") == "1" or os.getenv("VERCEL"):
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            ip = fwd.split(",")[0].strip()
    return ip[:64], (request.headers.get("user-agent") or "")[:512]


def _as_utc(dt: datetime) -> datetime:
    # SQLite returns naive datetimes; treat them as UTC.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _log_event(db: DbSession, request: Request, *, event: str, email: str, provider: str,
               user: User | None = None, session: Session | None = None, detail: str = "") -> None:
    ip, ua = _client_info(request)
    db.add(AuthEvent(
        user_id=user.id if user else None,
        session_id=session.id if session else None,
        email=email.lower(), event=event, provider=provider,
        detail=detail[:255], ip_address=ip, user_agent=ua,
    ))


def _user_out(user: User) -> dict:
    return {
        "uid": user.uid,
        "displayName": user.name,
        "email": user.email,
        "photoURL": user.photo_url,
        "provider": user.provider,
        "createdAt": _as_utc(user.created_at).isoformat() if user.created_at else None,
        "lastLoginAt": _as_utc(user.last_login_at).isoformat() if user.last_login_at else None,
        "loginCount": user.login_count,
    }


def _start_session(db: DbSession, request: Request, user: User, provider: str) -> dict:
    token = secrets.token_urlsafe(32)
    ip, ua = _client_info(request)
    now = utcnow()
    sess = Session(
        token_hash=_token_hash(token), user_id=user.id, provider=provider,
        ip_address=ip, user_agent=ua, created_at=now, last_seen_at=now,
        expires_at=now + timedelta(days=SESSION_DAYS),
    )
    db.add(sess)
    user.last_login_at = now
    user.login_count = (user.login_count or 0) + 1
    db.flush()
    _log_event(db, request, event="login", email=user.email, provider=provider, user=user, session=sess)
    db.commit()
    return {"success": True, "token": token, "expiresAt": sess.expires_at.isoformat(), "user": _user_out(user)}


def _new_uid() -> str:
    return "usr_" + secrets.token_hex(8)


def _get_session(db: DbSession, authorization: str | None) -> Session | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    return db.scalar(select(Session).where(Session.token_hash == _token_hash(token)))


def current_session(request: Request, authorization: str | None = Header(default=None),
                    db: DbSession = Depends(get_db)) -> Session:
    sess = _get_session(db, authorization)
    if not sess or sess.logged_out_at is not None:
        raise HTTPException(status_code=401, detail="Not logged in.")
    if _as_utc(sess.expires_at) < utcnow():
        sess.logged_out_at = utcnow()
        sess.logout_reason = "expired"
        _log_event(db, request, event="logout", email=sess.user.email, provider=sess.provider,
                   user=sess.user, session=sess, detail="session expired")
        db.commit()
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    sess.last_seen_at = utcnow()
    db.commit()
    return sess


# ---------- request bodies ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(default="", max_length=255)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class GoogleIn(BaseModel):
    accessToken: str = Field(min_length=10, max_length=4096)


class GuestIn(BaseModel):
    name: str = Field(default="Fitness Member", max_length=255)
    email: EmailStr


# ---------- routes ----------
@router.post("/register")
def register(body: RegisterIn, request: Request, db: DbSession = Depends(get_db)):
    email = body.email.lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing and existing.password_hash:
        raise HTTPException(status_code=409, detail="This email is already registered. Please sign in.")

    name = body.name.strip() or email.split("@")[0]
    if existing:
        # Google/guest account adding a password: keep the same account.
        existing.password_hash = hash_password(body.password)
        existing.name = existing.name or name
        user = existing
    else:
        user = User(uid=_new_uid(), email=email, name=name, provider="password",
                    password_hash=hash_password(body.password))
        db.add(user)
    db.flush()
    _log_event(db, request, event="register", email=email, provider="password", user=user)
    return _start_session(db, request, user, "password")


@router.post("/login")
def login(body: LoginIn, request: Request, db: DbSession = Depends(get_db)):
    email = body.email.lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(body.password, user.password_hash):
        reason = "unknown email" if not user else "wrong password"
        _log_event(db, request, event="login_failed", email=email, provider="password",
                   user=user, detail=reason)
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return _start_session(db, request, user, "password")


def _google_client_id() -> str:
    return os.getenv("GOOGLE_CLIENT_ID", "").strip()


@router.post("/google")
def google_login(body: GoogleIn, request: Request, db: DbSession = Depends(get_db)):
    """The browser signs in with Google (Google Identity Services popup) and sends us
    the access token. We check with Google that the token was issued to OUR app
    (GOOGLE_CLIENT_ID) before trusting the email in it."""
    client_id = _google_client_id()
    if not client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not set up on the server (GOOGLE_CLIENT_ID).")
    try:
        check = httpx.get("https://oauth2.googleapis.com/tokeninfo",
                          params={"access_token": body.accessToken}, timeout=10)
        info = httpx.get("https://www.googleapis.com/oauth2/v3/userinfo",
                         headers={"Authorization": f"Bearer {body.accessToken}"}, timeout=10)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Google: {exc}") from exc

    token = check.json() if check.status_code == 200 else {}
    profile = info.json() if info.status_code == 200 else {}
    if token.get("aud") != client_id or not profile.get("sub") or profile.get("sub") != token.get("sub"):
        _log_event(db, request, event="login_failed", email="unknown", provider="google",
                   detail="invalid Google token")
        db.commit()
        raise HTTPException(status_code=401, detail="Google sign-in could not be verified.")

    email = (profile.get("email") or "").lower()
    if not email or not profile.get("email_verified"):
        raise HTTPException(status_code=400, detail="Your Google account has no verified email address.")

    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(uid=_new_uid(), email=email, provider="google")
        db.add(user)
    user.google_sub = profile["sub"]
    user.name = profile.get("name") or user.name or email.split("@")[0]
    user.photo_url = profile.get("picture") or user.photo_url or ""
    if user.provider == "guest":
        user.provider = "google"
    db.flush()
    return _start_session(db, request, user, "google")


@router.post("/guest")
def guest_login(body: GuestIn, request: Request, db: DbSession = Depends(get_db)):
    email = body.email.lower()
    user = db.scalar(select(User).where(User.email == email))
    if user and user.provider != "guest":
        _log_event(db, request, event="login_failed", email=email, provider="guest",
                   user=user, detail="guest login on a real account")
        db.commit()
        raise HTTPException(status_code=409,
                            detail="This email has an account. Please sign in with your password or Google.")
    if not user:
        user = User(uid=_new_uid(), email=email, provider="guest",
                    name=body.name.strip() or email.split("@")[0])
        db.add(user)
        db.flush()
    return _start_session(db, request, user, "guest")


@router.post("/logout")
def logout(request: Request, authorization: str | None = Header(default=None),
           db: DbSession = Depends(get_db)):
    sess = _get_session(db, authorization)
    if not sess or sess.logged_out_at is not None:
        return {"success": True, "message": "Already logged out."}
    now = utcnow()
    sess.logged_out_at = now
    sess.logout_reason = "user"
    sess.user.last_logout_at = now
    _log_event(db, request, event="logout", email=sess.user.email, provider=sess.provider,
               user=sess.user, session=sess)
    db.commit()
    return {"success": True, "message": "Logged out."}


@router.get("/me")
def me(sess: Session = Depends(current_session)):
    return {"success": True, "user": _user_out(sess.user)}


def _event_out(e: AuthEvent) -> dict:
    return {
        "id": e.id, "event": e.event, "email": e.email, "provider": e.provider,
        "detail": e.detail, "ipAddress": e.ip_address, "userAgent": e.user_agent,
        "sessionId": e.session_id, "createdAt": _as_utc(e.created_at).isoformat(),
    }


@router.get("/history")
def history(limit: int = 50, sess: Session = Depends(current_session), db: DbSession = Depends(get_db)):
    rows = db.scalars(
        select(AuthEvent).where(AuthEvent.user_id == sess.user_id)
        .order_by(AuthEvent.id.desc()).limit(min(max(limit, 1), 500))
    ).all()
    return {"success": True, "count": len(rows), "events": [_event_out(e) for e in rows]}


# ---------- admin ----------
def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    expected = os.getenv("ADMIN_API_KEY", "")
    if not expected or not x_admin_key or not hmac.compare_digest(x_admin_key, expected):
        raise HTTPException(status_code=403, detail="Admin key required.")


@admin_router.get("/auth-events", dependencies=[Depends(require_admin)])
def all_events(limit: int = 200, email: str | None = None, event: str | None = None,
               db: DbSession = Depends(get_db)):
    q = select(AuthEvent).order_by(AuthEvent.id.desc()).limit(min(max(limit, 1), 2000))
    if email:
        q = q.where(AuthEvent.email == email.lower())
    if event:
        q = q.where(AuthEvent.event == event)
    rows = db.scalars(q).all()
    return {"success": True, "count": len(rows), "events": [_event_out(e) for e in rows]}


@admin_router.get("/sessions", dependencies=[Depends(require_admin)])
def all_sessions(active_only: bool = False, limit: int = 200, db: DbSession = Depends(get_db)):
    q = select(Session).order_by(Session.id.desc()).limit(min(max(limit, 1), 2000))
    if active_only:
        q = q.where(Session.logged_out_at.is_(None))
    rows = db.scalars(q).all()
    now = utcnow()
    return {"success": True, "count": len(rows), "sessions": [{
        "id": s.id, "email": s.user.email, "name": s.user.name, "provider": s.provider,
        "ipAddress": s.ip_address, "userAgent": s.user_agent,
        "loginAt": _as_utc(s.created_at).isoformat(),
        "lastSeenAt": _as_utc(s.last_seen_at).isoformat(),
        "logoutAt": _as_utc(s.logged_out_at).isoformat() if s.logged_out_at else None,
        "logoutReason": s.logout_reason,
        "active": s.logged_out_at is None and _as_utc(s.expires_at) > now,
    } for s in rows]}
