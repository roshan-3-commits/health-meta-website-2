"""Email routes (same paths and response shape as the old Node server).

  POST /api/send-email-alert     scheduled meal / nutrition alert
  POST /api/send-welcome-email   welcome mail after sign-in
  GET  /api/welcome-email-logs   last 50 welcome emails (now stored in the database)
  POST /api/verify-smtp          test SMTP settings

Sending order: Gmail app password -> configured SMTP -> "simulation" (logged only, not sent).
"""
import html
import logging
import os
import smtplib
import ssl
import time
import uuid
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import make_msgid
from pathlib import Path
from string import Template

from fastapi import APIRouter, Body, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .database import get_db
from .models import EmailLog

log = logging.getLogger("healthmeta.email")
router = APIRouter(tags=["email"])

TEMPLATES = Path(__file__).parent / "templates"
WELCOME_TPL = Template((TEMPLATES / "welcome.html").read_text(encoding="utf-8"))
ALERT_TPL = Template((TEMPLATES / "alert.html").read_text(encoding="utf-8"))
IST = timezone(timedelta(hours=5, minutes=30))

DEFAULT_WELCOME_FROM = os.getenv("WELCOME_FROM_EMAIL", "roshanlokhande43@gmail.com")
DEFAULT_ALERT_TO = os.getenv("SMTP_TO", "pj344504@gmail.com")


def _env(name: str) -> str:
    return os.getenv(name, "").strip()


def _send_smtp(msg: EmailMessage, host: str, port: int, user: str, password: str) -> None:
    # Like the Node version (rejectUnauthorized: false), certificate checks are relaxed
    # so self-hosted SMTP servers with self-signed certs still work.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as s:
            s.login(user, password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls(context=ctx)
            s.login(user, password)
            s.send_message(msg)


def _build(sender: str, to: str, subject: str, text: str, html_body: str, reply_to: str | None = None) -> EmailMessage:
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = sender, to, subject
    if reply_to:
        msg["Reply-To"] = reply_to
    msg["Message-ID"] = make_msgid(domain="healthmeta.local")
    msg.set_content(text)
    msg.add_alternative(html_body, subtype="html")
    return msg


def _record(db: DbSession, **fields) -> EmailLog:
    row = EmailLog(**fields)
    db.add(row)
    db.commit()
    return row


@router.post("/api/send-email-alert")
def send_email_alert(body: dict = Body(default_factory=dict), db: DbSession = Depends(get_db)):
    smtp = body.get("smtpConfig") or {}
    target = body.get("to") or DEFAULT_ALERT_TO
    alert_type = body.get("alertType") or "scheduled_meal"
    user_name = body.get("userName") or "Fitness Champion"
    text = body.get("text") or ""

    host = smtp.get("host") or _env("SMTP_HOST")
    port = int(smtp.get("port") or _env("SMTP_PORT") or 587)
    user = smtp.get("user") or _env("SMTP_USER")
    password = smtp.get("pass") or _env("SMTP_PASS")
    sender = smtp.get("from") or _env("SMTP_FROM") or (
        f"FreeCalorieCalc <{user}>" if user else "FreeCalorieCalc Alerts <alerts@freecaloriecalc.internal>")

    now = datetime.now()
    html_body = body.get("html") or ALERT_TPL.safe_substitute(
        userName=html.escape(user_name),
        body_text=html.escape(text) if text else
        "This is your scheduled daily nutrition alert. Time to refuel and stay consistent with your calorie targets!",
        time=now.strftime("%I:%M:%S %p"), date=now.strftime("%d/%m/%Y"),
        targetEmail=html.escape(target), app_url=html.escape(_env("APP_URL") or "#"),
    )
    subject = body.get("subject") or f"⏰ Scheduled Meal & Nutrition Alert ({now.strftime('%d/%m/%Y')})"
    msg = _build(sender, target, subject,
                 text or "Daily meal alert from FreeCalorieCalc. Log your meals to stay on track!", html_body)

    transport = "simulation"
    try:
        if host and user and password:
            _send_smtp(msg, host, port, user, password)
            transport = "smtp"
        else:
            log.info("[Email simulation] alert to %s: %s", target, subject)
    except Exception as exc:  # noqa: BLE001
        log.error("Failed to send email alert: %s", exc)
        _record(db, kind="alert", to_email=target, user_name=user_name, from_email=sender, subject=subject,
                transport_type="smtp", message_id=msg["Message-ID"], status="failed", error=str(exc))
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc) or "Failed to dispatch email alert"})

    _record(db, kind="alert", to_email=target, user_name=user_name, from_email=sender, subject=subject,
            transport_type=transport, message_id=msg["Message-ID"])
    return {
        "success": True, "messageId": msg["Message-ID"], "transportType": transport,
        "targetEmail": target, "previewUrl": None, "timestamp": int(time.time() * 1000),
        "status": "delivered" if transport != "simulation" else "simulated", "alertType": alert_type,
    }


def _log_out(row: EmailLog) -> dict:
    ts = row.created_at if row.created_at.tzinfo else row.created_at.replace(tzinfo=timezone.utc)
    return {
        "id": f"welc_{row.id}", "toEmail": row.to_email, "userName": row.user_name,
        "fromEmail": row.from_email, "subject": row.subject, "sentAt": ts.isoformat(),
        "timestamp": int(ts.timestamp() * 1000), "messageId": row.message_id,
        "transportType": row.transport_type, "previewUrl": None, "status": row.status,
    }


@router.post("/api/send-welcome-email")
def send_welcome_email(body: dict = Body(default_factory=dict), db: DbSession = Depends(get_db)):
    to_email = body.get("toEmail")
    if not to_email:
        return JSONResponse(status_code=400, content={"success": False, "error": "Recipient email address (toEmail) is required."})
    from_email = body.get("fromEmail") or DEFAULT_WELCOME_FROM
    clean_name = body.get("userName") or to_email.split("@")[0] or "Fitness Champion"
    subject = f"Welcome to Health-Meta, {clean_name}! 🥗⚡"
    login_time = datetime.now(IST).strftime("%d/%m/%Y, %I:%M:%S %p")

    html_body = WELCOME_TPL.safe_substitute(
        cleanName=html.escape(clean_name), toEmail=html.escape(to_email),
        fromEmail=html.escape(from_email), login_time=login_time)
    text = (
        f"Hello {clean_name},\n\nWelcome to Health-Meta!\n"
        f"Aapka account ({to_email}) successfully login aur activate ho chuka hai.\n\n"
        "With Health-Meta, you have access to:\n- Clinical AI Food Scanner\n"
        "- Calorie & Macronutrient Targets\n- Daily Meal Log & Streak Center\n"
        f"- Real-Time Workout & Burn Engine\n\nActivated At: {login_time} IST\n"
        f"Dispatched From: {from_email} (Roshan Lokhande)\n\nWarm regards,\nRoshan Lokhande\n"
        "Founder, Health-Meta (roshanlokhande43@gmail.com)"
    )
    msg = _build(f"Roshan Lokhande <{from_email}>", to_email, subject, text, html_body, reply_to=from_email)

    smtp = body.get("smtpConfig") or {}
    host = smtp.get("host") or _env("SMTP_HOST")
    port = int(smtp.get("port") or _env("SMTP_PORT") or 587)
    smtp_user = smtp.get("user") or _env("SMTP_USER") or from_email
    gmail_pass = (smtp.get("pass") or _env("GMAIL_APP_PASSWORD") or _env("SMTP_PASS")).strip()
    smtp_pass = smtp.get("pass") or _env("SMTP_PASS")

    transport, real = "simulation", False
    try:
        if gmail_pass and (not host or "gmail" in host):
            _send_smtp(msg, "smtp.gmail.com", 465, smtp_user, gmail_pass)
            transport, real = "gmail_direct_smtp", True
        elif host and smtp_user and smtp_pass:
            _send_smtp(msg, host, port, smtp_user, smtp_pass)
            transport, real = "configured_smtp", True
        else:
            log.info("[Welcome email simulation] to %s for %s", to_email, clean_name)
    except Exception as exc:  # noqa: BLE001
        log.error("Failed to send welcome email: %s", exc)
        _record(db, kind="welcome", to_email=to_email, user_name=clean_name, from_email=from_email, subject=subject,
                transport_type=transport, message_id=msg["Message-ID"], status="failed", error=str(exc))
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc) or "Failed to dispatch welcome email"})

    row = _record(db, kind="welcome", to_email=to_email, user_name=clean_name, from_email=from_email,
                  subject=subject, transport_type=transport, message_id=msg["Message-ID"] or f"msg_{uuid.uuid4().hex}")
    return {
        "success": True, "isRealDelivery": real, "transportType": transport,
        "message": (f"Real welcome email successfully delivered to {to_email} from {from_email} via Gmail SMTP!"
                    if real else
                    f"Welcome email simulated for {to_email}. For direct inbox delivery, add GMAIL_APP_PASSWORD or send directly via Gmail Web."),
        "previewUrl": None, "log": _log_out(row),
    }


@router.get("/api/welcome-email-logs")
def welcome_email_logs(db: DbSession = Depends(get_db)):
    rows = db.scalars(select(EmailLog).where(EmailLog.kind == "welcome")
                      .order_by(EmailLog.id.desc()).limit(50)).all()
    return {"success": True, "count": len(rows), "logs": [_log_out(r) for r in rows]}


@router.post("/api/verify-smtp")
def verify_smtp(body: dict = Body(default_factory=dict)):
    host, user, password = body.get("host"), body.get("user"), body.get("pass")
    port = int(body.get("port") or 587)
    if not host or not user or not password:
        return JSONResponse(status_code=400, content={"success": False, "error": "Host, user, and password are required to verify SMTP."})
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as s:
                s.login(user, password)
        else:
            with smtplib.SMTP(host, port, timeout=15) as s:
                s.starttls(context=ctx)
                s.login(user, password)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"success": False, "error": str(exc) or "SMTP verification failed."})
    return {"success": True, "message": f"SMTP connection to {host}:{port} verified successfully for {user}!"}
