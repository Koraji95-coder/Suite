#!/usr/bin/env python3
# pyright: reportMissingImports=false, reportMissingModuleSource=false
"""
Coordinates Grabber API Server
Flask-based HTTP/WebSocket bridge between React frontend and AutoCAD COM interface

Uses LATE-BOUND COM (dynamic dispatch) to avoid gen_py cache corruption.
Pattern taken from coordtable_excel_always_place_refpoints.py.

This server runs on localhost:5000 and provides:
- AutoCAD process detection (checks for acad.exe)
- COM connection management
- Layer and selection information
- Coordinate extraction from layers
- Real-time status updates

Usage:
    python api_server.py

Requirements:
    pip install flask flask-cors psutil pywin32
"""

from flask import Flask, jsonify, request, send_file, after_this_request, g
from flask_cors import CORS
from flask_sock import Sock
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import psutil
try:
    import pythoncom
    import win32com.client
    import win32com.client.gencache as gencache
    AUTOCAD_COM_AVAILABLE = True
except Exception:
    pythoncom = None
    win32com = None
    gencache = None
    AUTOCAD_COM_AVAILABLE = False
import threading
import time
import json
import math
import os
import sys
import tempfile
import shutil
import subprocess
import re
import traceback
import logging
import hmac
import hashlib
import zipfile
import secrets
from functools import wraps
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple
from pathlib import Path
from werkzeug.utils import secure_filename
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import requests
import jwt
from jwt import PyJWKClient

# ── Logging configuration ────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.FileHandler('api_server.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ── gen_py cache fix (from coordtable) ──────────────────────────
# Prevent gen_py from writing wrappers that cause CDispatch issues
if AUTOCAD_COM_AVAILABLE and gencache is not None:
    gencache.is_readonly = True

# ── Environment loading ────────────────────────────────────────
def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    try:
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if not key:
                continue
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)
    except Exception as exc:
        logger.warning("Failed to load env file %s: %s", path, exc)


_env_path = Path(__file__).resolve().parents[1] / ".env"
_load_env_file(_env_path)

app = Flask(__name__)
sock = Sock(app)

# ── Transmittal Builder render helpers ──────────────────────────
TRANSMITTAL_RENDER_AVAILABLE = False
try:
    transmittal_core_path = (
        Path(__file__).resolve().parent
        / "Transmittal-Builder"
        / "core"
    )
    if transmittal_core_path.exists():
        sys.path.append(str(transmittal_core_path))
        from transmittal_render import render_transmittal, render_cid_transmittal  # type: ignore

        TRANSMITTAL_RENDER_AVAILABLE = True
except Exception as exc:
    logger.warning("Transmittal render helpers unavailable: %s", exc)


def _parse_csv_env(var_name: str, fallback: List[str]) -> List[str]:
    raw = os.environ.get(var_name, "")
    if not raw.strip():
        return fallback
    return [item.strip() for item in raw.split(",") if item.strip()]


def _parse_int_env(var_name: str, fallback: int, minimum: int = 1) -> int:
    raw = os.environ.get(var_name)
    if raw is None:
        return fallback
    try:
        value = int(raw)
        return max(value, minimum)
    except ValueError:
        logger.warning("Invalid %s=%r; using fallback %s", var_name, raw, fallback)
        return fallback


app.config['MAX_CONTENT_LENGTH'] = _parse_int_env(
    'API_MAX_CONTENT_LENGTH',
    104857600  # 100 MB
)

# CORS configuration - restrict to specific origins for security
# In production, replace with actual frontend domain
ALLOWED_ORIGINS = [
    "http://localhost:5173",  # Vite dev server
    "http://localhost:3000",  # Alternative dev port
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
ALLOWED_ORIGINS = _parse_csv_env('API_ALLOWED_ORIGINS', ALLOWED_ORIGINS)

CORS(app, 
     origins=ALLOWED_ORIGINS,
     supports_credentials=True,
     methods=["GET", "POST", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization", "X-API-Key"])

# ── Rate Limiting ────────────────────────────────────────────────
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=[
        os.environ.get('API_RATE_LIMIT_DAY', '200 per day'),
        os.environ.get('API_RATE_LIMIT_HOUR', '50 per hour'),
    ],
    storage_uri="memory://",
    strategy="fixed-window"
)

# ── Security Headers ─────────────────────────────────────────────
@app.after_request
def add_security_headers(response):
    """Add security headers to all responses."""
    # Prevent clickjacking attacks
    response.headers['X-Frame-Options'] = 'DENY'
    # Prevent MIME-type sniffing
    response.headers['X-Content-Type-Options'] = 'nosniff'
    # Enable XSS protection
    response.headers['X-XSS-Protection'] = '1; mode=block'
    # Content Security Policy
    response.headers['Content-Security-Policy'] = "default-src 'self'"
    # Referrer policy
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    # Strict Transport Security (HTTPS only - comment out for localhost)
    # response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

# ── API Authentication ───────────────────────────────────────────
# SECURITY: API_KEY must be explicitly set in environment. No defaults allowed.
API_KEY = (os.environ.get('API_KEY') or '').strip()
if not API_KEY:
    fallback_key = (os.environ.get('VITE_API_KEY') or '').strip()
    if fallback_key:
        API_KEY = fallback_key
        logger.warning(
            "API_KEY not set; using VITE_API_KEY for local development. "
            "Set API_KEY explicitly for production."
        )
    else:
        raise RuntimeError(
            "FATAL: API_KEY environment variable is not set.\n"
            "Please set your API key before starting the server:\n"
            "  export API_KEY='your-secure-api-key-here'\n"
            "Then start the server again."
        )
if len(API_KEY) < 16:
    logger.warning("API_KEY length is under 16 characters; use a longer key for production.")

BATCH_SESSION_COOKIE = "bfr_session"
BATCH_SESSION_TTL_SECONDS = _parse_int_env("BATCH_SESSION_TTL_SECONDS", 6 * 60 * 60, minimum=300)

# ── Agent Broker + Supabase Auth ────────────────────────────────
SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").strip()
if not SUPABASE_URL:
    dev_supabase_url = (os.environ.get("VITE_SUPABASE_URL") or "").strip()
    if dev_supabase_url:
        SUPABASE_URL = dev_supabase_url
        logger.warning(
            "SUPABASE_URL not set; using VITE_SUPABASE_URL for development. "
            "Set SUPABASE_URL in backend env for production."
        )

SUPABASE_SERVICE_ROLE_KEY = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
SUPABASE_ANON_KEY = (os.environ.get("SUPABASE_ANON_KEY") or "").strip()
SUPABASE_JWT_SECRET = (os.environ.get("SUPABASE_JWT_SECRET") or "").strip()
SUPABASE_API_KEY = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
if SUPABASE_API_KEY == SUPABASE_ANON_KEY and SUPABASE_API_KEY:
    logger.warning(
        "Using SUPABASE_ANON_KEY for backend auth lookups. "
        "Prefer SUPABASE_SERVICE_ROLE_KEY in production."
    )

SUPABASE_JWKS_URL = (
    SUPABASE_URL.rstrip("/") + "/auth/v1/keys"
    if SUPABASE_URL
    else ""
)
_SUPABASE_JWKS_CLIENT: Optional[PyJWKClient] = None

AGENT_GATEWAY_URL = (
    (os.environ.get("AGENT_GATEWAY_URL") or "").strip()
    or (os.environ.get("VITE_AGENT_GATEWAY_URL") or "").strip()
    or "http://127.0.0.1:3000"
)
AGENT_WEBHOOK_SECRET = (os.environ.get("AGENT_WEBHOOK_SECRET") or "").strip()
AGENT_REQUIRE_WEBHOOK_SECRET = (
    (os.environ.get("AGENT_REQUIRE_WEBHOOK_SECRET") or "true").strip().lower()
    != "false"
)
if not AGENT_WEBHOOK_SECRET:
    dev_webhook_secret = (os.environ.get("VITE_AGENT_WEBHOOK_SECRET") or "").strip()
    if dev_webhook_secret:
        AGENT_WEBHOOK_SECRET = dev_webhook_secret
        logger.warning(
            "AGENT_WEBHOOK_SECRET not set; using VITE_AGENT_WEBHOOK_SECRET for development. "
            "Set AGENT_WEBHOOK_SECRET in backend env for production."
        )

AGENT_SESSION_COOKIE = (os.environ.get("AGENT_SESSION_COOKIE") or "suite_agent_session").strip()
AGENT_SESSION_SAMESITE = (os.environ.get("AGENT_SESSION_SAMESITE") or "Strict").strip()
AGENT_SESSION_SECURE = (os.environ.get("AGENT_SESSION_SECURE") or "false").strip().lower() == "true"
AGENT_SESSION_TTL_SECONDS = _parse_int_env(
    "AGENT_SESSION_TTL_SECONDS",
    6 * 60 * 60,
    minimum=300,
)
AGENT_DEFAULT_TIMEOUT_SECONDS = _parse_int_env("AGENT_TIMEOUT_SECONDS", 30, minimum=3)
AGENT_MAX_TIMEOUT_SECONDS = _parse_int_env("AGENT_MAX_TIMEOUT_SECONDS", 300, minimum=30)

AGENT_SESSIONS: Dict[str, Dict[str, Any]] = {}


def _purge_expired_agent_sessions() -> None:
    now = time.time()
    expired = [sid for sid, session in AGENT_SESSIONS.items() if session["expires_at"] <= now]
    for sid in expired:
        AGENT_SESSIONS.pop(sid, None)


def _looks_like_uuid(value: str) -> bool:
    if not value:
        return False
    if len(value) != 36:
        return False
    if value.count("-") != 4:
        return False
    return True


def _get_supabase_jwks_client() -> Optional[PyJWKClient]:
    global _SUPABASE_JWKS_CLIENT
    if not SUPABASE_JWKS_URL:
        return None
    if _SUPABASE_JWKS_CLIENT is None:
        _SUPABASE_JWKS_CLIENT = PyJWKClient(SUPABASE_JWKS_URL)
    return _SUPABASE_JWKS_CLIENT


def _agent_broker_config_status() -> Dict[str, Any]:
    missing: List[str] = []
    warnings: List[str] = []

    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not AGENT_GATEWAY_URL:
        missing.append("AGENT_GATEWAY_URL")
    if AGENT_REQUIRE_WEBHOOK_SECRET and not AGENT_WEBHOOK_SECRET:
        missing.append("AGENT_WEBHOOK_SECRET")

    if SUPABASE_JWT_SECRET and _looks_like_uuid(SUPABASE_JWT_SECRET):
        warnings.append(
            "SUPABASE_JWT_SECRET looks like a key ID. For ECC keys, leave it empty and use JWKS."
        )

    if SUPABASE_API_KEY and SUPABASE_API_KEY == SUPABASE_ANON_KEY:
        warnings.append("Using SUPABASE_ANON_KEY for backend auth. Prefer service role key.")

    return {
        "ok": len(missing) == 0,
        "missing": missing,
        "warnings": warnings,
        "require_webhook_secret": AGENT_REQUIRE_WEBHOOK_SECRET,
    }


def _get_supabase_user_id(user: Dict[str, Any]) -> Optional[str]:
    return (user.get("id") or user.get("sub") or "").strip() or None


def _get_bearer_token() -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if not auth:
        return None
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return None


def _verify_supabase_user_token(token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None

    if SUPABASE_JWT_SECRET and not _looks_like_uuid(SUPABASE_JWT_SECRET):
        try:
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            return payload
        except Exception as exc:
            logger.warning("Supabase JWT validation failed (HS256): %s", exc)

    if SUPABASE_URL and SUPABASE_API_KEY:
        try:
            url = SUPABASE_URL.rstrip("/") + "/auth/v1/user"
            response = requests.get(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": SUPABASE_API_KEY,
                },
                timeout=5,
            )
            if response.status_code != 200:
                logger.warning(
                    "Supabase auth lookup failed: %s %s",
                    response.status_code,
                    response.text,
                )
                return None
            return response.json()
        except Exception as exc:
            logger.warning("Supabase auth lookup error: %s", exc)
            return None

    if SUPABASE_URL:
        try:
            jwks_client = _get_supabase_jwks_client()
            if jwks_client is not None:
                signing_key = jwks_client.get_signing_key_from_jwt(token)
                algorithm = getattr(signing_key, "algorithm", None)
                algorithms = [algorithm] if algorithm else ["ES256", "RS256", "ES384", "RS384"]
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=algorithms,
                    options={"verify_aud": False},
                )
                return payload
        except Exception as exc:
            logger.warning("Supabase JWT validation failed (JWKS): %s", exc)

    logger.warning(
        "Supabase auth is not configured. Set SUPABASE_URL for JWKS verification or provide SUPABASE_JWT_SECRET/SUPABASE_SERVICE_ROLE_KEY."
    )
    return None


def require_supabase_user(f):
    """Decorator to require a valid Supabase access token."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = _get_bearer_token()
        if not token:
            return jsonify({"error": "Authorization bearer token required"}), 401

        user = _verify_supabase_user_token(token)
        if not user:
            return jsonify({"error": "Invalid or expired Supabase token"}), 401

        g.supabase_user = user
        return f(*args, **kwargs)
    return decorated_function


def _is_admin_user(user: Dict[str, Any]) -> bool:
    app_meta = user.get("app_metadata") or {}
    role = app_meta.get("role")
    if isinstance(role, str) and role.strip().lower() == "admin":
        return True

    roles = app_meta.get("roles")
    if isinstance(roles, list):
        return any(
            isinstance(entry, str) and entry.strip().lower() == "admin"
            for entry in roles
        )

    return False


def _is_agent_task_allowed(task_name: str, user: Dict[str, Any]) -> bool:
    if _is_admin_user(user):
        return True
    return task_name == "chat"


def _create_agent_session(token: str, user_id: str) -> Tuple[str, int]:
    _purge_expired_agent_sessions()
    session_id = secrets.token_urlsafe(32)
    expires_at = int(time.time()) + AGENT_SESSION_TTL_SECONDS
    AGENT_SESSIONS[session_id] = {
        "token": token,
        "user_id": user_id,
        "expires_at": expires_at,
    }
    return session_id, expires_at


def _get_agent_session() -> Optional[Dict[str, Any]]:
    _purge_expired_agent_sessions()
    session_id = request.cookies.get(AGENT_SESSION_COOKIE)
    if not session_id:
        return None
    session = AGENT_SESSIONS.get(session_id)
    if not session:
        return None
    if session["expires_at"] <= time.time():
        AGENT_SESSIONS.pop(session_id, None)
        return None
    return session


def require_agent_session(f):
    """Decorator to require a valid agent session cookie."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        session = _get_agent_session()
        user = getattr(g, "supabase_user", None)
        user_id = _get_supabase_user_id(user or {})
        if not session or not user_id or session.get("user_id") != user_id:
            return jsonify({"error": "Agent session required"}), 401

        g.agent_session = session
        return f(*args, **kwargs)
    return decorated_function


def _create_batch_session_token() -> str:
    timestamp = int(time.time())
    ts_bytes = str(timestamp).encode("utf-8")
    signature = hmac.new(API_KEY.encode("utf-8"), ts_bytes, hashlib.sha256).hexdigest()
    return f"{timestamp}.{signature}"


def _is_valid_batch_session(token: Optional[str]) -> bool:
    if not token:
        return False
    try:
        ts_str, signature = token.split(".", 1)
        timestamp = int(ts_str)
    except Exception:
        return False

    if timestamp <= 0:
        return False
    if (time.time() - timestamp) > BATCH_SESSION_TTL_SECONDS:
        return False

    expected = hmac.new(API_KEY.encode("utf-8"), ts_str.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


def is_valid_api_key(provided_key: Optional[str]) -> bool:
    if not provided_key:
        return False
    return hmac.compare_digest(provided_key, API_KEY)

def require_api_key(f):
    """Decorator to require API key authentication for protected routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        provided_key = request.headers.get('X-API-Key')
        
        # Log all API requests for audit trail
        logger.info(
            f"API Request: {request.method} {request.path} from {request.remote_addr} "
            f"- Auth: {'Valid' if is_valid_api_key(provided_key) else 'Invalid/Missing'}"
        )
        
        if not provided_key:
            logger.warning(f"Unauthorized request (no API key): {request.path} from {request.remote_addr}")
            return jsonify({"error": "API key required", "code": "AUTH_REQUIRED"}), 401
        
        if not is_valid_api_key(provided_key):
            logger.warning(f"Unauthorized request (invalid API key): {request.path} from {request.remote_addr}")
            return jsonify({"error": "Invalid API key", "code": "AUTH_INVALID"}), 401
        
        return f(*args, **kwargs)
    return decorated_function


def require_batch_session_or_api_key(f):
    """Decorator allowing either API key header or a signed batch session cookie."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        provided_key = request.headers.get('X-API-Key')
        if provided_key and is_valid_api_key(provided_key):
            return f(*args, **kwargs)

        token = request.cookies.get(BATCH_SESSION_COOKIE)
        if not _is_valid_batch_session(token):
            logger.warning(
                "Unauthorized batch request: %s from %s",
                request.path,
                request.remote_addr,
            )
            return jsonify({"error": "Batch session required", "code": "AUTH_REQUIRED"}), 401

        return f(*args, **kwargs)
    return decorated_function

# ── Input Validation ─────────────────────────────────────────────
def validate_layer_config(config: Any) -> Dict[str, Any]:
    """
    Validate and sanitize layer extraction configuration.
    Prevents injection attacks and ensures data integrity.
    """
    if not isinstance(config, dict):
        raise ValueError("Config must be a JSON object")
    
    # Validate and sanitize layers
    layers = config.get('layers', [])
    if not isinstance(layers, list):
        raise ValueError("'layers' must be an array")
    if len(layers) > 100:  # Prevent DoS via excessive layers
        raise ValueError("Maximum 100 layers allowed")
    
    sanitized_layers = []
    for layer in layers:
        if not isinstance(layer, str):
            continue
        # Remove potentially dangerous characters, allow alphanumeric, dash, underscore, space
        sanitized = re.sub(r'[^a-zA-Z0-9\-_ ]', '', layer.strip())
        if sanitized and len(sanitized) <= 255:
            sanitized_layers.append(sanitized)
    
    # Validate block reference path if provided
    ref_dwg = config.get('ref_dwg', '')
    if ref_dwg:
        if not isinstance(ref_dwg, str):
            raise ValueError("'ref_dwg' must be a string")
        # Prevent path traversal attacks
        if '..' in ref_dwg or ref_dwg.startswith(('/', '\\\\')):
            raise ValueError("Invalid reference path")
        # Ensure .dwg extension
        if not ref_dwg.lower().endswith('.dwg'):
            raise ValueError ("'ref_dwg' must have .dwg extension")
    
    # Validate block name if provided
    block_name = config.get('block_name', '')
    if block_name:
        if not isinstance(block_name, str):
            raise ValueError("'block_name' must be a string")
        # Sanitize block name
        block_name = re.sub(r'[^a-zA-Z0-9\-_]', '', block_name.strip())
        if len(block_name) > 255:
            raise ValueError("Block name too long")
    
    return {
        'layers': sanitized_layers,
        'ref_dwg': ref_dwg.strip() if ref_dwg else '',
        'block_name': block_name,
        'export_excel': bool(config.get('export_excel', False))
    }


# ── Transmittal Builder helpers ─────────────────────────────────
def _parse_json_field(name: str, default):
    raw = request.form.get(name)
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def _save_upload(file_storage, dest_dir: str, filename: Optional[str] = None) -> str:
    if file_storage is None:
        raise ValueError("Missing file upload")
    safe_name = secure_filename(filename or file_storage.filename or "upload")
    if not safe_name:
        safe_name = "upload"
    path = os.path.join(dest_dir, safe_name)
    file_storage.save(path)
    return path


def _schedule_cleanup(path: str) -> None:
    """Ensure temporary directories are removed after the response is sent."""
    if not path:
        return

    @after_this_request
    def _cleanup(response):
        try:
            shutil.rmtree(path, ignore_errors=True)
        except Exception as exc:
            logger.warning("Failed to cleanup temp dir %s: %s", path, exc)
        return response


def _convert_docx_to_pdf(docx_path: str, output_dir: str) -> Tuple[Optional[str], str]:
    """Convert a DOCX file to PDF. Returns (pdf_path, error_message)."""
    errors: List[str] = []

    # Attempt conversion with docx2pdf (requires Word on Windows or macOS)
    try:
        from docx2pdf import convert  # type: ignore

        convert(docx_path, output_dir)
        pdf_path = os.path.join(
            output_dir, f"{Path(docx_path).stem}.pdf"
        )
        if os.path.exists(pdf_path):
            return pdf_path, ""
        errors.append("docx2pdf did not produce a PDF file.")
    except Exception as exc:
        errors.append(f"docx2pdf failed: {exc}")

    # Attempt conversion with LibreOffice if available
    for cmd in ("soffice", "libreoffice"):
        exe = shutil.which(cmd)
        if not exe:
            continue
        try:
            result = subprocess.run(
                [
                    exe,
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    output_dir,
                    docx_path,
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode == 0:
                pdf_path = os.path.join(
                    output_dir, f"{Path(docx_path).stem}.pdf"
                )
                if os.path.exists(pdf_path):
                    return pdf_path, ""
            errors.append(
                f"{cmd} conversion failed: {(result.stderr or result.stdout).strip()}"
            )
        except Exception as exc:
            errors.append(f"{cmd} conversion error: {exc}")

    return None, "; ".join([e for e in errors if e]) or "No PDF converter available."


# ── Batch Find & Replace helpers ───────────────────────────────
MAX_BATCH_FILES = 50
MAX_BATCH_RULES = 100
MAX_PREVIEW_MATCHES = 500
MAX_APPLY_CHANGE_ROWS = 5000


def _parse_batch_rules() -> List[Dict[str, Any]]:
    raw_rules = request.form.get("rules", "")
    if not raw_rules:
        raise ValueError("Missing rules payload")

    try:
        parsed = json.loads(raw_rules)
    except Exception:
        raise ValueError("Rules payload is not valid JSON")

    if not isinstance(parsed, list):
        raise ValueError("Rules payload must be an array")
    if len(parsed) == 0:
        raise ValueError("At least one rule is required")
    if len(parsed) > MAX_BATCH_RULES:
        raise ValueError(f"Too many rules. Maximum is {MAX_BATCH_RULES}")

    rules: List[Dict[str, Any]] = []
    for idx, item in enumerate(parsed):
        if not isinstance(item, dict):
            continue
        find_text = str(item.get("find", "")).strip()
        if not find_text:
            continue

        rules.append(
            {
                "id": str(item.get("id", f"rule-{idx + 1}")),
                "find": find_text,
                "replace": str(item.get("replace", "")),
                "use_regex": bool(item.get("useRegex", False)),
                "match_case": bool(item.get("matchCase", False)),
            }
        )

    if not rules:
        raise ValueError("No valid rules provided")

    return rules


def _decode_uploaded_text(raw_bytes: bytes) -> str:
    if b"\x00" in raw_bytes:
        raise ValueError("Binary files are not supported")

    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return raw_bytes.decode(encoding)
        except Exception:
            continue

    raise ValueError("Unable to decode file as text")


def _build_batch_pattern(rule: Dict[str, Any]) -> re.Pattern[str]:
    flags = 0 if rule["match_case"] else re.IGNORECASE
    if rule["use_regex"]:
        try:
            return re.compile(rule["find"], flags)
        except re.error as exc:
            raise ValueError(f"Invalid regex for rule '{rule['id']}': {exc}")

    return re.compile(re.escape(rule["find"]), flags)


def _apply_rule_to_lines(
    lines: List[str],
    pattern: re.Pattern[str],
    replacement: str,
    rule_id: str,
    file_name: str,
    preview_matches: List[Dict[str, Any]],
    max_matches: int,
) -> Tuple[List[str], int]:
    changed_count = 0
    next_lines: List[str] = []

    for line_number, line in enumerate(lines, start=1):
        updated_line, replaced = pattern.subn(replacement, line)
        if replaced > 0:
            changed_count += replaced
            if len(preview_matches) < max_matches:
                preview_matches.append(
                    {
                        "file": file_name,
                        "line": line_number,
                        "before": line[:500],
                        "after": updated_line[:500],
                        "ruleId": rule_id,
                    }
                )
        next_lines.append(updated_line)

    return next_lines, changed_count


def _process_batch_files(preview_only: bool) -> Dict[str, Any]:
    uploaded_files = request.files.getlist("files")
    if not uploaded_files:
        raise ValueError("No files uploaded")
    if len(uploaded_files) > MAX_BATCH_FILES:
        raise ValueError(f"Too many files. Maximum is {MAX_BATCH_FILES}")

    rules = _parse_batch_rules()
    max_matches = MAX_PREVIEW_MATCHES if preview_only else MAX_APPLY_CHANGE_ROWS
    preview_matches: List[Dict[str, Any]] = []
    updated_files: List[Dict[str, str]] = []
    files_changed = 0
    replacements_total = 0

    for file_storage in uploaded_files:
        file_name = secure_filename(file_storage.filename or "upload.txt")
        if not file_name:
            file_name = "upload.txt"

        try:
            raw_bytes = file_storage.read()
        finally:
            try:
                file_storage.close()
            except Exception:
                pass
        content = _decode_uploaded_text(raw_bytes)

        line_break = "\r\n" if "\r\n" in content else "\n"
        lines = content.splitlines()
        file_replacements = 0

        for rule in rules:
            pattern = _build_batch_pattern(rule)
            lines, changed = _apply_rule_to_lines(
                lines,
                pattern,
                rule["replace"],
                rule["id"],
                file_name,
                preview_matches,
                max_matches,
            )
            file_replacements += changed

        if file_replacements > 0:
            files_changed += 1
            replacements_total += file_replacements

        if not preview_only:
            updated_files.append(
                {
                    "file": file_name,
                    "content": line_break.join(lines),
                }
            )

    return {
        "matches": preview_matches,
        "files_changed": files_changed,
        "replacements": replacements_total,
        "files_processed": len(uploaded_files),
        "updated_files": updated_files,
    }


def export_batch_changes_to_excel(changes: List[Dict[str, Any]]) -> Tuple[str, str]:
    """
    Export batch find/replace changes to an Excel report.
    Styled similarly to Ground Grid coordinate export workbook.
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = tempfile.mkdtemp(prefix="batch_find_replace_")
    out_path = os.path.join(out_dir, f"batch_find_replace_changes_{timestamp}.xlsx")

    wb = Workbook()
    ws = wb.active
    ws.title = "Changes"
    summary_ws = wb.create_sheet("Summary")

    headers = ["File", "Line", "Rule ID", "Before", "After"]

    title_fill = PatternFill("solid", fgColor="2B6CB5")
    title_font = Font(bold=True, color="FFFFFF", size=14, name="Arial")
    header_fill = PatternFill("solid", fgColor="3A3F47")
    header_font = Font(bold=True, color="F0F0F0", size=11, name="Arial")
    alt_fill_even = PatternFill("solid", fgColor="E8E6E2")
    alt_fill_odd = PatternFill("solid", fgColor="D4D1CC")
    data_font = Font(size=10, color="2A2A2A", name="Arial")
    border_side = Side(style="thin", color="B0ADA8")
    all_border = Border(left=border_side, right=border_side, top=border_side, bottom=border_side)
    header_border = Border(
        left=border_side,
        right=border_side,
        top=border_side,
        bottom=Side(style="medium", color="3A3F47"),
    )

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
    title_cell = ws.cell(row=1, column=1, value="Batch Find & Replace Change Report")
    title_cell.font = title_font
    title_cell.fill = title_fill
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    title_cell.border = all_border
    for col_idx in range(2, len(headers) + 1):
        c = ws.cell(row=1, column=col_idx)
        c.fill = title_fill
        c.border = all_border

    for col_idx, h in enumerate(headers, start=1):
        c = ws.cell(row=2, column=col_idx, value=h)
        c.font = header_font
        c.fill = header_fill
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = header_border

    for row_idx, change in enumerate(changes, start=3):
        row_fill = alt_fill_even if (row_idx - 3) % 2 == 0 else alt_fill_odd
        row_values = [
            str(change.get("file", "")),
            int(change.get("line", 0) or 0),
            str(change.get("ruleId", "")),
            str(change.get("before", "")),
            str(change.get("after", "")),
        ]

        for col_idx, value in enumerate(row_values, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.fill = row_fill
            cell.border = all_border
            cell.font = data_font
            if col_idx == 2:
                cell.alignment = Alignment(horizontal="right", vertical="top")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)

    ws.column_dimensions[get_column_letter(1)].width = 42
    ws.column_dimensions[get_column_letter(2)].width = 10
    ws.column_dimensions[get_column_letter(3)].width = 16
    ws.column_dimensions[get_column_letter(4)].width = 60
    ws.column_dimensions[get_column_letter(5)].width = 60

    ws.row_dimensions[1].height = 28
    ws.row_dimensions[2].height = 22
    ws.freeze_panes = "A3"

    summary_headers = ["Metric", "Value"]
    summary_title_fill = PatternFill("solid", fgColor="2B6CB5")
    summary_title_font = Font(bold=True, color="FFFFFF", size=14, name="Arial")
    summary_header_fill = PatternFill("solid", fgColor="3A3F47")
    summary_header_font = Font(bold=True, color="F0F0F0", size=11, name="Arial")
    summary_data_font = Font(size=10, color="2A2A2A", name="Arial")

    summary_ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=2)
    summary_title_cell = summary_ws.cell(row=1, column=1, value="Batch Find & Replace Summary")
    summary_title_cell.font = summary_title_font
    summary_title_cell.fill = summary_title_fill
    summary_title_cell.alignment = Alignment(horizontal="center", vertical="center")
    summary_title_cell.border = all_border
    summary_ws.cell(row=1, column=2).fill = summary_title_fill
    summary_ws.cell(row=1, column=2).border = all_border

    for col_idx, header in enumerate(summary_headers, start=1):
        c = summary_ws.cell(row=2, column=col_idx, value=header)
        c.font = summary_header_font
        c.fill = summary_header_fill
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = header_border

    file_counts: Dict[str, int] = {}
    rule_counts: Dict[str, int] = {}
    for change in changes:
        file_name = str(change.get("file", "")) or "(unknown)"
        rule_id = str(change.get("ruleId", "")) or "(unknown)"
        file_counts[file_name] = file_counts.get(file_name, 0) + 1
        rule_counts[rule_id] = rule_counts.get(rule_id, 0) + 1

    summary_rows: List[Tuple[str, Any]] = [
        ("Total changes", len(changes)),
        ("Files with changes", len(file_counts)),
        ("Rules with changes", len(rule_counts)),
    ]

    current_row = 3
    for idx, (metric, value) in enumerate(summary_rows):
        row_fill = alt_fill_even if idx % 2 == 0 else alt_fill_odd
        metric_cell = summary_ws.cell(row=current_row, column=1, value=metric)
        value_cell = summary_ws.cell(row=current_row, column=2, value=value)
        for c in (metric_cell, value_cell):
            c.fill = row_fill
            c.border = all_border
            c.font = summary_data_font
            c.alignment = Alignment(horizontal="left", vertical="center")
        current_row += 1

    current_row += 1
    section_header = summary_ws.cell(row=current_row, column=1, value="By File")
    section_header.font = summary_header_font
    section_header.fill = summary_header_fill
    section_header.alignment = Alignment(horizontal="left", vertical="center")
    section_header.border = header_border
    summary_ws.cell(row=current_row, column=2, value="Changes")
    summary_ws.cell(row=current_row, column=2).font = summary_header_font
    summary_ws.cell(row=current_row, column=2).fill = summary_header_fill
    summary_ws.cell(row=current_row, column=2).alignment = Alignment(horizontal="center", vertical="center")
    summary_ws.cell(row=current_row, column=2).border = header_border
    current_row += 1

    for idx, (file_name, count) in enumerate(sorted(file_counts.items(), key=lambda item: item[0].lower())):
        row_fill = alt_fill_even if idx % 2 == 0 else alt_fill_odd
        file_cell = summary_ws.cell(row=current_row, column=1, value=file_name)
        count_cell = summary_ws.cell(row=current_row, column=2, value=count)
        for c in (file_cell, count_cell):
            c.fill = row_fill
            c.border = all_border
            c.font = summary_data_font
        file_cell.alignment = Alignment(horizontal="left", vertical="center")
        count_cell.alignment = Alignment(horizontal="right", vertical="center")
        current_row += 1

    current_row += 1
    section_header = summary_ws.cell(row=current_row, column=1, value="By Rule")
    section_header.font = summary_header_font
    section_header.fill = summary_header_fill
    section_header.alignment = Alignment(horizontal="left", vertical="center")
    section_header.border = header_border
    summary_ws.cell(row=current_row, column=2, value="Changes")
    summary_ws.cell(row=current_row, column=2).font = summary_header_font
    summary_ws.cell(row=current_row, column=2).fill = summary_header_fill
    summary_ws.cell(row=current_row, column=2).alignment = Alignment(horizontal="center", vertical="center")
    summary_ws.cell(row=current_row, column=2).border = header_border
    current_row += 1

    for idx, (rule_id, count) in enumerate(sorted(rule_counts.items(), key=lambda item: item[0].lower())):
        row_fill = alt_fill_even if idx % 2 == 0 else alt_fill_odd
        rule_cell = summary_ws.cell(row=current_row, column=1, value=rule_id)
        count_cell = summary_ws.cell(row=current_row, column=2, value=count)
        for c in (rule_cell, count_cell):
            c.fill = row_fill
            c.border = all_border
            c.font = summary_data_font
        rule_cell.alignment = Alignment(horizontal="left", vertical="center")
        count_cell.alignment = Alignment(horizontal="right", vertical="center")
        current_row += 1

    summary_ws.column_dimensions[get_column_letter(1)].width = 52
    summary_ws.column_dimensions[get_column_letter(2)].width = 16
    summary_ws.row_dimensions[1].height = 28
    summary_ws.row_dimensions[2].height = 22
    summary_ws.freeze_panes = "A3"

    wb.save(out_path)
    return out_path, out_dir

# Global AutoCAD manager instance
_manager = None
FOUNDATION_SOURCE_TYPE = "Foundation Coordinates"


# ── Late-bound COM helpers (from coordtable) ────────────────────
def dyn(obj: Any) -> Any:
    """
    Force late-bound dynamic dispatch on a COM object.
    Avoids stale gen_py wrappers and CDispatch type errors.
    """
    try:
        if type(obj).__name__ == "CDispatch":
            return obj
    except Exception:
        pass

    try:
        ole = obj._oleobj_
    except Exception:
        ole = obj

    try:
        if not AUTOCAD_COM_AVAILABLE:
            return obj
        disp = ole.QueryInterface(pythoncom.IID_IDispatch)
        return win32com.client.dynamic.Dispatch(disp)
    except Exception:
        try:
            return win32com.client.dynamic.Dispatch(obj)
        except Exception:
            return obj


def connect_autocad() -> Any:
    """Connect to AutoCAD using late-bound dynamic dispatch (no gen_py)."""
    if not AUTOCAD_COM_AVAILABLE:
        raise RuntimeError("AutoCAD COM bridge unavailable on this platform. Run backend on Windows with pywin32 installed.")
    acad = win32com.client.dynamic.Dispatch("AutoCAD.Application")
    if acad is None:
        raise RuntimeError("Could not connect to AutoCAD.Application")
    return dyn(acad)


def com_call_with_retry(callable_func, max_retries: int = 25, initial_delay: float = 0.03):
    """Retry COM calls that get RPC_E_CALL_REJECTED (AutoCAD busy)."""
    delay = initial_delay
    for _ in range(max_retries):
        try:
            return callable_func()
        except pythoncom.com_error as e:
            if e.args and e.args[0] == -2147418111:  # RPC_E_CALL_REJECTED
                time.sleep(delay)
                delay = min(delay * 1.5, 0.5)
                continue
            raise
    raise RuntimeError("AutoCAD COM call failed: RPC busy too long")


def pt(x: float, y: float, z: float = 0.0):
    if not AUTOCAD_COM_AVAILABLE:
        raise RuntimeError("AutoCAD COM bridge unavailable on this platform")
    return win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_R8, (float(x), float(y), float(z)))


def ensure_layer(doc: Any, layer_name: str) -> None:
    doc = dyn(doc)
    try:
        layers = dyn(doc.Layers)
        try:
            layers.Item(layer_name)
        except Exception:
            layers.Add(layer_name)
    except Exception:
        pass


def wait_for_command_finish(doc: Any, timeout_s: float = 10.0) -> bool:
    doc = dyn(doc)
    t0 = time.time()
    while (time.time() - t0) < timeout_s:
        try:
            names = ""
            if hasattr(doc, "GetVariable"):
                names = str(doc.GetVariable("CMDNAMES") or "")
            if not names.strip():
                return True
        except Exception:
            pass
        time.sleep(0.15)
    return False


_REF_IMPORT_CACHE: Dict[str, str] = {}


def ensure_block_exists(doc: Any, block_name: str, dwg_path: str) -> str:
    doc = dyn(doc)
    dwg_path = os.path.abspath(dwg_path)
    try:
        doc.Blocks.Item(block_name)
        return block_name
    except Exception:
        logger.info(f"Block '{block_name}' not found. Importing via Xref-Bind...")

    if not os.path.exists(dwg_path):
        raise RuntimeError(f"External file not found: {dwg_path}")

    ms = dyn(doc.ModelSpace)
    origin = pt(0, 0, 0)
    xref_name = block_name

    def _attach(name: str):
        if hasattr(ms, "AttachExternalReference"):
            return ms.AttachExternalReference(dwg_path, name, origin, 1.0, 1.0, 1.0, 0.0, False)
        if hasattr(ms, "AttachXref"):
            return ms.AttachXref(dwg_path, name, origin, 1.0, 1.0, 1.0, 0.0, False)
        raise RuntimeError("Neither AttachExternalReference nor AttachXref available.")

    try:
        try:
            xref_obj = com_call_with_retry(lambda: _attach(xref_name))
        except Exception:
            xref_name = f"TEMP_IMPORT_{block_name}_{int(time.time())}"
            xref_obj = com_call_with_retry(lambda: _attach(xref_name))

        cmd = f'_.-XREF _B "{xref_name}" \\n'
        com_call_with_retry(lambda: doc.SendCommand(cmd))
        wait_for_command_finish(doc, timeout_s=20.0)

        try:
            if xref_obj is not None:
                dyn(xref_obj).Delete()
        except Exception:
            pass

        try:
            doc.Blocks.Item(block_name)
            return block_name
        except Exception:
            try:
                doc.Blocks.Item(xref_name)
                return xref_name
            except Exception as exc:
                raise RuntimeError(
                    f"Xref bind completed but block not found. Tried: '{block_name}', '{xref_name}'."
                ) from exc

    except Exception as exc:
        raise RuntimeError(
            f"Failed to import reference DWG.\nDWG: {dwg_path}\nBlock: {block_name}\nDetails: {exc}"
        ) from exc


def insert_reference_block(doc, ms, ref_dwg_path, layer_name, x, y, z, scale, rotation_deg):
    doc = dyn(doc)
    ms = dyn(ms)
    ref_dwg_path = os.path.abspath(ref_dwg_path)

    if not os.path.exists(ref_dwg_path):
        raise RuntimeError(
            f"Reference DWG not found: {ref_dwg_path}\n"
            "Put 'Coordinate Reference Point.dwg' in an 'assets' folder next to api_server.py."
        )

    block_name = os.path.splitext(os.path.basename(ref_dwg_path))[0]
    cache_key = os.path.normcase(ref_dwg_path)

    if cache_key in _REF_IMPORT_CACHE:
        insert_name = _REF_IMPORT_CACHE[cache_key]
    else:
        insert_name = ensure_block_exists(doc, block_name, ref_dwg_path)
        _REF_IMPORT_CACHE[cache_key] = insert_name

    ensure_layer(doc, layer_name)

    def _insert():
        return ms.InsertBlock(
            pt(x, y, z), insert_name,
            float(scale), float(scale), float(scale),
            math.radians(float(rotation_deg)),
        )

    br = com_call_with_retry(_insert)
    br = dyn(br)
    try:
        br.Layer = layer_name
    except Exception:
        pass
    return br


def add_point_label(ms, layer_name, label_text, x, y, z, scale):
    text_height = max(scale * 1.5, 0.5)
    x_offset = scale * 3.0

    def _add():
        return ms.AddText(label_text, pt(x + x_offset, y, z), text_height)

    txt = com_call_with_retry(_add)
    txt = dyn(txt)
    try:
        txt.Layer = layer_name
    except Exception:
        pass
    try:
        txt.Alignment = 0  # acAlignmentLeft
    except Exception:
        pass
    return txt


def default_ref_dwg_path() -> str:
    base = os.path.dirname(os.path.abspath(__file__))
    cand = os.path.join(base, "assets", "Coordinate Reference Point.dwg")
    if os.path.exists(cand):
        return cand
    return os.path.join(base, "Coordinate Reference Point.dwg")


def _entity_bbox(ent):
    ent = dyn(ent)
    try:
        mn, mx = ent.GetBoundingBox()
        minx, miny = float(mn[0]), float(mn[1])
        maxx, maxy = float(mx[0]), float(mx[1])
        minz = float(mn[2]) if len(mn) > 2 else 0.0
        maxz = float(mx[2]) if len(mx) > 2 else 0.0
        if maxx < minx:
            minx, maxx = maxx, minx
        if maxy < miny:
            miny, maxy = maxy, miny
        if maxz < minz:
            minz, maxz = maxz, minz
        return (minx, miny, minz, maxx, maxy, maxz)
    except Exception:
        return None


def _poly_centroid(ent):
    ent = dyn(ent)
    try:
        obj_name = str(ent.ObjectName)
    except Exception:
        obj_name = ''

    coords = []
    try:
        raw = list(ent.Coordinates)
        if obj_name == 'AcDb3dPolyline':
            for i in range(0, len(raw), 3):
                if i + 2 < len(raw):
                    coords.append((float(raw[i]), float(raw[i+1]), float(raw[i+2])))
        else:
            elev = 0.0
            try:
                elev = float(ent.Elevation)
            except Exception:
                pass
            for i in range(0, len(raw), 2):
                if i + 1 < len(raw):
                    coords.append((float(raw[i]), float(raw[i+1]), elev))
    except Exception:
        try:
            n = int(ent.NumberOfVertices)
            elev = 0.0
            try:
                elev = float(ent.Elevation)
            except Exception:
                pass
            for i in range(n):
                p = ent.Coordinate(i)
                z = float(p[2]) if len(p) > 2 else elev
                coords.append((float(p[0]), float(p[1]), z))
        except Exception:
            return None

    if not coords:
        return None

    n = len(coords)
    return (
        sum(p[0] for p in coords) / n,
        sum(p[1] for p in coords) / n,
        sum(p[2] for p in coords) / n,
    )


def _entity_center(ent):
    ent = dyn(ent)
    try:
        obj_name = str(ent.ObjectName)
    except Exception:
        obj_name = ''

    if obj_name in ('AcDbPolyline', 'AcDb2dPolyline', 'AcDb3dPolyline'):
        result = _poly_centroid(ent)
        if result:
            return result

    bbox = _entity_bbox(ent)
    if bbox:
        minx, miny, minz, maxx, maxy, maxz = bbox
        return ((minx + maxx) / 2.0, (miny + maxy) / 2.0, (minz + maxz) / 2.0)

    return None


def export_points_to_excel(points, precision, use_corners, drawing_dir=None):
    """
    Export coordinates to Excel with points organized by layer.
    Each layer gets its own table section with a 2-row gap between layers.
    """
    if drawing_dir:
        out_dir = drawing_dir
    else:
        out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "exports")
    os.makedirs(out_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(out_dir, f"coordinates_{timestamp}.xlsx")

    wb = Workbook()
    ws = wb.active
    ws.title = "Coordinates"

    headers = ["Point ID", "East (X)", "North (Y)", "Elevation (Z)", "Layer"]

    # ── Style definitions ──
    # Row 1: Title banner -- R3P logo blue (#2B6CB5)
    title_fill = PatternFill("solid", fgColor="2B6CB5")
    title_font = Font(bold=True, color="FFFFFF", size=14, name="Arial")
    # Layer section headers -- medium blue
    layer_header_fill = PatternFill("solid", fgColor="5B9BD5")
    layer_header_font = Font(bold=True, color="FFFFFF", size=12, name="Arial")
    # Column headers -- dark charcoal gray
    header_fill = PatternFill("solid", fgColor="3A3F47")
    header_font = Font(bold=True, color="F0F0F0", size=11, name="Arial")
    # Data rows: alternating warm neutrals
    alt_fill_even = PatternFill("solid", fgColor="E8E6E2")
    alt_fill_odd = PatternFill("solid", fgColor="D4D1CC")
    data_font = Font(size=10, color="2A2A2A", name="Arial")
    # Borders: visible but not heavy
    border_side = Side(style="thin", color="B0ADA8")
    all_border = Border(left=border_side, right=border_side, top=border_side, bottom=border_side)
    # Thicker border under header
    header_border = Border(
        left=border_side, right=border_side,
        top=border_side,
        bottom=Side(style="medium", color="3A3F47"),
    )

    # Row 1: merged title "Ground Grid Coordinates"
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
    title_cell = ws.cell(row=1, column=1, value="Ground Grid Coordinates")
    title_cell.font = title_font
    title_cell.fill = title_fill
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    title_cell.border = all_border
    for col_idx in range(2, len(headers) + 1):
        c = ws.cell(row=1, column=col_idx)
        c.fill = title_fill
        c.border = all_border

    num_fmt = "0" if precision <= 0 else "0." + ("0" * precision)
    numeric_cols = {"East (X)", "North (Y)", "Elevation (Z)"}

    # ── Group points by layer ──
    from collections import defaultdict
    points_by_layer = defaultdict(list)
    for p in points:
        layer_name = p.get('layer', 'Default')
        points_by_layer[layer_name].append(p)

    # Sort layers alphabetically for consistent output
    sorted_layers = sorted(points_by_layer.keys())

    current_row = 2  # Start after title row

    # ── Write each layer as a separate table ──
    for layer_idx, layer_name in enumerate(sorted_layers):
        layer_points = points_by_layer[layer_name]
        
        # Layer section header (merged across all columns)
        ws.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=len(headers))
        layer_header_cell = ws.cell(row=current_row, column=1, value=f"Layer: {layer_name}")
        layer_header_cell.font = layer_header_font
        layer_header_cell.fill = layer_header_fill
        layer_header_cell.alignment = Alignment(horizontal="left", vertical="center")
        layer_header_cell.border = all_border
        for col_idx in range(2, len(headers) + 1):
            c = ws.cell(row=current_row, column=col_idx)
            c.fill = layer_header_fill
            c.border = all_border
        ws.row_dimensions[current_row].height = 24
        current_row += 1

        # Column headers for this layer section
        for col_idx, h in enumerate(headers, start=1):
            c = ws.cell(row=current_row, column=col_idx, value=h)
            c.font = header_font
            c.fill = header_fill
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            c.border = header_border
        ws.row_dimensions[current_row].height = 22
        current_row += 1

        # Data rows for this layer
        for idx, p in enumerate(layer_points):
            row = [
                p['name'],
                p['x'],
                p['y'],
                p['z'],
                p.get('layer', ''),
            ]
            row_fill = alt_fill_even if idx % 2 == 0 else alt_fill_odd
            for col_idx, value in enumerate(row, start=1):
                cell = ws.cell(row=current_row, column=col_idx, value=value)
                cell.fill = row_fill
                cell.border = all_border
                cell.font = data_font
                if headers[col_idx - 1] in numeric_cols:
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                    if isinstance(cell.value, (int, float)):
                        cell.number_format = num_fmt
                elif col_idx == 1:
                    cell.font = Font(bold=True, size=10, color="2A2A2A", name="Arial")
                    cell.alignment = Alignment(horizontal="left", vertical="center")
                else:
                    cell.alignment = Alignment(horizontal="left", vertical="center")
            current_row += 1

        # Add 2-row gap between layer sections (except after last layer)
        if layer_idx < len(sorted_layers) - 1:
            current_row += 2

    # Auto-fit column widths based on all data
    for col_idx, h in enumerate(headers, start=1):
        col_letter = get_column_letter(col_idx)
        width = len(h)
        for p in points:
            for field_idx, field in enumerate([p['name'], p['x'], p['y'], p['z'], p.get('layer', '')]):
                if field_idx + 1 == col_idx:
                    width = max(width, len(str(field)))
        ws.column_dimensions[col_letter].width = min(max(width + 3, 14), 70)
    
    ws.row_dimensions[1].height = 28
    ws.freeze_panes = "A3"
    
    wb.save(out_path)
    return out_path


class AutoCADManager:
    """
    Thread-safe AutoCAD connection manager
    Uses late-bound COM (dynamic dispatch) to avoid gen_py cache issues.
    """
    
    def __init__(self):
        self.start_time = time.time()
        self._lock = threading.Lock()
        self._cached_status = None
        self._cache_ttl = 2.0  # Cache status for 2 seconds
        self.last_check_time = 0
        
        print("[AutoCADManager] Initialized")
    
    def is_autocad_process_running(self) -> Tuple[bool, Optional[str]]:
        """
        Check if acad.exe process is running on Windows
        Returns: (is_running, process_exe_path)
        """
        try:
            for proc in psutil.process_iter(['name', 'exe']):
                try:
                    proc_name = proc.info.get('name', '').lower()
                    if proc_name == 'acad.exe':
                        return (True, proc.info.get('exe'))
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
        except Exception as e:
            print(f"[AutoCADManager] Error checking process: {e}")
        
        return (False, None)
    
    def _fresh_com_connection(self) -> Tuple[Any, Any, bool, Optional[str], Optional[str]]:
        """
        Get a FRESH late-bound COM connection every time.
        Never caches COM objects across calls (avoids stale ref issues).
        Returns: (acad, doc, drawing_open, drawing_name, error_message)
        """
        if not AUTOCAD_COM_AVAILABLE:
            return (None, None, False, None, "AutoCAD COM is unavailable in this environment (Windows + pywin32 required)")
        try:
            acad = connect_autocad()
            
            try:
                doc = dyn(acad.ActiveDocument)
                if doc is None:
                    return (acad, None, False, None, "No drawing is open")
                
                try:
                    drawing_name = str(doc.Name)
                except Exception:
                    drawing_name = "Unknown"
                
                return (acad, doc, True, drawing_name, None)
                
            except Exception as e:
                return (acad, None, False, None, f"Cannot access ActiveDocument: {str(e)}")
                
        except Exception as e:
            return (None, None, False, None, f"Cannot connect to AutoCAD: {str(e)}")
    
    def get_status(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Get comprehensive AutoCAD status.
        Uses process-level caching only; COM refs are always fresh.
        """
        with self._lock:
            current_time = time.time()
            
            # Return cached status if still valid
            if not force_refresh and self._cached_status is not None:
                if current_time - self._cached_status['timestamp'] < self._cache_ttl:
                    return self._cached_status
            
            if not AUTOCAD_COM_AVAILABLE:
                status = {
                    'connected': False,
                    'autocad_running': False,
                    'drawing_open': False,
                    'drawing_name': None,
                    'autocad_path': None,
                    'error': 'AutoCAD COM unavailable (run on Windows with pywin32 and AutoCAD)',
                    'checks': {'process': False, 'com': False, 'document': False},
                    'backend_uptime': current_time - self.start_time,
                    'timestamp': current_time,
                    'degraded_mode': True,
                }
                self._cached_status = status
                self.last_check_time = current_time
                return status

            process_running, acad_path = self.is_autocad_process_running()
            
            if not process_running:
                status = {
                    'connected': False,
                    'autocad_running': False,
                    'drawing_open': False,
                    'drawing_name': None,
                    'autocad_path': None,
                    'error': 'AutoCAD process (acad.exe) not detected',
                    'checks': {'process': False, 'com': False, 'document': False},
                    'backend_uptime': current_time - self.start_time,
                    'timestamp': current_time
                }
            else:
                # Fresh COM connection every time (no stale refs)
                try:
                    pythoncom.CoInitialize()
                    acad, doc, drawing_ok, drawing_name, error = self._fresh_com_connection()
                    com_ok = acad is not None
                except Exception as e:
                    com_ok, drawing_ok, drawing_name, error = False, False, None, str(e)
                finally:
                    try:
                        pythoncom.CoUninitialize()
                    except:
                        pass
                
                status = {
                    'connected': com_ok,
                    'autocad_running': process_running,
                    'drawing_open': drawing_ok,
                    'drawing_name': drawing_name,
                    'autocad_path': acad_path,
                    'error': error,
                    'checks': {
                        'process': process_running,
                        'com': com_ok,
                        'document': drawing_ok
                    },
                    'backend_uptime': current_time - self.start_time,
                    'timestamp': current_time
                }
            
            self._cached_status = status
            self.last_check_time = current_time
            return status
    
    def get_layers(self) -> Tuple[bool, List[str], Optional[str]]:
        """
        Get list of layer names from active drawing.
        Uses fresh late-bound COM connection every call.
        """
        status = self.get_status()
        
        if not status['drawing_open']:
            return (False, [], status.get('error', 'No drawing open'))
        
        try:
            pythoncom.CoInitialize()
            
            acad = connect_autocad()
            doc = dyn(acad.ActiveDocument)
            
            if doc is None:
                return (False, [], 'Document reference lost')
            
            layers = []
            layer_collection = dyn(doc.Layers)
            for i in range(int(layer_collection.Count)):
                layer = dyn(layer_collection.Item(i))
                layers.append(str(layer.Name))
            
            return (True, sorted(layers), None)
            
        except Exception as e:
            return (False, [], f'COM error: {str(e)}')
        finally:
            try:
                pythoncom.CoUninitialize()
            except:
                pass
    
    def execute_layer_search(self, config: Dict) -> Dict[str, Any]:
        """
        Execute layer search matching the desktop coordinatesgrabber.py logic:
        - Find entities on target layer in ModelSpace
        - Compute ONE center point per entity (not per vertex)
        - Insert reference blocks at each point
        - Export Excel and auto-open it
        """
        try:
            pythoncom.CoInitialize()

            acad = connect_autocad()
            doc = dyn(acad.ActiveDocument)
            ms = dyn(doc.ModelSpace)

            if doc is None or ms is None:
                raise RuntimeError('Cannot access AutoCAD document or modelspace')

            raw_layers = config.get('layer_search_names')
            requested_layers = []
            if isinstance(raw_layers, list):
                requested_layers.extend(
                    [str(layer).strip() for layer in raw_layers if str(layer).strip()]
                )

            fallback_layers_raw = str(config.get('layer_search_name', '')).strip()
            if fallback_layers_raw:
                for part in re.split(r'[;,\n]+', fallback_layers_raw):
                    layer_name_part = part.strip()
                    if layer_name_part:
                        requested_layers.append(layer_name_part)

            requested_layers = list(dict.fromkeys(requested_layers))

            if not requested_layers:
                return {
                    'success': False,
                    'points': [],
                    'count': 0,
                    'layers': [],
                    'excel_path': '',
                    'blocks_inserted': 0,
                    'error': 'No layer names provided'
                }

            requested_layer_lookup = {layer.strip().lower() for layer in requested_layers}
            prefix = config.get('prefix', 'P')
            start_num = int(config.get('initial_number', 1))
            precision = int(config.get('precision', 3))
            use_corners = config.get('layer_search_use_corners', False)

            points = []
            point_num = start_num
            entities_scanned = 0

            entity_count = int(ms.Count)
            for idx in range(entity_count):
                try:
                    ent = dyn(ms.Item(idx))

                    try:
                        ent_layer = str(ent.Layer)
                    except Exception:
                        continue

                    ent_layer_normalized = ent_layer.strip().lower()
                    if ent_layer_normalized not in requested_layer_lookup:
                        continue

                    entities_scanned += 1

                    if use_corners:
                        bbox = _entity_bbox(ent)
                        if not bbox:
                            continue
                        minx, miny, minz, maxx, maxy, maxz = bbox
                        z_val = (minz + maxz) / 2.0
                        corner_defs = [
                            (minx, maxy, 'NW'),
                            (maxx, maxy, 'NE'),
                            (minx, miny, 'SW'),
                            (maxx, miny, 'SE'),
                        ]
                        for cx, cy, corner_name in corner_defs:
                            points.append({
                                'name': f'{prefix}{point_num}_{corner_name}',
                                'x': round(cx, precision),
                                'y': round(cy, precision),
                                'z': round(z_val, precision),
                                'corner': corner_name,
                                'source_type': FOUNDATION_SOURCE_TYPE,
                                'layer': ent_layer.strip(),
                            })
                            point_num += 1
                    else:
                        center = _entity_center(ent)
                        if not center:
                            continue
                        cx, cy, cz = center
                        points.append({
                            'name': f'{prefix}{point_num}',
                            'x': round(cx, precision),
                            'y': round(cy, precision),
                            'z': round(cz, precision),
                            'source_type': FOUNDATION_SOURCE_TYPE,
                            'layer': ent_layer.strip(),
                        })
                        point_num += 1

                except Exception as e:
                    print(f"[execute] Entity {idx} error: {e}")
                    continue

            print(f"[execute] Scanned {entities_scanned} entities across layers {requested_layers}, extracted {len(points)} points")

            if not points:
                return {
                    'success': False,
                    'points': [],
                    'count': 0,
                    'layers': requested_layers,
                    'excel_path': '',
                    'blocks_inserted': 0,
                    'error': f'No entities found on requested layers: {", ".join(requested_layers)}'
                }

            ref_dwg = config.get('ref_dwg_path', '').strip()
            if not ref_dwg:
                ref_dwg = default_ref_dwg_path()
            ref_layer = config.get('ref_layer_name', 'Coordinate Reference Point')
            ref_scale = float(config.get('ref_scale', 1.0))
            ref_rotation = float(config.get('ref_rotation_deg', 0))

            blocks_inserted = 0
            block_errors = []
            if os.path.exists(ref_dwg):
                print(f"[execute] Inserting reference blocks from: {ref_dwg}")
                for p in points:
                    try:
                        insert_reference_block(
                            doc, ms, ref_dwg, ref_layer,
                            p['x'], p['y'], p['z'],
                            ref_scale, ref_rotation
                        )
                        try:
                            add_point_label(
                                ms, ref_layer, p['name'],
                                p['x'], p['y'], p['z'],
                                ref_scale,
                            )
                        except Exception as label_err:
                            print(f"[execute] Label at {p['name']}: {label_err}")
                        blocks_inserted += 1
                    except Exception as e:
                        block_errors.append(f"Block at {p['name']}: {e}")
                        print(f"[execute] Block insert error at {p['name']}: {e}")

                try:
                    doc.Regen(1)
                except Exception:
                    pass

                if blocks_inserted > 0:
                    print(f"[execute] Inserted {blocks_inserted} reference blocks")
            else:
                block_errors.append(f"Reference DWG not found: {ref_dwg}")
                print(f"[execute] WARNING: Reference DWG not found at {ref_dwg}, skipping block insertion")

            drawing_dir = None
            try:
                drawing_path = str(doc.FullName)
                if drawing_path:
                    drawing_dir = os.path.dirname(drawing_path)
            except Exception:
                pass

            excel_path = ''
            try:
                excel_path = export_points_to_excel(points, precision, use_corners, drawing_dir)
                print(f"[execute] Excel exported to: {excel_path}")
                try:
                    os.startfile(excel_path)
                except Exception:
                    pass
            except Exception as e:
                block_errors.append(f"Excel export: {e}")
                print(f"[execute] Excel export error: {e}")

            return {
                'success': True,
                'points': points,
                'count': len(points),
                'layers': requested_layers,
                'excel_path': excel_path,
                'blocks_inserted': blocks_inserted,
                'block_errors': block_errors if block_errors else None,
                'error': None
            }

        except Exception as e:
            traceback.print_exc()
            return {
                'success': False,
                'points': [],
                'count': 0,
                'layers': [],
                'excel_path': '',
                'blocks_inserted': 0,
                'error': str(e)
            }
        finally:
            try:
                pythoncom.CoUninitialize()
            except:
                pass


# Initialize manager
def get_manager() -> AutoCADManager:
    global _manager
    if _manager is None:
        _manager = AutoCADManager()
    return _manager


# ========== API ENDPOINTS ==========

# ========== AGENT BROKER ENDPOINTS ==========

@app.route('/api/agent/health', methods=['GET'])
@require_supabase_user
def api_agent_health():
    """Proxy ZeroClaw health check through the backend."""
    config_status = _agent_broker_config_status()
    if not config_status["ok"]:
        return jsonify({
            "error": "Agent broker misconfigured",
            "missing": config_status["missing"],
            "warnings": config_status["warnings"],
        }), 503
    try:
        response = requests.get(
            f"{AGENT_GATEWAY_URL.rstrip('/')}/health",
            timeout=3,
        )
        return jsonify(response.json()), response.status_code
    except Exception as exc:
        logger.warning("Agent health proxy failed: %s", exc)
        return jsonify({"error": "Agent gateway unavailable"}), 503


@app.route('/api/agent/config', methods=['GET'])
@require_supabase_user
def api_agent_config():
    """Expose broker configuration readiness (no secrets)."""
    return jsonify(_agent_broker_config_status()), 200


@app.route('/api/agent/session', methods=['GET'])
@require_supabase_user
def api_agent_session():
    """Return whether a valid agent session cookie exists."""
    config_status = _agent_broker_config_status()
    if not config_status["ok"]:
        return jsonify({
            "paired": False,
            "error": "Agent broker misconfigured",
            "missing": config_status["missing"],
            "warnings": config_status["warnings"],
        }), 503
    session = _get_agent_session()
    user_id = _get_supabase_user_id(getattr(g, "supabase_user", {}) or {})
    if session and user_id and session.get("user_id") == user_id:
        return jsonify({
            "paired": True,
            "expires_at": datetime.utcfromtimestamp(session["expires_at"]).isoformat() + "Z",
        })
    return jsonify({"paired": False})


@app.route('/api/agent/pair', methods=['POST'])
@require_supabase_user
@limiter.limit("10 per hour")
def api_agent_pair():
    """Pair with ZeroClaw using a 6-digit code. Sets HttpOnly session cookie."""
    config_status = _agent_broker_config_status()
    if not config_status["ok"]:
        return jsonify({
            "error": "Agent broker misconfigured",
            "missing": config_status["missing"],
            "warnings": config_status["warnings"],
        }), 503
    payload = request.get_json(silent=True) or {}
    pairing_code = (
        payload.get("pairing_code")
        or payload.get("pairingCode")
        or request.headers.get("X-Pairing-Code")
        or ""
    )
    pairing_code = str(pairing_code).strip()

    if not pairing_code:
        return jsonify({"error": "Pairing code required"}), 400

    try:
        response = requests.post(
            f"{AGENT_GATEWAY_URL.rstrip('/')}/pair",
            headers={"X-Pairing-Code": pairing_code},
            timeout=10,
        )
    except Exception as exc:
        logger.warning("Pairing proxy failed: %s", exc)
        return jsonify({"error": "Agent gateway unavailable"}), 503

    if response.status_code != 200:
        return jsonify({
            "error": "Pairing failed",
            "details": response.text,
        }), response.status_code

    try:
        data = response.json()
    except Exception:
        data = {}

    token = data.get("token")
    if not token:
        return jsonify({"error": "Gateway did not return a token"}), 502

    user_id = _get_supabase_user_id(getattr(g, "supabase_user", {}) or {})
    if not user_id:
        return jsonify({"error": "Invalid Supabase user"}), 401

    session_id, expires_at = _create_agent_session(token, user_id)

    response_payload = {
        "paired": True,
        "expires_at": datetime.utcfromtimestamp(expires_at).isoformat() + "Z",
    }
    resp = jsonify(response_payload)
    resp.set_cookie(
        AGENT_SESSION_COOKIE,
        session_id,
        httponly=True,
        samesite=AGENT_SESSION_SAMESITE,
        secure=AGENT_SESSION_SECURE,
        max_age=AGENT_SESSION_TTL_SECONDS,
        path="/",
    )
    return resp


@app.route('/api/agent/unpair', methods=['POST'])
@require_supabase_user
def api_agent_unpair():
    session_id = request.cookies.get(AGENT_SESSION_COOKIE)
    if session_id:
        AGENT_SESSIONS.pop(session_id, None)

    resp = jsonify({"paired": False})
    resp.delete_cookie(AGENT_SESSION_COOKIE, path="/")
    return resp


@app.route('/api/agent/webhook', methods=['POST'])
@require_supabase_user
@require_agent_session
def api_agent_webhook():
    """Proxy webhook requests to ZeroClaw using the server-side session token."""
    config_status = _agent_broker_config_status()
    if not config_status["ok"]:
        return jsonify({
            "error": "Agent broker misconfigured",
            "missing": config_status["missing"],
            "warnings": config_status["warnings"],
        }), 503
    if not request.is_json:
        return jsonify({"error": "Expected JSON payload"}), 400

    if AGENT_REQUIRE_WEBHOOK_SECRET and not AGENT_WEBHOOK_SECRET:
        return jsonify({
            "error": "Agent webhook secret is required but not configured.",
            "missing": ["AGENT_WEBHOOK_SECRET"],
        }), 503

    payload = request.get_json(silent=False)
    raw_message = payload.get("message")
    task_name = ""
    try:
        if isinstance(raw_message, str):
            parsed = json.loads(raw_message)
            if isinstance(parsed, dict):
                task_name = str(parsed.get("task") or "").strip()
                timeout_ms = parsed.get("timeout")
            else:
                timeout_ms = None
        else:
            timeout_ms = None
    except Exception:
        timeout_ms = None

    user = getattr(g, "supabase_user", {}) or {}
    if not task_name and not _is_admin_user(user):
        return jsonify({"error": "Agent task not allowed for this user"}), 403
    if task_name and not _is_agent_task_allowed(task_name, user):
        return jsonify({"error": "Agent task not allowed for this user"}), 403

    timeout_seconds = AGENT_DEFAULT_TIMEOUT_SECONDS
    if isinstance(timeout_ms, (int, float)) and timeout_ms > 0:
        timeout_seconds = min(
            max(int(timeout_ms / 1000), AGENT_DEFAULT_TIMEOUT_SECONDS),
            AGENT_MAX_TIMEOUT_SECONDS,
        )

    session = getattr(g, "agent_session", {})
    token = session.get("token")
    if not token:
        return jsonify({"error": "Agent session missing"}), 401

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    if AGENT_WEBHOOK_SECRET:
        headers["X-Webhook-Secret"] = AGENT_WEBHOOK_SECRET

    try:
        response = requests.post(
            f"{AGENT_GATEWAY_URL.rstrip('/')}/webhook",
            headers=headers,
            json=payload,
            timeout=timeout_seconds,
        )
    except Exception as exc:
        logger.warning("Agent webhook proxy failed: %s", exc)
        return jsonify({"error": "Agent gateway unavailable"}), 503

    if response.status_code in (401, 403):
        # Clear invalid session
        session_id = request.cookies.get(AGENT_SESSION_COOKIE)
        if session_id:
            AGENT_SESSIONS.pop(session_id, None)
        resp = jsonify({"error": "Agent session expired. Please pair again."})
        resp.delete_cookie(AGENT_SESSION_COOKIE, path="/")
        return resp, 401

    try:
        data = response.json()
        return jsonify(data), response.status_code
    except Exception:
        return (response.text or ""), response.status_code

@app.route('/api/status', methods=['GET'])
@require_api_key
def api_status():
    """
    Health check endpoint - returns detailed AutoCAD connection status
    """
    manager = get_manager()
    status = manager.get_status()
    status['backend_id'] = 'coordinates-grabber-api'
    status['backend_version'] = '1.0.0'

    http_code = 200 if status['autocad_running'] else 503

    return jsonify(status), http_code


@app.route('/api/layers', methods=['GET'])
@require_api_key
def api_layers():
    """
    List available layers in the active AutoCAD drawing
    
    Response:
    {
        "success": bool,
        "layers": [str],  # Array of layer names
        "count": int,
        "error": str|null
    }
    """
    manager = get_manager()
    success, layers, error = manager.get_layers()
    
    response = {
        'success': success,
        'layers': layers,
        'count': len(layers),
        'error': error
    }
    
    return jsonify(response), 200 if success else 503


@app.route('/api/selection-count', methods=['GET'])
@require_api_key
@limiter.limit("120 per hour")
def api_selection_count():
    """Get count of currently selected objects in AutoCAD (fresh COM)."""
    manager = get_manager()
    status = manager.get_status()
    
    if not status['drawing_open']:
        return jsonify({'success': False, 'count': 0, 'error': 'No drawing open'}), 503
    
    try:
        pythoncom.CoInitialize()
        acad = connect_autocad()
        if acad is None:
            return jsonify({'success': False, 'count': 0, 'error': 'Cannot connect to AutoCAD'}), 503
        
        doc = dyn(acad.ActiveDocument)
        
        # Try to delete an old temp selection set first
        try:
            old_ss = doc.SelectionSets.Item("TEMP_COUNT")
            old_ss.Delete()
        except Exception:
            pass
        
        ss = doc.SelectionSets.Add("TEMP_COUNT")
        ss.SelectOnScreen()
        count = ss.Count
        ss.Delete()
        
        return jsonify({'success': True, 'count': count, 'error': None})
    
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'count': 0, 'error': f'COM error: {str(e)}'}), 500
    finally:
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass


@app.route('/api/execute', methods=['POST'])
@require_api_key
@limiter.limit("30 per hour")
def api_execute():
    """
    Execute coordinate extraction based on provided configuration.
    Uses late-bound COM via the manager's execute_layer_search method.
    """
    manager = get_manager()
    status = manager.get_status()
    
    if not status['drawing_open']:
        return jsonify({
            'success': False,
            'message': 'No drawing open in AutoCAD',
            'points_created': 0,
            'error_details': 'Please open a drawing before executing'
        }), 400
    
    try:
        if not request.is_json:
            raise ValueError('Expected application/json payload')

        raw_config = request.get_json(silent=False)
        if not raw_config:
            raise ValueError('No configuration provided')
        
        # Validate and sanitize input
        config = validate_layer_config(raw_config)
        
        start_time = time.time()
        
        result = manager.execute_layer_search(config)
        
        duration = time.time() - start_time
        
        if result['success']:
            blocks_inserted = result.get('blocks_inserted', 0)
            block_errors = result.get('block_errors')
            layers = result.get('layers', [])
            if layers:
                msg = f'Extracted {result["count"]} points from {len(layers)} layer(s): {", ".join(layers)}'
            else:
                msg = f'Extracted {result["count"]} points'
            if blocks_inserted > 0:
                msg += f', inserted {blocks_inserted} reference blocks'
            if block_errors:
                msg += f' (warnings: {len(block_errors)})'
            return jsonify({
                'success': True,
                'message': msg,
                'points_created': result['count'],
                'blocks_inserted': blocks_inserted,
                'excel_path': result.get('excel_path', ''),
                'duration_seconds': round(duration, 2),
                'points': result['points'],
                'block_errors': block_errors,
                'error_details': None
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result.get('error', 'No entities found'),
                'points_created': 0,
                'blocks_inserted': 0,
                'excel_path': '',
                'duration_seconds': round(duration, 2),
                'points': [],
                'error_details': result.get('error')
            }), 400
    
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': f'Execution failed: {str(e)}',
            'points_created': 0,
            'error_details': str(e)
        }), 500


@app.route('/api/trigger-selection', methods=['POST'])
@require_api_key
@limiter.limit("120 per hour")
def api_trigger_selection():
    """Bring AutoCAD to foreground (fresh COM)."""
    manager = get_manager()
    status = manager.get_status()
    
    if not status['drawing_open']:
        return jsonify({'success': False, 'message': 'No drawing open'}), 503
    
    try:
        pythoncom.CoInitialize()
        acad = connect_autocad()
        if acad is None:
            return jsonify({'success': False, 'message': 'Cannot connect to AutoCAD'}), 503
        
        acad.Visible = True
        acad.WindowState = 1  # Restore if minimized
        
        return jsonify({'success': True, 'message': 'AutoCAD activated'})
    
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500
    finally:
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass


@app.route('/api/transmittal/render', methods=['POST'])
@require_api_key
@limiter.limit("30 per hour")
def api_transmittal_render():
    """
    Render a transmittal document (standard or CID) and return a DOCX file.
    Expects multipart/form-data with:
      - type: "standard" | "cid"
      - mode: "preview" | "generate" (optional)
      - format: "docx" | "pdf" | "both" (optional)
      - template: DOCX file
      - index: Excel file (standard only)
      - documents: PDF/CID files (standard only)
      - cid_files: CID files (cid only)
      - fields: JSON string
      - checks: JSON string
      - contacts: JSON string
      - cid_index_data: JSON string (cid only)
    """
    if not TRANSMITTAL_RENDER_AVAILABLE:
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Transmittal render helpers not available on server.",
                }
            ),
            503,
        )

    try:
        transmittal_type = request.form.get("type", "standard").lower()
        mode = request.form.get("mode", "generate").lower()
        output_format = request.form.get("format", "docx").lower()
        if output_format not in {"docx", "pdf", "both"}:
            output_format = "docx"
        fields = _parse_json_field("fields", {}) or {}
        checks = _parse_json_field("checks", {}) or {}
        contacts = _parse_json_field("contacts", []) or []
        cid_index_data = _parse_json_field("cid_index_data", []) or []

        # Normalize checks with defaults
        default_checks = {
            "trans_pdf": False,
            "trans_cad": False,
            "trans_originals": False,
            "via_email": False,
            "via_ftp": False,
            "ci_approval": False,
            "ci_bid": False,
            "ci_construction": False,
            "ci_asbuilt": False,
            "ci_reference": False,
            "ci_preliminary": False,
            "ci_info": False,
            "ci_fab": False,
            "ci_const": False,
            "ci_record": False,
            "ci_ref": False,
            "vr_approved": False,
            "vr_approved_noted": False,
            "vr_rejected": False,
        }
        merged_checks = {**default_checks, **checks}
        if not merged_checks.get("ci_const"):
            merged_checks["ci_const"] = merged_checks.get("ci_construction", False)
        if not merged_checks.get("ci_ref"):
            merged_checks["ci_ref"] = merged_checks.get("ci_reference", False)

        # Normalize contacts to expected keys
        normalized_contacts = []
        for c in contacts:
            if not isinstance(c, dict):
                continue
            normalized_contacts.append(
                {
                    "name": str(c.get("name", "")).strip(),
                    "company": str(c.get("company", "")).strip(),
                    "email": str(c.get("email", "")).strip(),
                    "phone": str(c.get("phone", "")).strip(),
                }
            )

        work_dir = tempfile.mkdtemp(prefix="transmittal_")
        _schedule_cleanup(work_dir)
        template_file = request.files.get("template")
        if not template_file:
            return jsonify({"success": False, "message": "Template file is required"}), 400

        template_path = _save_upload(template_file, work_dir, "template.docx")

        project_num = str(fields.get("job_num", "")).strip() or "UNKNOWN"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_stem = "Transmittal"

        if transmittal_type == "cid":
            cid_files = request.files.getlist("cid_files")
            if not cid_files:
                return (
                    jsonify(
                        {
                            "success": False,
                            "message": "CID files are required for CID transmittal",
                        }
                    ),
                    400,
                )
            if not cid_index_data:
                return (
                    jsonify(
                        {
                            "success": False,
                            "message": "CID document index data is required",
                        }
                    ),
                    400,
                )

            cid_dir = os.path.join(work_dir, "cid_files")
            os.makedirs(cid_dir, exist_ok=True)
            for f in cid_files:
                _save_upload(f, cid_dir)

            output_stem = f"CID_Transmittal_{project_num}_{timestamp}"
            output_name = f"{output_stem}.docx"
            out_path = os.path.join(work_dir, output_name)

            render_cid_transmittal(
                template_path,
                cid_dir,
                cid_index_data,
                fields,
                merged_checks,
                normalized_contacts,
                out_path,
            )
        else:
            index_file = request.files.get("index")
            if not index_file:
                return (
                    jsonify(
                        {
                            "success": False,
                            "message": "Drawing index (Excel) file is required",
                        }
                    ),
                    400,
                )
            index_path = _save_upload(index_file, work_dir, "index.xlsx")

            document_files = request.files.getlist("documents")
            if not document_files:
                return (
                    jsonify(
                        {
                            "success": False,
                            "message": "Document files are required for standard transmittal",
                        }
                    ),
                    400,
                )

            docs_dir = os.path.join(work_dir, "documents")
            os.makedirs(docs_dir, exist_ok=True)
            for f in document_files:
                _save_upload(f, docs_dir)

            output_stem = f"Transmittal_{project_num}_{timestamp}"
            output_name = f"{output_stem}.docx"
            out_path = os.path.join(work_dir, output_name)

            render_transmittal(
                template_path,
                docs_dir,
                index_path,
                fields,
                merged_checks,
                normalized_contacts,
                out_path,
                None,
            )

        pdf_path = None
        if output_format in {"pdf", "both"}:
            pdf_path, pdf_error = _convert_docx_to_pdf(out_path, work_dir)
            if not pdf_path:
                return (
                    jsonify(
                        {
                            "success": False,
                            "message": "PDF conversion failed.",
                            "detail": pdf_error,
                        }
                    ),
                    500,
                )

        if output_format == "pdf" and pdf_path:
            return send_file(
                pdf_path,
                as_attachment=True,
                download_name=f"{output_stem}.pdf",
                mimetype="application/pdf",
            )

        if output_format == "both" and pdf_path:
            zip_name = f"{output_stem}.zip"
            zip_path = os.path.join(work_dir, zip_name)
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                zf.write(out_path, arcname=os.path.basename(out_path))
                zf.write(pdf_path, arcname=os.path.basename(pdf_path))
            return send_file(
                zip_path,
                as_attachment=True,
                download_name=zip_name,
                mimetype="application/zip",
            )

        return send_file(
            out_path,
            as_attachment=True,
            download_name=output_name,
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/transmittal/template', methods=['GET'])
@require_api_key
@limiter.limit("60 per hour")
def api_transmittal_template():
    """Download the example transmittal DOCX template bundled with the repo."""
    template_path = (
        Path(__file__).resolve().parent
        / "Transmittal-Builder"
        / "R3P-PRJ#-XMTL-001 - DOCUMENT INDEX.docx"
    )
    if not template_path.exists():
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Example template not found on server.",
                }
            ),
            404,
        )
    return send_file(
        str(template_path),
        as_attachment=True,
        download_name=template_path.name,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@app.route('/api/batch-find-replace/session', methods=['POST'])
@limiter.limit("60 per hour")
def api_batch_find_replace_session():
    token = _create_batch_session_token()
    response = jsonify({"success": True})
    response.set_cookie(
        BATCH_SESSION_COOKIE,
        token,
        httponly=True,
        samesite="Strict",
        secure=request.is_secure,
        max_age=BATCH_SESSION_TTL_SECONDS,
        path="/api/batch-find-replace/",
    )
    return response


@app.route('/api/batch-find-replace/preview', methods=['POST'])
@require_batch_session_or_api_key
@limiter.limit("30 per hour")
def api_batch_find_replace_preview():
    try:
        result = _process_batch_files(preview_only=True)
        return jsonify(
            {
                "success": True,
                "matches": result["matches"],
                "files_processed": result["files_processed"],
                "files_changed": result["files_changed"],
                "replacements": result["replacements"],
                "message": (
                    f"Preview completed: {result['replacements']} replacement(s) "
                    f"across {result['files_changed']} file(s)."
                ),
            }
        )
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.exception("Batch preview failed")
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route('/api/batch-find-replace/apply', methods=['POST'])
@require_batch_session_or_api_key
@limiter.limit("20 per hour")
def api_batch_find_replace_apply():
    try:
        result = _process_batch_files(preview_only=False)
        report_path, report_dir = export_batch_changes_to_excel(result["matches"])
        _schedule_cleanup(report_dir)

        if hasattr(os, "startfile"):
            try:
                os.startfile(report_path)
            except Exception as exc:
                logger.warning("Could not auto-open Excel report: %s", exc)

        return send_file(
            report_path,
            as_attachment=True,
            download_name=os.path.basename(report_path),
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.exception("Batch apply failed")
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route('/health', methods=['GET'])
def health():
    """Simple health check for backend server"""
    return jsonify({
        'status': 'running',
        'server': 'Coordinates Grabber API',
        'backend_id': 'coordinates-grabber-api',
        'version': '1.0.0',
        'timestamp': time.time()
    })


@sock.route('/ws')
def websocket_status_bridge(ws):
    """WebSocket status stream for frontend real-time backend/AutoCAD connectivity updates."""
    provided_key = request.args.get('api_key')
    if not is_valid_api_key(provided_key):
        try:
            ws.send(json.dumps({
                'type': 'error',
                'message': 'Invalid API key',
                'code': 'AUTH_INVALID'
            }))
        finally:
            try:
                ws.close()
            except Exception:
                pass
        logger.warning("Unauthorized websocket connection attempt from %s", request.remote_addr)
        return

    logger.info("WebSocket connected from %s", request.remote_addr)

    try:
        ws.send(json.dumps({
            'type': 'connected',
            'backend_id': 'coordinates-grabber-api',
            'backend_version': '1.0.0',
            'timestamp': time.time(),
        }))

        while True:
            manager = get_manager()
            status = manager.get_status(force_refresh=True)

            ws.send(json.dumps({
                'type': 'status',
                'backend_id': 'coordinates-grabber-api',
                'backend_version': '1.0.0',
                'connected': bool(status.get('connected')),
                'autocad_running': bool(status.get('autocad_running')),
                'drawing_open': bool(status.get('drawing_open')),
                'drawing_name': status.get('drawing_name'),
                'error': status.get('error'),
                'checks': status.get('checks', {}),
                'timestamp': time.time(),
            }))

            try:
                incoming = ws.receive(timeout=0.1)
                if incoming is None:
                    pass
            except TypeError:
                pass
            except Exception:
                pass

            time.sleep(2.0)

    except Exception as exc:
        logger.info("WebSocket disconnected from %s (%s)", request.remote_addr, exc)


# ========== MAIN ==========

if __name__ == '__main__':
    api_host = os.environ.get('API_HOST', '127.0.0.1').strip() or '127.0.0.1'
    api_port = _parse_int_env('API_PORT', 5000, minimum=1)

    print("=" * 60)
    print("🚀 Coordinates Grabber API Server")
    print("=" * 60)
    print(f"Server starting on: http://{api_host}:{api_port}")
    print(f"Health check: http://{api_host}:{api_port}/health")
    print(f"Status endpoint: http://{api_host}:{api_port}/api/status")
    print("")
    print("📋 Prerequisites:")
    print("  - AutoCAD must be running")
    print("  - A drawing must be open in AutoCAD")
    print("  - React frontend should connect to localhost:5000")
    print("")
    print("Press Ctrl+C to stop the server")
    print("=" * 60)
    
    # Initialize manager to show initial status
    manager = get_manager()
    initial_status = manager.get_status()
    
    if initial_status['autocad_running']:
        print(f"✅ AutoCAD detected: {initial_status['autocad_path']}")
        if initial_status['drawing_open']:
            print(f"✅ Drawing open: {initial_status['drawing_name']}")
        else:
            print("⚠️  No drawing is currently open")
    else:
        print("❌ AutoCAD not detected - waiting for it to start...")
    
    print("=" * 60)
    print("")
    
    # Run Flask server
    app.run(
        host=api_host,
        port=api_port,
        debug=False,  # Set to True for development
        threaded=True
    )
