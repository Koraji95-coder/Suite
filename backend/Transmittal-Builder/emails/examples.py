# =========================
# path: emails/examples.py  (how to call from your dialogs)
# =========================
from __future__ import annotations
from typing import Dict, Tuple
from .templates import build_bug_email, build_suggestion_email, build_transmittal_email
from .sender import send_email

def send_bug_report_email(
    payload: Dict,
    *,
    to: str,
    cc: str | None,
    logo_path: str,
    sender: str,
    password: str
) -> Tuple[bool, str]:
    subject, text, html = build_bug_email(payload)
    # Session log is now included in email body, not as attachment
    return send_email(
        subject, text, html,
        sender=sender,
        password=password,
        to=to, cc=cc,
        inline_images={"logo": logo_path},
        attachments=None
    )

def send_suggestion_email(
    payload: Dict,
    *,
    to: str,
    cc: str | None,
    logo_path: str,
    sender: str,
    password: str
) -> Tuple[bool, str]:
    subject, text, html = build_suggestion_email(payload)
    return send_email(
        subject, text, html,
        sender=sender,
        password=password,
        to=to, cc=cc,
        inline_images={"logo": logo_path},
        attachments=None
    )

def send_transmittal_summary_email(
    payload: Dict,
    *,
    to: str,
    logo_path: str,
    sender: str,
    password: str
) -> Tuple[bool, str]:
    subject, text, html = build_transmittal_email(payload)
    return send_email(
        subject, text, html,
        sender=sender,
        password=password,
        to=to, cc=None,
        inline_images={"logo": logo_path},
        attachments=None
    )

