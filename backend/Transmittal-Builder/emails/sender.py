# =========================
# path: emails/sender.py
# =========================
from __future__ import annotations
import os, smtplib, mimetypes
from typing import Dict, Iterable, Optional, Tuple
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.mime.base import MIMEBase
from email import encoders

def send_email(
    subject: str,
    plain_text: str,
    html: str,
    *,
    sender: Optional[str] = None,
    to: str,
    cc: Optional[str] = None,
    smtp_host: str = "smtp.gmail.com",
    smtp_ssl: bool = True,
    smtp_port_ssl: int = 465,
    smtp_port_tls: int = 587,
    username: Optional[str] = None,
    password: Optional[str] = None,
    inline_images: Optional[Dict[str, str]] = None,   # cid -> file path
    attachments: Optional[Iterable[Tuple[str, bytes]]] = None,  # (filename, content)
) -> Tuple[bool, str]:
    # Note: sender, username, and password should be passed in by caller
    # (from config system, not environment variables)
    username = username or sender
    if not sender or not username or not password:
        return False, "Missing SMTP credentials (sender/password not provided)."

    msg = MIMEMultipart("related")
    msg["From"] = sender
    msg["To"] = to
    if cc:
        msg["Cc"] = cc
    msg["Subject"] = subject

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(plain_text, "plain", "utf-8"))
    alt.attach(MIMEText(html, "html", "utf-8"))
    msg.attach(alt)

    if inline_images:
        for cid, path in inline_images.items():
            if not path or not os.path.isfile(path):  # skip missing
                continue
            with open(path, "rb") as f:
                img = MIMEImage(f.read())
            img.add_header("Content-ID", f"<{cid}>")
            img.add_header("Content-Disposition", "inline", filename=os.path.basename(path))
            msg.attach(img)

    if attachments:
        for name, content in attachments:
            maintype, subtype = (mimetypes.guess_type(name)[0] or "application/octet-stream").split("/", 1)
            part = MIMEBase(maintype, subtype)
            part.set_payload(content)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=name)
            msg.attach(part)

    try:
        if smtp_ssl:
            with smtplib.SMTP_SSL(smtp_host, smtp_port_ssl) as s:
                s.login(username, password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(smtp_host, smtp_port_tls) as s:
                s.starttls()
                s.login(username, password)
                s.send_message(msg)
        return True, "sent"
    except Exception as e:
        return False, f"SMTP error: {e}"

