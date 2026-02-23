# =========================
# path: emails/templates.py
# =========================
from __future__ import annotations
import html
from datetime import datetime
from typing import Dict, Tuple, Optional
from .branding import BRAND

def _preheader(text: str) -> str:
    return f'<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#fff;">{html.escape(text)}</div>'

def _base_html(title: str, subtitle: str, body_inner: str, preheader: str = "", meta_info: str = "") -> str:
    b = BRAND
    return f"""\
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <style>
    @media (max-width:640px) {{
      .container{{width:100%!important}}
      .stack{{display:block!important;width:100%!important}}
      .p16{{padding:12px!important}} .p24{{padding:16px!important}}
    }}
    a{{color:{b["accent"]};text-decoration:none}}
    .btn{{background:{b["primary"]} !important;color:#ffffff !important;padding:12px 18px;border-radius:10px;display:inline-block;font-weight:700;text-decoration:none !important;border:none}}
  </style>
</head>
<body style="margin:0;background:{b["bg"]};">
{_preheader(preheader)}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{b["bg"]};">
  <tr><td align="center">
    <table role="presentation" width="640" class="container" cellspacing="0" cellpadding="0" style="width:640px;max-width:100%;">
      <!-- Header with Logo and Company Name -->
      <tr><td class="p24" style="padding:24px 24px 8px 24px;text-align:center;">
        <img src="cid:logo" alt="{html.escape(b['company'])}" width="64" height="64" style="display:inline-block;border-radius:8px;border:1px solid {b["border"]};">
        <div style="font:700 16px Segoe UI,Arial;color:{b["primary"]};margin-top:8px;">{html.escape(b['company'])}</div>
      </td></tr>

      <!-- Centered Title and Subtitle -->
      <tr><td class="p24" style="padding:8px 24px 8px 24px;text-align:center;">
        <div style="font:800 24px Segoe UI,Arial;color:{b["primary"]};">{html.escape(title)}</div>
        <div style="font:600 18px Segoe UI,Arial;color:{b["accent"]};margin-top:4px;">{html.escape(subtitle)}</div>
      </td></tr>

      <!-- Meta Info (if provided) -->
      {f'<tr><td class="p24" style="padding:0 24px 8px 24px;text-align:center;"><div style="font:400 12px Segoe UI,Arial;color:{b["muted"]};">{meta_info}</div></td></tr>' if meta_info else ''}

      <!-- Card -->
      <tr><td class="p24" style="padding:8px 24px 24px 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{b["card"]};border:1px solid {b["border"]};border-radius:16px;">
          <tr><td class="p24" style="padding:24px;">
            {body_inner}
          </td></tr>
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td class="p24" style="padding:8px 24px 40px 24px;">
        <div style="text-align:center;color:{b["muted"]};font:12px Segoe UI,Arial;line-height:1.5;">
          <div style="margin-bottom:6px;">© {datetime.now().year} {html.escape(b['company'])}</div>
          <div style="opacity:.8">{html.escape(b["footer_disclaimer"])}</div>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>
"""

def _meta_row(meta: Dict[str, str]) -> str:
    cells = "".join(f"<td>{html.escape(k)}: <strong style='color:{BRAND['text']}'>{html.escape(v)}</strong></td>" for k, v in meta.items())
    return f"""<table role="presentation" cellspacing="8" cellpadding="0" class="meta"><tr>{cells}</tr></table>"""

def build_bug_email(data: Dict) -> Tuple[str, str, str]:
    """
    data: dict with keys: user_email, version, submitted, description, session_log
    Returns: (subject, text, html)
    """
    # Format submitted time in 12-hour format
    submitted_dt = data.get("submitted") or datetime.now()
    if isinstance(submitted_dt, str):
        try:
            submitted_dt = datetime.strptime(submitted_dt, "%Y-%m-%d %H:%M:%S")
        except:
            submitted_dt = datetime.now()

    submitted_date = submitted_dt.strftime("%B %d, %Y")  # e.g., "October 02, 2025"
    submitted_time = submitted_dt.strftime("%I:%M %p")   # e.g., "02:30 PM"

    # Subject: [Transmittal Builder] Date - Bug Report
    subject = f"[Transmittal Builder] {submitted_date} - Bug Report"
    pre = "Bug report received. We'll investigate and follow up."

    # Meta info: Submitted time and version
    meta_info = f"Submitted: {submitted_time} on {submitted_date} • Version {data.get('version','?')}"

    user_email = data.get('user_email', '').strip() or 'noreply@example.com'

    body = f"""
    <div style="color:{BRAND['text']};font:14px Segoe UI,Arial;line-height:1.6">
      <!-- Summary Section -->
      <h3 style="margin:0 0 8px 0;color:{BRAND['accent']};font:700 16px Segoe UI,Arial;">Summary</h3>
      <div style="background:{BRAND['bg']};border:1px solid {BRAND['border']};border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0;white-space:pre-wrap;">{html.escape(data.get('description','(no summary)'))}</p>
      </div>

      <!-- Session Log Section -->
      <h3 style="margin:0 0 8px 0;color:{BRAND['accent']};font:700 16px Segoe UI,Arial;">Session Log</h3>
      <div style="background:{BRAND['bg']};border:1px solid {BRAND['border']};border-radius:8px;padding:16px;margin-bottom:20px;">
        <pre style="margin:0;white-space:pre-wrap;font:12px 'Consolas','Courier New',monospace;color:{BRAND['text']};">{html.escape(data.get('session_log','(no log)'))}</pre>
      </div>

      <!-- Reply Button -->
      <div style="text-align:center;margin-top:24px;">
        <a class="btn" href="mailto:{html.escape(user_email)}?subject=Re: {html.escape(subject)}" style="background:{BRAND['primary']} !important;color:#ffffff !important;padding:12px 18px;border-radius:10px;display:inline-block;font-weight:700;text-decoration:none !important;border:none;">Reply to User</a>
      </div>
    </div>
    """
    html_doc = _base_html("Transmittal Builder", "Bug Report", body, preheader=pre, meta_info=meta_info)
    text = f"""\
[Transmittal Builder] {submitted_date} - Bug Report

Submitted: {submitted_time} on {submitted_date}
Version:   {data.get('version','?')}
Reporter:  {user_email}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{data.get('description','(no summary)')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session Log
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{data.get('session_log','(no log)')}
"""
    return subject, text, html_doc

def build_suggestion_email(data: Dict) -> Tuple[str, str, str]:
    """
    data: category, user_email, submitted, suggestion, version
    """
    # Format submitted time in 12-hour format
    submitted_dt = data.get("submitted") or datetime.now()
    if isinstance(submitted_dt, str):
        try:
            submitted_dt = datetime.strptime(submitted_dt, "%Y-%m-%d %H:%M:%S")
        except:
            submitted_dt = datetime.now()

    submitted_date = submitted_dt.strftime("%B %d, %Y")  # e.g., "October 02, 2025"
    submitted_time = submitted_dt.strftime("%I:%M %p")   # e.g., "02:30 PM"

    category = data.get('category', 'General')
    subject = f"[Transmittal Builder] {submitted_date} - Suggestion ({category})"
    pre = "Thanks! We logged your suggestion."

    # Meta info: Submitted time and version
    meta_info = f"Submitted: {submitted_time} on {submitted_date} • Version {data.get('version','?')} • Category: {category}"

    user_email = data.get('user_email', '').strip() or 'noreply@example.com'

    body = f"""
    <div style="color:{BRAND['text']};font:14px Segoe UI,Arial;line-height:1.6">
      <!-- Suggestion Section -->
      <h3 style="margin:0 0 8px 0;color:{BRAND['accent']};font:700 16px Segoe UI,Arial;">Suggestion</h3>
      <div style="background:{BRAND['bg']};border:1px solid {BRAND['border']};border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0;white-space:pre-wrap;">{html.escape(data.get('suggestion','(empty)'))}</p>
      </div>

      <!-- Reply Button -->
      <div style="text-align:center;margin-top:24px;">
        <a class="btn" href="mailto:{html.escape(user_email)}?subject=Re: {html.escape(subject)}" style="background:{BRAND['primary']} !important;color:#ffffff !important;padding:12px 18px;border-radius:10px;display:inline-block;font-weight:700;text-decoration:none !important;border:none;">Reply to User</a>
      </div>
    </div>
    """
    html_doc = _base_html("Transmittal Builder", f"Suggestion — {category}", body, preheader=pre, meta_info=meta_info)
    text = f"""\
[Transmittal Builder] {submitted_date} - Suggestion ({category})

Submitted: {submitted_time} on {submitted_date}
Version:   {data.get('version','?')}
Category:  {category}
Reporter:  {user_email}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Suggestion
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{data.get('suggestion','(empty)')}
"""
    return subject, text, html_doc

def build_transmittal_email(data: Dict) -> Tuple[str, str, str]:
    """
    data: project_name, project_number, date, from_name, firm, counts(dict), notes
    """
    subject = f"[R3P • Transmittal] {data.get('project_number','')} — {data.get('project_name','')}"
    pre = "Transmittal generated. Summary and metadata below."
    meta = {
        "Project": data.get("project_name",""),
        "Number": data.get("project_number",""),
        "Date": data.get("date",""),
        "From": data.get("from_name",""),
        "Firm": data.get("firm",""),
    }
    cnt = data.get("counts", {})  # e.g., {"PDF": 12, "CAD": 3}
    counts_html = "".join(f"<tr><td style='padding:6px 8px;color:{BRAND['muted']}'>{html.escape(k)}</td><td style='padding:6px 8px;color:{BRAND['text']};font-weight:700' align='right'>{int(v)}</td></tr>" for k, v in cnt.items())
    body = f"""
    {_meta_row(meta)}
    <hr style="border:none;border-top:1px solid {BRAND['border']};margin:18px 0">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td class="stack" style="vertical-align:top;width:50%;padding-right:8px">
          <h3 style="margin:0 0 6px 0;color:{BRAND['accent']};font:700 14px Segoe UI,Arial;">Counts</h3>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{BRAND['bg']};border:1px solid {BRAND['border']};border-radius:8px;">
            {counts_html or "<tr><td style='padding:12px;color:%s'>No items.</td></tr>" % BRAND['muted']}
          </table>
        </td>
        <td class="stack" style="vertical-align:top;width:50%;padding-left:8px">
          <h3 style="margin:0 0 6px 0;color:{BRAND['accent']};font:700 14px Segoe UI,Arial;">Notes</h3>
          <div style="white-space:pre-wrap;background:{BRAND['bg']};border:1px solid {BRAND['border']};border-radius:8px;padding:12px;color:{BRAND['text']};min-height:44px">{html.escape(data.get('notes',''))}</div>
        </td>
      </tr>
    </table>
    """
    html_doc = _base_html("Transmittal Summary", body, preheader=pre, badge="Transmittal")
    text = (
f"""{BRAND['company']} — {BRAND['product']}
TRANSMITTAL SUMMARY

Project: {data.get('project_name','')}
Number : {data.get('project_number','')}
Date   : {data.get('date','')}
From   : {data.get('from_name','')}
Firm   : {data.get('firm','')}

Counts:
""" + "\n".join(f"  - {k}: {v}" for k, v in cnt.items()) + f"""

Notes:
{data.get('notes','')}
"""
    )
    return subject, text, html_doc

