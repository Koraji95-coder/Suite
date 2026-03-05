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
import os
import sys
import tempfile
import shutil
import subprocess
import re
import traceback
import logging
import hmac
import zipfile
import secrets
from functools import wraps
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple
from pathlib import Path
from urllib.parse import urlparse
from werkzeug.utils import secure_filename
import requests
import jwt
from jwt import PyJWKClient
from route_groups import register_route_groups
from route_groups.api_passkey_store_access import (
    fetch_active_passkey_by_credential_id as passkey_store_fetch_active_passkey_by_credential_id,
    fetch_active_passkeys_for_user_id as passkey_store_fetch_active_passkeys_for_user_id,
    insert_user_passkey_row as passkey_store_insert_user_passkey_row,
    update_user_passkey_row as passkey_store_update_user_passkey_row,
)
from route_groups.api_supabase_service_request import (
    extract_supabase_error_message as supabase_service_request_extract_error_helper,
    supabase_rest_base_url as supabase_service_request_base_url_helper,
    supabase_service_rest_headers as supabase_service_request_headers_helper,
    supabase_service_rest_request as supabase_service_request_helper,
)
from route_groups.api_supabase_auth_access import (
    generate_supabase_magic_link_url as supabase_generate_magic_link_url_helper,
    send_supabase_email_link as supabase_send_email_link_helper,
)
from route_groups.api_bootstrap_banner import (
    print_initial_manager_status as bootstrap_print_initial_manager_status_helper,
    print_startup_banner as bootstrap_print_startup_banner_helper,
)
from route_groups.api_server_entrypoint import (
    run_server_entrypoint as server_entrypoint_run_helper,
)
from route_groups.api_autocad_runtime import (
    create_autocad_runtime as autocad_create_runtime_helper,
)
from route_groups.api_websocket_status import (
    websocket_status_bridge as websocket_status_bridge_helper,
)
from route_groups.api_auth_runtime import (
    create_auth_runtime as auth_create_runtime_helper,
)
from route_groups.api_passkey_runtime import (
    create_passkey_runtime as passkey_create_runtime_helper,
)
from route_groups.api_agent_runtime import (
    create_agent_runtime as agent_create_runtime_helper,
)
from route_groups.api_agent_config import (
    agent_broker_config_status as agent_config_status_helper,
)
from route_groups.api_supabase_jwks import (
    get_supabase_jwks_client as supabase_jwks_get_client_helper,
    looks_like_uuid as supabase_jwks_looks_like_uuid_helper,
)
from route_groups.api_email_validation import (
    is_valid_email as email_validation_is_valid_email_helper,
)
from route_groups.api_email_runtime import (
    create_email_runtime as email_create_runtime_helper,
)
from route_groups.api_security_runtime import (
    create_security_runtime as security_create_runtime_helper,
)
from route_groups.api_transmittal_runtime import (
    create_transmittal_runtime as transmittal_create_runtime_helper,
)
from route_groups.api_transmittal_profiles_runtime import (
    create_transmittal_profiles_runtime as transmittal_profiles_create_runtime_helper,
)
from route_groups.api_env_parsing import (
    create_env_parsing_runtime as env_parsing_create_runtime_helper,
)
from route_groups.api_runtime_config import (
    derive_default_passkey_rp_id as runtime_config_derive_default_passkey_rp_id_helper,
    normalize_auth_passkey_provider as runtime_config_normalize_auth_passkey_provider_helper,
    resolve_agent_webhook_secret as runtime_config_resolve_agent_webhook_secret_helper,
    resolve_api_key as runtime_config_resolve_api_key_helper,
    resolve_auth_email_require_turnstile as runtime_config_resolve_auth_email_require_turnstile_helper,
    resolve_supabase_api_key as runtime_config_resolve_supabase_api_key_helper,
    resolve_supabase_url as runtime_config_resolve_supabase_url_helper,
)
from route_groups.api_http_hardening import (
    apply_security_headers as http_hardening_apply_security_headers_helper,
    configure_cors as http_hardening_configure_cors_helper,
    default_allowed_origins as http_hardening_default_allowed_origins_helper,
    resolve_limiter_default_limits as http_hardening_resolve_limiter_default_limits_helper,
)
from route_groups.api_server_state import (
    create_server_state as server_state_create_helper,
)
from route_groups.api_bootstrap_runtime import (
    create_bootstrap_runtime as bootstrap_create_runtime_helper,
)
from route_groups.api_dependency_bundle import (
    build_agent_deps as dependency_bundle_build_agent_deps_helper,
    build_passkey_deps as dependency_bundle_build_passkey_deps_helper,
    build_transmittal_render_deps as dependency_bundle_build_transmittal_render_deps_helper,
)

# Explicit aliases expected by dependency bundle keys.
requests_module = requests
json_module = json
traceback_module = traceback

try:
    from webauthn import (
        generate_registration_options,
        verify_registration_response,
        generate_authentication_options,
        verify_authentication_response,
    )
    from webauthn.helpers import options_to_json
    from webauthn.helpers.base64url_to_bytes import base64url_to_bytes
    from webauthn.helpers.bytes_to_base64url import bytes_to_base64url
    from webauthn.helpers.structs import (
        AuthenticatorSelectionCriteria,
        ResidentKeyRequirement,
        UserVerificationRequirement,
        PublicKeyCredentialDescriptor,
        AuthenticatorTransport,
    )
    WEBAUTHN_AVAILABLE = True
    WEBAUTHN_IMPORT_ERROR = ""
except Exception as _webauthn_error:  # pragma: no cover - import-time environment variance
    generate_registration_options = None  # type: ignore[assignment]
    verify_registration_response = None  # type: ignore[assignment]
    generate_authentication_options = None  # type: ignore[assignment]
    verify_authentication_response = None  # type: ignore[assignment]
    options_to_json = None  # type: ignore[assignment]
    base64url_to_bytes = None  # type: ignore[assignment]
    bytes_to_base64url = None  # type: ignore[assignment]
    AuthenticatorSelectionCriteria = None  # type: ignore[assignment]
    ResidentKeyRequirement = None  # type: ignore[assignment]
    UserVerificationRequirement = None  # type: ignore[assignment]
    PublicKeyCredentialDescriptor = None  # type: ignore[assignment]
    AuthenticatorTransport = None  # type: ignore[assignment]
    WEBAUTHN_AVAILABLE = False
    WEBAUTHN_IMPORT_ERROR = str(_webauthn_error)

# ── Bootstrap Runtime ────────────────────────────────────────────
bootstrap_runtime = bootstrap_create_runtime_helper(
    logging_module=logging,
    os_module=os,
    path_cls=Path,
)
logger = bootstrap_runtime.configure_logging(__name__, "api_server.log")
bootstrap_runtime.apply_gencache_readonly(AUTOCAD_COM_AVAILABLE, gencache)
_env_path = bootstrap_runtime.load_default_env(__file__, logger)

app = Flask(__name__)
sock = Sock(app)

# ── Transmittal Builder render helpers ──────────────────────────
TRANSMITTAL_RENDER_AVAILABLE = False
TRANSMITTAL_BUILDER_DIR = Path(__file__).resolve().parent / "Transmittal-Builder"
TRANSMITTAL_TEMPLATE_PATH = (
    TRANSMITTAL_BUILDER_DIR / "R3P-PRJ#-XMTL-001 - DOCUMENT INDEX.docx"
)
TRANSMITTAL_CONFIG_PATH = TRANSMITTAL_BUILDER_DIR / "config.yaml"

TRANSMITTAL_FALLBACK_PROFILES: List[Dict[str, str]] = [
    {
        "id": "sample-engineer",
        "name": "Sample Engineer, PE",
        "title": "Engineering Lead",
        "email": "engineer@example.com",
        "phone": "(000) 000-0000",
    }
]
TRANSMITTAL_FALLBACK_FIRMS = ["TX - Firm #00000"]

server_state = server_state_create_helper(threading_module=threading)
TRANSMITTAL_PROFILES_CACHE = server_state.transmittal_profiles_cache
TRANSMITTAL_PROFILES_CACHE_LOCK = server_state.transmittal_profiles_cache_lock

try:
    transmittal_core_path = TRANSMITTAL_BUILDER_DIR / "core"
    if transmittal_core_path.exists():
        sys.path.append(str(transmittal_core_path))
        from transmittal_render import render_transmittal, render_cid_transmittal  # type: ignore

        TRANSMITTAL_RENDER_AVAILABLE = True
except Exception as exc:
    logger.warning("Transmittal render helpers unavailable: %s", exc)

# Transmittal profiles runtime wiring
transmittal_profiles_runtime = transmittal_profiles_create_runtime_helper(
    transmittal_config_path=TRANSMITTAL_CONFIG_PATH,
    transmittal_fallback_profiles=TRANSMITTAL_FALLBACK_PROFILES,
    transmittal_fallback_firms=TRANSMITTAL_FALLBACK_FIRMS,
    transmittal_profiles_cache=TRANSMITTAL_PROFILES_CACHE,
    transmittal_profiles_cache_lock=TRANSMITTAL_PROFILES_CACHE_LOCK,
    is_valid_email_fn=email_validation_is_valid_email_helper,
    re_module=re,
    json_module=json,
    logger=logger,
)


def _slugify_transmittal_profile_id(value: str) -> str:
    return transmittal_profiles_runtime.slugify_transmittal_profile_id(value)


def _normalize_transmittal_profile(
    row: Dict[str, Any], fallback_index: int
) -> Optional[Dict[str, str]]:
    return transmittal_profiles_runtime.normalize_transmittal_profile(
        row, fallback_index
    )


def _load_transmittal_profiles_payload() -> Dict[str, Any]:
    return transmittal_profiles_runtime.load_transmittal_profiles_payload()

env_parsing_runtime = env_parsing_create_runtime_helper(
    os_module=os,
    logger=logger,
)


def _parse_csv_env(var_name: str, fallback: List[str]) -> List[str]:
    return env_parsing_runtime.parse_csv_env(var_name, fallback)


def _parse_int_env(var_name: str, fallback: int, minimum: int = 1) -> int:
    return env_parsing_runtime.parse_int_env(var_name, fallback, minimum)


def _parse_bool_env(var_name: str, fallback: bool = False) -> bool:
    return env_parsing_runtime.parse_bool_env(var_name, fallback)


PAIRING_CODE_PATTERN = re.compile(r"^\d{6}$")
PAIRING_CHALLENGE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,200}$")
PASSKEY_CALLBACK_STATE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,200}$")
PASSKEY_CALLBACK_SIGNATURE_PATTERN = re.compile(r"^[A-Fa-f0-9]{64}$")
PASSKEY_CALLBACK_TIMESTAMP_PATTERN = re.compile(r"^\d{10,13}$")
PASSKEY_CREDENTIAL_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,1024}$")


app.config['MAX_CONTENT_LENGTH'] = _parse_int_env(
    'API_MAX_CONTENT_LENGTH',
    104857600  # 100 MB
)

# CORS configuration - restrict to specific origins for security
# In production, replace with actual frontend domain
ALLOWED_ORIGINS = http_hardening_default_allowed_origins_helper()
ALLOWED_ORIGINS = _parse_csv_env('API_ALLOWED_ORIGINS', ALLOWED_ORIGINS)
AUTH_ALLOWED_REDIRECT_ORIGINS = _parse_csv_env(
    "AUTH_ALLOWED_REDIRECT_ORIGINS",
    ALLOWED_ORIGINS,
)
AUTH_EMAIL_REDIRECT_URL = (
    (os.environ.get("AUTH_EMAIL_REDIRECT_URL") or "").strip()
    or (os.environ.get("VITE_AUTH_REDIRECT_URL") or "").strip()
)

http_hardening_configure_cors_helper(
    app=app,
    cors_fn=CORS,
    allowed_origins=ALLOWED_ORIGINS,
)

# ── Rate Limiting ────────────────────────────────────────────────
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=http_hardening_resolve_limiter_default_limits_helper(os_module=os),
    storage_uri="memory://",
    strategy="fixed-window"
)

# ── Security Headers ─────────────────────────────────────────────
@app.after_request
def add_security_headers(response):
    """Add security headers to all responses."""
    return http_hardening_apply_security_headers_helper(response)

# ── API Authentication ───────────────────────────────────────────
# SECURITY: API_KEY must be explicitly set in environment. No defaults allowed.
API_KEY = runtime_config_resolve_api_key_helper(
    os_module=os,
    logger=logger,
)
if len(API_KEY) < 16:
    logger.warning("API_KEY length is under 16 characters; use a longer key for production.")

VITE_API_KEY = (os.environ.get("VITE_API_KEY") or "").strip()
if not VITE_API_KEY:
    logger.warning(
        "VITE_API_KEY is not set. Frontend API/WebSocket auth may fail. "
        "Set VITE_API_KEY to match API_KEY and restart both servers."
    )
elif not hmac.compare_digest(VITE_API_KEY, API_KEY):
    logger.error(
        "API key mismatch detected: VITE_API_KEY does not match API_KEY. "
        "Set both keys equal in .env, then restart frontend and backend."
    )
AUTOCAD_ALLOW_API_KEY_FALLBACK = _parse_bool_env(
    "AUTOCAD_ALLOW_API_KEY_FALLBACK",
    False,
)
WS_ALLOW_API_KEY_FALLBACK = _parse_bool_env(
    "WS_ALLOW_API_KEY_FALLBACK",
    AUTOCAD_ALLOW_API_KEY_FALLBACK,
)
WS_TICKET_TTL_SECONDS = _parse_int_env(
    "WS_TICKET_TTL_SECONDS",
    45,
    minimum=5,
)
WS_TICKET_MAX_ENTRIES = _parse_int_env(
    "WS_TICKET_MAX_ENTRIES",
    20000,
    minimum=100,
)
WS_TICKET_BIND_REMOTE_ADDR = _parse_bool_env(
    "WS_TICKET_BIND_REMOTE_ADDR",
    False,
)
if AUTOCAD_ALLOW_API_KEY_FALLBACK:
    logger.warning(
        "AUTOCAD_ALLOW_API_KEY_FALLBACK is enabled. "
        "Prefer bearer token auth in production and disable this fallback."
    )
if WS_ALLOW_API_KEY_FALLBACK:
    logger.warning(
        "WS_ALLOW_API_KEY_FALLBACK is enabled. "
        "WebSocket API-key auth should be disabled in production."
    )
logger.info(
    "AutoCAD auth config loaded (api_key_fallback=%s, ws_api_key_fallback=%s, ws_ticket_ttl_seconds=%s, ws_ticket_bind_remote_addr=%s)",
    AUTOCAD_ALLOW_API_KEY_FALLBACK,
    WS_ALLOW_API_KEY_FALLBACK,
    WS_TICKET_TTL_SECONDS,
    WS_TICKET_BIND_REMOTE_ADDR,
)

BATCH_SESSION_COOKIE = "bfr_session"
BATCH_SESSION_TTL_SECONDS = _parse_int_env("BATCH_SESSION_TTL_SECONDS", 6 * 60 * 60, minimum=300)

_backup_dir_env = (os.environ.get("BACKUP_STORAGE_DIR") or "").strip()
if _backup_dir_env:
    BACKUP_STORAGE_DIR = Path(_backup_dir_env).expanduser().resolve()
else:
    BACKUP_STORAGE_DIR = (Path(__file__).resolve().parents[1] / "backups").resolve()
BACKUP_MAX_BYTES = _parse_int_env("BACKUP_MAX_BYTES", 5 * 1024 * 1024, minimum=1024)
BACKUP_MAX_FILES = _parse_int_env("BACKUP_MAX_FILES", 500, minimum=10)
AUTODRAFT_DOTNET_API_URL = (
    (os.environ.get("AUTODRAFT_DOTNET_API_URL") or "").strip()
)

# ── Agent Broker + Supabase Auth ────────────────────────────────
SUPABASE_URL = runtime_config_resolve_supabase_url_helper(
    os_module=os,
    logger=logger,
)

SUPABASE_SERVICE_ROLE_KEY = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
SUPABASE_ANON_KEY = (os.environ.get("SUPABASE_ANON_KEY") or "").strip()
SUPABASE_JWT_SECRET = (os.environ.get("SUPABASE_JWT_SECRET") or "").strip()
SUPABASE_API_KEY = runtime_config_resolve_supabase_api_key_helper(
    supabase_service_role_key=SUPABASE_SERVICE_ROLE_KEY,
    supabase_anon_key=SUPABASE_ANON_KEY,
    logger=logger,
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
AGENT_WEBHOOK_SECRET = runtime_config_resolve_agent_webhook_secret_helper(
    os_module=os,
    logger=logger,
)
AGENT_REQUIRE_WEBHOOK_SECRET = (
    (os.environ.get("AGENT_REQUIRE_WEBHOOK_SECRET") or "true").strip().lower()
    != "false"
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

AGENT_SESSIONS = server_state.agent_sessions
AGENT_PAIRING_CHALLENGES = server_state.agent_pairing_challenges
AGENT_PAIRING_CHALLENGE_LOCK = server_state.agent_pairing_challenge_lock
AGENT_PAIRING_CHALLENGE_TTL_SECONDS = _parse_int_env(
    "AGENT_PAIRING_CHALLENGE_TTL_SECONDS",
    15 * 60,
    minimum=60,
)
AGENT_PAIRING_CHALLENGE_MAX_ENTRIES = _parse_int_env(
    "AGENT_PAIRING_CHALLENGE_MAX_ENTRIES",
    10_000,
    minimum=100,
)
AGENT_PAIRING_REDIRECT_PATH = (
    (os.environ.get("AGENT_PAIRING_REDIRECT_PATH") or "/app/agent").strip()
    or "/app/agent"
)
AUTH_PASSKEY_ENABLED = _parse_bool_env("AUTH_PASSKEY_ENABLED", False)
AUTH_PASSKEY_PROVIDER = runtime_config_normalize_auth_passkey_provider_helper(
    raw_value=(os.environ.get("AUTH_PASSKEY_PROVIDER") or "supabase"),
    logger=logger,
)
AUTH_PASSKEY_EXTERNAL_NAME = (
    (os.environ.get("AUTH_PASSKEY_EXTERNAL_NAME") or "External IdP").strip()
    or "External IdP"
)
AUTH_PASSKEY_EXTERNAL_DISCOVERY_URL = (
    (os.environ.get("AUTH_PASSKEY_EXTERNAL_DISCOVERY_URL") or "").strip()
)
AUTH_PASSKEY_EXTERNAL_SIGNIN_URL = (
    (os.environ.get("AUTH_PASSKEY_EXTERNAL_SIGNIN_URL") or "").strip()
)
AUTH_PASSKEY_EXTERNAL_ENROLL_URL = (
    (os.environ.get("AUTH_PASSKEY_EXTERNAL_ENROLL_URL") or "").strip()
)
AUTH_PASSKEY_CALLBACK_STATE_TTL_SECONDS = _parse_int_env(
    "AUTH_PASSKEY_CALLBACK_STATE_TTL_SECONDS",
    15 * 60,
    minimum=60,
)
AUTH_PASSKEY_CALLBACK_STATE_MAX_ENTRIES = _parse_int_env(
    "AUTH_PASSKEY_CALLBACK_STATE_MAX_ENTRIES",
    10_000,
    minimum=100,
)
AUTH_PASSKEY_REQUIRE_SIGNED_CALLBACK = _parse_bool_env(
    "AUTH_PASSKEY_REQUIRE_SIGNED_CALLBACK",
    AUTH_PASSKEY_PROVIDER == "external",
)
AUTH_PASSKEY_CALLBACK_SIGNING_SECRET = (
    (os.environ.get("AUTH_PASSKEY_CALLBACK_SIGNING_SECRET") or "").strip()
)
AUTH_PASSKEY_CALLBACK_SIGNATURE_MAX_AGE_SECONDS = _parse_int_env(
    "AUTH_PASSKEY_CALLBACK_SIGNATURE_MAX_AGE_SECONDS",
    300,
    minimum=30,
)
AUTH_PASSKEY_CALLBACK_SIGNATURE_MAX_CLOCK_SKEW_SECONDS = _parse_int_env(
    "AUTH_PASSKEY_CALLBACK_SIGNATURE_MAX_CLOCK_SKEW_SECONDS",
    90,
    minimum=0,
)
AUTH_PASSKEY_ALLOWED_ORIGINS = _parse_csv_env(
    "AUTH_PASSKEY_ALLOWED_ORIGINS",
    AUTH_ALLOWED_REDIRECT_ORIGINS,
)
_DEFAULT_PASSKEY_RP_ID = runtime_config_derive_default_passkey_rp_id_helper(
    auth_passkey_allowed_origins=AUTH_PASSKEY_ALLOWED_ORIGINS,
    urlparse_fn=urlparse,
)
AUTH_PASSKEY_RP_ID = (
    (os.environ.get("AUTH_PASSKEY_RP_ID") or _DEFAULT_PASSKEY_RP_ID or "localhost")
    .strip()
    .lower()
)
AUTH_PASSKEY_RP_NAME = (
    (os.environ.get("AUTH_PASSKEY_RP_NAME") or "Suite").strip()
    or "Suite"
)
AUTH_PASSKEY_WEBAUTHN_STATE_TTL_SECONDS = _parse_int_env(
    "AUTH_PASSKEY_WEBAUTHN_STATE_TTL_SECONDS",
    5 * 60,
    minimum=30,
)
AUTH_PASSKEY_WEBAUTHN_STATE_MAX_ENTRIES = _parse_int_env(
    "AUTH_PASSKEY_WEBAUTHN_STATE_MAX_ENTRIES",
    10_000,
    minimum=100,
)
AUTH_PASSKEY_WEBAUTHN_TIMEOUT_MS = _parse_int_env(
    "AUTH_PASSKEY_WEBAUTHN_TIMEOUT_MS",
    60_000,
    minimum=1000,
)
AUTH_PASSKEY_REQUIRE_USER_VERIFICATION = _parse_bool_env(
    "AUTH_PASSKEY_REQUIRE_USER_VERIFICATION",
    True,
)
AUTH_PASSKEY_REQUIRE_RESIDENT_KEY = _parse_bool_env(
    "AUTH_PASSKEY_REQUIRE_RESIDENT_KEY",
    True,
)
AGENT_PAIRING_ACTION_WINDOW_SECONDS = _parse_int_env(
    "AGENT_PAIRING_ACTION_WINDOW_SECONDS",
    900,
    minimum=60,
)
AGENT_PAIRING_ACTION_MAX_ATTEMPTS = _parse_int_env(
    "AGENT_PAIRING_ACTION_MAX_ATTEMPTS",
    8,
    minimum=1,
)
AGENT_PAIRING_ACTION_MIN_INTERVAL_SECONDS = _parse_int_env(
    "AGENT_PAIRING_ACTION_MIN_INTERVAL_SECONDS",
    20,
    minimum=0,
)
AGENT_PAIRING_ACTION_BLOCK_SECONDS = _parse_int_env(
    "AGENT_PAIRING_ACTION_BLOCK_SECONDS",
    1800,
    minimum=60,
)
AGENT_PAIRING_CONFIRM_FAILURE_WINDOW_SECONDS = _parse_int_env(
    "AGENT_PAIRING_CONFIRM_FAILURE_WINDOW_SECONDS",
    900,
    minimum=60,
)
AGENT_PAIRING_CONFIRM_FAILURE_MAX_ATTEMPTS = _parse_int_env(
    "AGENT_PAIRING_CONFIRM_FAILURE_MAX_ATTEMPTS",
    6,
    minimum=1,
)
AGENT_PAIRING_CONFIRM_FAILURE_BLOCK_SECONDS = _parse_int_env(
    "AGENT_PAIRING_CONFIRM_FAILURE_BLOCK_SECONDS",
    1800,
    minimum=60,
)

# ── Auth Email Abuse Controls ────────────────────────────────────
AUTH_EMAIL_WINDOW_SECONDS = _parse_int_env("AUTH_EMAIL_WINDOW_SECONDS", 900, minimum=60)
AUTH_EMAIL_MAX_ATTEMPTS = _parse_int_env("AUTH_EMAIL_MAX_ATTEMPTS", 6, minimum=1)
AUTH_EMAIL_MIN_INTERVAL_SECONDS = _parse_int_env("AUTH_EMAIL_MIN_INTERVAL_SECONDS", 15, minimum=0)
AUTH_EMAIL_BLOCK_SECONDS = _parse_int_env("AUTH_EMAIL_BLOCK_SECONDS", 1800, minimum=60)
AUTH_EMAIL_IP_WINDOW_SECONDS = _parse_int_env(
    "AUTH_EMAIL_IP_WINDOW_SECONDS",
    900,
    minimum=60,
)
AUTH_EMAIL_IP_MAX_ATTEMPTS = _parse_int_env(
    "AUTH_EMAIL_IP_MAX_ATTEMPTS",
    30,
    minimum=1,
)
AUTH_EMAIL_IP_BLOCK_SECONDS = _parse_int_env(
    "AUTH_EMAIL_IP_BLOCK_SECONDS",
    1800,
    minimum=60,
)
AUTH_EMAIL_MIN_RESPONSE_MS = _parse_int_env("AUTH_EMAIL_MIN_RESPONSE_MS", 450, minimum=0)
AUTH_EMAIL_RESPONSE_JITTER_MS = _parse_int_env(
    "AUTH_EMAIL_RESPONSE_JITTER_MS",
    120,
    minimum=0,
)
AUTH_EMAIL_HONEYPOT_FIELD = (os.environ.get("AUTH_EMAIL_HONEYPOT_FIELD") or "company").strip() or "company"
AUTH_EMAIL_TURNSTILE_SECRET = (os.environ.get("AUTH_EMAIL_TURNSTILE_SECRET") or "").strip()
AUTH_EMAIL_TURNSTILE_VERIFY_URL = (
    (os.environ.get("AUTH_EMAIL_TURNSTILE_VERIFY_URL") or "").strip()
    or "https://challenges.cloudflare.com/turnstile/v0/siteverify"
)
AUTH_EMAIL_TURNSTILE_TIMEOUT_SECONDS = _parse_int_env(
    "AUTH_EMAIL_TURNSTILE_TIMEOUT_SECONDS",
    5,
    minimum=1,
)
AUTH_EMAIL_REQUIRE_TURNSTILE = runtime_config_resolve_auth_email_require_turnstile_helper(
    os_module=os,
    auth_email_turnstile_secret=AUTH_EMAIL_TURNSTILE_SECRET,
)

AUTH_EMAIL_WINDOW = server_state.auth_email_window
AUTH_EMAIL_LAST_ATTEMPT = server_state.auth_email_last_attempt
AUTH_EMAIL_BLOCKED_UNTIL = server_state.auth_email_blocked_until
AUTH_EMAIL_IP_WINDOW = server_state.auth_email_ip_window
AUTH_EMAIL_IP_BLOCKED_UNTIL = server_state.auth_email_ip_blocked_until
AUTH_EMAIL_ABUSE_LOCK = server_state.auth_email_abuse_lock
PASSKEY_CALLBACK_STATES = server_state.passkey_callback_states
PASSKEY_CALLBACK_STATES_LOCK = server_state.passkey_callback_states_lock
PASSKEY_WEBAUTHN_STATES = server_state.passkey_webauthn_states
PASSKEY_WEBAUTHN_STATES_LOCK = server_state.passkey_webauthn_states_lock
AGENT_PAIRING_ACTION_WINDOW = server_state.agent_pairing_action_window
AGENT_PAIRING_ACTION_LAST_ATTEMPT = server_state.agent_pairing_action_last_attempt
AGENT_PAIRING_ACTION_BLOCKED_UNTIL = server_state.agent_pairing_action_blocked_until
AGENT_PAIRING_ACTION_ABUSE_LOCK = server_state.agent_pairing_action_abuse_lock
AGENT_PAIRING_CONFIRM_FAILURE_WINDOW = server_state.agent_pairing_confirm_failure_window
AGENT_PAIRING_CONFIRM_BLOCKED_UNTIL = server_state.agent_pairing_confirm_blocked_until
AGENT_PAIRING_CONFIRM_ABUSE_LOCK = server_state.agent_pairing_confirm_abuse_lock
WEBSOCKET_TICKETS = server_state.websocket_tickets
WEBSOCKET_TICKETS_LOCK = server_state.websocket_tickets_lock


# Agent runtime wiring
agent_runtime = agent_create_runtime_helper(
    now_fn=time.time,
    token_urlsafe_fn=secrets.token_urlsafe,
    agent_sessions_store=AGENT_SESSIONS,
    agent_pairing_challenges_store=AGENT_PAIRING_CHALLENGES,
    agent_pairing_challenge_lock=AGENT_PAIRING_CHALLENGE_LOCK,
    agent_pairing_challenge_ttl_seconds=AGENT_PAIRING_CHALLENGE_TTL_SECONDS,
    agent_pairing_challenge_max_entries=AGENT_PAIRING_CHALLENGE_MAX_ENTRIES,
    agent_pairing_action_abuse_lock=AGENT_PAIRING_ACTION_ABUSE_LOCK,
    agent_pairing_action_window=AGENT_PAIRING_ACTION_WINDOW,
    agent_pairing_action_last_attempt=AGENT_PAIRING_ACTION_LAST_ATTEMPT,
    agent_pairing_action_blocked_until=AGENT_PAIRING_ACTION_BLOCKED_UNTIL,
    agent_pairing_action_window_seconds=AGENT_PAIRING_ACTION_WINDOW_SECONDS,
    agent_pairing_action_max_attempts=AGENT_PAIRING_ACTION_MAX_ATTEMPTS,
    agent_pairing_action_min_interval_seconds=AGENT_PAIRING_ACTION_MIN_INTERVAL_SECONDS,
    agent_pairing_action_block_seconds=AGENT_PAIRING_ACTION_BLOCK_SECONDS,
    agent_pairing_confirm_abuse_lock=AGENT_PAIRING_CONFIRM_ABUSE_LOCK,
    agent_pairing_confirm_failure_window=AGENT_PAIRING_CONFIRM_FAILURE_WINDOW,
    agent_pairing_confirm_blocked_until=AGENT_PAIRING_CONFIRM_BLOCKED_UNTIL,
    agent_pairing_confirm_failure_window_seconds=AGENT_PAIRING_CONFIRM_FAILURE_WINDOW_SECONDS,
    agent_pairing_confirm_failure_max_attempts=AGENT_PAIRING_CONFIRM_FAILURE_MAX_ATTEMPTS,
    agent_pairing_confirm_failure_block_seconds=AGENT_PAIRING_CONFIRM_FAILURE_BLOCK_SECONDS,
    agent_gateway_url=AGENT_GATEWAY_URL,
    agent_webhook_secret=AGENT_WEBHOOK_SECRET,
    pairing_code_pattern=PAIRING_CODE_PATTERN,
    jsonify_fn=jsonify,
    agent_session_cookie=AGENT_SESSION_COOKIE,
    agent_session_samesite=AGENT_SESSION_SAMESITE,
    agent_session_secure=AGENT_SESSION_SECURE,
    agent_session_ttl_seconds=AGENT_SESSION_TTL_SECONDS,
    requests_module=requests,
    logger=logger,
)


def _purge_expired_agent_sessions() -> None:
    return agent_runtime.purge_expired_agent_sessions()


def _purge_expired_agent_pairing_challenges(now: Optional[float] = None) -> None:
    return agent_runtime.purge_expired_agent_pairing_challenges(now)


def _create_agent_pairing_challenge(
    action: str,
    user_id: str,
    email: str,
    pairing_code: str,
    client_ip: str,
) -> Tuple[str, int]:
    return agent_runtime.create_agent_pairing_challenge(
        action,
        user_id,
        email,
        pairing_code,
        client_ip,
    )


def _consume_agent_pairing_challenge(
    challenge_id: str,
    user_id: str,
    email: str,
) -> Tuple[Optional[Dict[str, Any]], str]:
    return agent_runtime.consume_agent_pairing_challenge(
        challenge_id,
        user_id,
        email,
    )


# Passkey runtime wiring
passkey_runtime = passkey_create_runtime_helper(
    request_obj=request,
    logger=logger,
    options_to_json_fn=options_to_json,
    json_module=json,
    auth_email_redirect_url=AUTH_EMAIL_REDIRECT_URL,
    auth_allowed_redirect_origins=AUTH_ALLOWED_REDIRECT_ORIGINS,
    auth_passkey_allowed_origins=AUTH_PASSKEY_ALLOWED_ORIGINS,
    passkey_callback_states=PASSKEY_CALLBACK_STATES,
    passkey_callback_states_lock=PASSKEY_CALLBACK_STATES_LOCK,
    passkey_webauthn_states=PASSKEY_WEBAUTHN_STATES,
    passkey_webauthn_states_lock=PASSKEY_WEBAUTHN_STATES_LOCK,
    auth_passkey_callback_state_ttl_seconds=AUTH_PASSKEY_CALLBACK_STATE_TTL_SECONDS,
    auth_passkey_callback_state_max_entries=AUTH_PASSKEY_CALLBACK_STATE_MAX_ENTRIES,
    auth_passkey_webauthn_state_ttl_seconds=AUTH_PASSKEY_WEBAUTHN_STATE_TTL_SECONDS,
    auth_passkey_webauthn_state_max_entries=AUTH_PASSKEY_WEBAUTHN_STATE_MAX_ENTRIES,
    passkey_credential_id_pattern=PASSKEY_CREDENTIAL_ID_PATTERN,
    passkey_callback_state_pattern=PASSKEY_CALLBACK_STATE_PATTERN,
    passkey_callback_signature_pattern=PASSKEY_CALLBACK_SIGNATURE_PATTERN,
    passkey_callback_timestamp_pattern=PASSKEY_CALLBACK_TIMESTAMP_PATTERN,
    auth_passkey_require_signed_callback=AUTH_PASSKEY_REQUIRE_SIGNED_CALLBACK,
    auth_passkey_callback_signing_secret=AUTH_PASSKEY_CALLBACK_SIGNING_SECRET,
    auth_passkey_callback_signature_max_age_seconds=AUTH_PASSKEY_CALLBACK_SIGNATURE_MAX_AGE_SECONDS,
    auth_passkey_callback_signature_max_clock_skew_seconds=AUTH_PASSKEY_CALLBACK_SIGNATURE_MAX_CLOCK_SKEW_SECONDS,
    auth_passkey_enabled=AUTH_PASSKEY_ENABLED,
    auth_passkey_provider=AUTH_PASSKEY_PROVIDER,
    auth_passkey_external_name=AUTH_PASSKEY_EXTERNAL_NAME,
    auth_passkey_external_discovery_url=AUTH_PASSKEY_EXTERNAL_DISCOVERY_URL,
    auth_passkey_external_signin_url=AUTH_PASSKEY_EXTERNAL_SIGNIN_URL,
    auth_passkey_external_enroll_url=AUTH_PASSKEY_EXTERNAL_ENROLL_URL,
    webauthn_available=WEBAUTHN_AVAILABLE,
    supabase_url=SUPABASE_URL,
    supabase_service_role_key=SUPABASE_SERVICE_ROLE_KEY,
    auth_passkey_rp_id=AUTH_PASSKEY_RP_ID,
    auth_passkey_rp_name=AUTH_PASSKEY_RP_NAME,
    webauthn_import_error=WEBAUTHN_IMPORT_ERROR,
)


def _purge_expired_passkey_callback_states(now: Optional[float] = None) -> None:
    return passkey_runtime.purge_expired_passkey_callback_states(now)


def _create_passkey_callback_state(
    intent: str,
    client_ip: str,
    client_redirect_to: str = "",
    user_id: str = "",
    email: str = "",
) -> Tuple[str, int]:
    return passkey_runtime.create_passkey_callback_state(
        intent,
        client_ip,
        client_redirect_to,
        user_id,
        email,
    )


def _consume_passkey_callback_state(state: str) -> Tuple[Optional[Dict[str, Any]], str]:
    return passkey_runtime.consume_passkey_callback_state(state)


def _get_passkey_callback_state(state: str) -> Tuple[Optional[Dict[str, Any]], str]:
    return passkey_runtime.get_passkey_callback_state(state)


def _purge_expired_passkey_webauthn_states(now: Optional[float] = None) -> None:
    return passkey_runtime.purge_expired_passkey_webauthn_states(now)


def _create_passkey_webauthn_state(
    intent: str,
    challenge: str,
    expected_origin: str,
    client_ip: str,
    client_redirect_to: str = "",
    user_id: str = "",
    email: str = "",
) -> Tuple[str, int]:
    return passkey_runtime.create_passkey_webauthn_state(
        intent,
        challenge,
        expected_origin,
        client_ip,
        client_redirect_to,
        user_id,
        email,
    )


def _consume_passkey_webauthn_state(
    state: str,
    expected_intent: str = "",
) -> Tuple[Optional[Dict[str, Any]], str]:
    return passkey_runtime.consume_passkey_webauthn_state(state, expected_intent)


def _normalize_passkey_transports(value: Any) -> List[str]:
    return passkey_runtime.normalize_passkey_transports(value)


def _normalize_passkey_friendly_name(value: Any) -> str:
    return passkey_runtime.normalize_passkey_friendly_name(value)


def _extract_passkey_credential_id(credential_payload: Any) -> str:
    return passkey_runtime.extract_passkey_credential_id(credential_payload)


def _coerce_webauthn_enum_value(value: Any) -> str:
    return passkey_runtime.coerce_webauthn_enum_value(value)


def _normalize_passkey_callback_timestamp(raw_value: str) -> Optional[int]:
    return passkey_runtime.normalize_passkey_callback_timestamp(raw_value)


def _build_passkey_callback_signature_payload(
    state: str,
    intent: str,
    status: str,
    email: str,
    error_message: str,
    timestamp: int,
) -> str:
    return passkey_runtime.build_passkey_callback_signature_payload(
        state,
        intent,
        status,
        email,
        error_message,
        timestamp,
    )


def _verify_passkey_callback_signature(
    state: str,
    intent: str,
    status: str,
    email: str,
    error_message: str,
    signature: str,
    timestamp_raw: str,
) -> Tuple[bool, str]:
    return passkey_runtime.verify_passkey_callback_signature(
        state,
        intent,
        status,
        email,
        error_message,
        signature,
        timestamp_raw,
    )


def _agent_pairing_action_key(user_id: str, action: str) -> str:
    return agent_runtime.agent_pairing_action_key(user_id, action)


def _compact_agent_pairing_action_state(now: float) -> None:
    return agent_runtime.compact_agent_pairing_action_state(now)


def _is_agent_pairing_action_allowed(user_id: str, action: str) -> Tuple[bool, str, int]:
    return agent_runtime.is_agent_pairing_action_allowed(user_id, action)


def _agent_pairing_confirm_key(user_id: str, client_ip: str) -> str:
    return agent_runtime.agent_pairing_confirm_key(user_id, client_ip)


def _compact_agent_pairing_confirm_state(now: float) -> None:
    return agent_runtime.compact_agent_pairing_confirm_state(now)


def _is_agent_pairing_confirm_blocked(user_id: str, client_ip: str) -> Tuple[bool, int]:
    return agent_runtime.is_agent_pairing_confirm_blocked(user_id, client_ip)


def _register_agent_pairing_confirm_failure(user_id: str, client_ip: str) -> Tuple[bool, int]:
    return agent_runtime.register_agent_pairing_confirm_failure(user_id, client_ip)


def _clear_agent_pairing_confirm_failures(user_id: str, client_ip: str) -> None:
    return agent_runtime.clear_agent_pairing_confirm_failures(user_id, client_ip)


def _looks_like_uuid(value: str) -> bool:
    return supabase_jwks_looks_like_uuid_helper(value)


def _get_supabase_jwks_client() -> Optional[PyJWKClient]:
    global _SUPABASE_JWKS_CLIENT
    _SUPABASE_JWKS_CLIENT = supabase_jwks_get_client_helper(
        supabase_jwks_url=SUPABASE_JWKS_URL,
        cached_client=_SUPABASE_JWKS_CLIENT,
        py_jwk_client_cls=PyJWKClient,
    )
    return _SUPABASE_JWKS_CLIENT


def _agent_broker_config_status() -> Dict[str, Any]:
    return agent_config_status_helper(
        supabase_url=SUPABASE_URL,
        agent_gateway_url=AGENT_GATEWAY_URL,
        agent_require_webhook_secret=AGENT_REQUIRE_WEBHOOK_SECRET,
        agent_webhook_secret=AGENT_WEBHOOK_SECRET,
        supabase_jwt_secret=SUPABASE_JWT_SECRET,
        supabase_api_key=SUPABASE_API_KEY,
        supabase_anon_key=SUPABASE_ANON_KEY,
        looks_like_uuid_fn=_looks_like_uuid,
    )


def _auth_passkey_capability() -> Dict[str, Any]:
    return passkey_runtime.auth_passkey_capability()


def _get_supabase_user_id(user: Dict[str, Any]) -> Optional[str]:
    return auth_runtime.get_supabase_user_id(user)


def _get_supabase_user_email(user: Dict[str, Any]) -> Optional[str]:
    return auth_runtime.get_supabase_user_email(user)


def _get_bearer_token() -> Optional[str]:
    return auth_runtime.get_bearer_token()


def _get_request_ip() -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        first_hop = forwarded_for.split(",", 1)[0].strip()
        if first_hop:
            return first_hop
    return (request.remote_addr or "").strip() or "unknown"


def _prune_expired_ws_tickets_locked(now_ts: float) -> int:
    expired_tokens: List[str] = []
    for token, payload in WEBSOCKET_TICKETS.items():
        expires_at = float(payload.get("expires_at") or 0.0)
        if expires_at <= now_ts:
            expired_tokens.append(token)
    for token in expired_tokens:
        WEBSOCKET_TICKETS.pop(token, None)
    return len(expired_tokens)


def _issue_ws_ticket(
    *,
    user_id: str,
    auth_mode: str,
    remote_addr: str,
) -> Dict[str, Any]:
    now_ts = time.time()
    expires_at = now_ts + WS_TICKET_TTL_SECONDS
    ticket_token = secrets.token_urlsafe(40)
    auth_mode_value = str(auth_mode or "unknown").strip() or "unknown"
    user_id_value = str(user_id or "").strip()
    remote_addr_value = str(remote_addr or "unknown").strip() or "unknown"

    with WEBSOCKET_TICKETS_LOCK:
        _prune_expired_ws_tickets_locked(now_ts)

        if len(WEBSOCKET_TICKETS) >= WS_TICKET_MAX_ENTRIES:
            overflow = len(WEBSOCKET_TICKETS) - WS_TICKET_MAX_ENTRIES + 1
            oldest_tokens = sorted(
                WEBSOCKET_TICKETS.keys(),
                key=lambda token: float(WEBSOCKET_TICKETS[token].get("issued_at") or 0.0),
            )[:overflow]
            for token in oldest_tokens:
                WEBSOCKET_TICKETS.pop(token, None)
            if oldest_tokens:
                logger.warning(
                    "Pruned %s websocket tickets due to capacity pressure (max=%s)",
                    len(oldest_tokens),
                    WS_TICKET_MAX_ENTRIES,
                )

        WEBSOCKET_TICKETS[ticket_token] = {
            "user_id": user_id_value,
            "auth_mode": auth_mode_value,
            "remote_addr": remote_addr_value,
            "issued_at": now_ts,
            "expires_at": expires_at,
        }

    logger.info(
        "Issued websocket ticket (user_id=%s, auth_mode=%s, remote=%s, ttl_seconds=%s)",
        user_id_value or "unknown",
        auth_mode_value,
        remote_addr_value,
        WS_TICKET_TTL_SECONDS,
    )
    return {
        "ticket": ticket_token,
        "expires_at": expires_at,
        "ttl_seconds": WS_TICKET_TTL_SECONDS,
    }


def _consume_ws_ticket(ticket_token: str, remote_addr: str) -> Tuple[bool, str]:
    token_value = str(ticket_token or "").strip()
    remote_addr_value = str(remote_addr or "unknown").strip() or "unknown"
    if not token_value:
        return False, "missing"

    now_ts = time.time()
    with WEBSOCKET_TICKETS_LOCK:
        _prune_expired_ws_tickets_locked(now_ts)
        ticket_payload = WEBSOCKET_TICKETS.pop(token_value, None)

    if not ticket_payload:
        logger.warning("Rejected websocket ticket (remote=%s, reason=missing_or_used)", remote_addr_value)
        return False, "missing_or_used"

    expires_at = float(ticket_payload.get("expires_at") or 0.0)
    if expires_at <= now_ts:
        logger.warning("Rejected websocket ticket (remote=%s, reason=expired)", remote_addr_value)
        return False, "expired"

    issued_remote_addr = str(ticket_payload.get("remote_addr") or "").strip()
    if (
        WS_TICKET_BIND_REMOTE_ADDR
        and issued_remote_addr
        and issued_remote_addr != remote_addr_value
    ):
        logger.warning(
            "Rejected websocket ticket (remote=%s, reason=ip_mismatch, issued_remote=%s)",
            remote_addr_value,
            issued_remote_addr,
        )
        return False, "ip_mismatch"

    logger.info(
        "Accepted websocket ticket (remote=%s, user_id=%s, auth_mode=%s)",
        remote_addr_value,
        str(ticket_payload.get("user_id") or "unknown"),
        str(ticket_payload.get("auth_mode") or "unknown"),
    )
    return True, "ok"


# Auth-email runtime wiring
email_runtime = email_create_runtime_helper(
    now_fn=time.time,
    perf_counter_fn=time.perf_counter,
    sleep_fn=time.sleep,
    randbelow_fn=secrets.randbelow,
    requests_module=requests,
    logger=logger,
    is_valid_email_fn=email_validation_is_valid_email_helper,
    auth_email_window_seconds=AUTH_EMAIL_WINDOW_SECONDS,
    auth_email_max_attempts=AUTH_EMAIL_MAX_ATTEMPTS,
    auth_email_min_interval_seconds=AUTH_EMAIL_MIN_INTERVAL_SECONDS,
    auth_email_block_seconds=AUTH_EMAIL_BLOCK_SECONDS,
    auth_email_ip_window_seconds=AUTH_EMAIL_IP_WINDOW_SECONDS,
    auth_email_ip_max_attempts=AUTH_EMAIL_IP_MAX_ATTEMPTS,
    auth_email_ip_block_seconds=AUTH_EMAIL_IP_BLOCK_SECONDS,
    auth_email_min_response_ms=AUTH_EMAIL_MIN_RESPONSE_MS,
    auth_email_response_jitter_ms=AUTH_EMAIL_RESPONSE_JITTER_MS,
    auth_email_turnstile_secret=AUTH_EMAIL_TURNSTILE_SECRET,
    auth_email_turnstile_verify_url=AUTH_EMAIL_TURNSTILE_VERIFY_URL,
    auth_email_turnstile_timeout_seconds=AUTH_EMAIL_TURNSTILE_TIMEOUT_SECONDS,
    auth_email_abuse_lock=AUTH_EMAIL_ABUSE_LOCK,
    auth_email_window=AUTH_EMAIL_WINDOW,
    auth_email_last_attempt=AUTH_EMAIL_LAST_ATTEMPT,
    auth_email_blocked_until=AUTH_EMAIL_BLOCKED_UNTIL,
    auth_email_ip_window=AUTH_EMAIL_IP_WINDOW,
    auth_email_ip_blocked_until=AUTH_EMAIL_IP_BLOCKED_UNTIL,
)


def _email_fingerprint(email: str, length: int = 12) -> str:
    return email_runtime.email_fingerprint(email, length)


def _auth_email_key(email: str, client_ip: str) -> str:
    return email_runtime.auth_email_key(email, client_ip)


def _auth_email_ip_key(client_ip: str) -> str:
    return email_runtime.auth_email_ip_key(client_ip)


def _compact_auth_email_state(now: float) -> None:
    return email_runtime.compact_auth_email_state(now)


def _is_auth_email_request_allowed(email: str, client_ip: str) -> Tuple[bool, str]:
    return email_runtime.is_auth_email_request_allowed(email, client_ip)


def _auth_email_generic_response() -> Dict[str, Any]:
    return email_runtime.auth_email_generic_response()


def _apply_auth_email_response_floor(start_time: float) -> None:
    return email_runtime.apply_auth_email_response_floor(start_time)


def _verify_turnstile_token(token: str, client_ip: str) -> bool:
    return email_runtime.verify_turnstile_token(token, client_ip)


def _is_valid_email(value: str) -> bool:
    return email_runtime.is_valid_email(value)


def _normalize_origin(candidate: str) -> Optional[str]:
    return passkey_runtime.normalize_origin(candidate)


def _normalize_absolute_http_url(candidate: str) -> Optional[str]:
    return passkey_runtime.normalize_absolute_http_url(candidate)


def _normalized_auth_passkey_allowed_origins() -> List[str]:
    return passkey_runtime.normalized_auth_passkey_allowed_origins()


def _is_valid_webauthn_rp_id_for_origin(rp_id: str, origin: str) -> bool:
    return passkey_runtime.is_valid_webauthn_rp_id_for_origin(rp_id, origin)


def _resolve_passkey_webauthn_expected_origin() -> Tuple[Optional[str], str]:
    return passkey_runtime.resolve_passkey_webauthn_expected_origin()


def _options_to_json_dict(options: Any) -> Dict[str, Any]:
    return passkey_runtime.options_to_json_dict(options)


def _build_auth_redirect_url(
    path: str,
    client_redirect_to: str = "",
    query_params: Optional[Dict[str, str]] = None,
) -> Optional[str]:
    return passkey_runtime.build_auth_redirect_url(
        path,
        client_redirect_to,
        query_params,
    )


def _build_external_passkey_redirect(
    intent: str,
    state_token: str,
    client_redirect_to: str = "",
) -> Optional[str]:
    return passkey_runtime.build_external_passkey_redirect(
        intent,
        state_token,
        client_redirect_to,
    )


def _supabase_rest_base_url() -> str:
    return supabase_service_request_base_url_helper(supabase_url=SUPABASE_URL)


def _supabase_service_rest_headers(
    extra_headers: Optional[Dict[str, str]] = None,
) -> Optional[Dict[str, str]]:
    return supabase_service_request_headers_helper(
        supabase_url=SUPABASE_URL,
        supabase_service_role_key=SUPABASE_SERVICE_ROLE_KEY,
        extra_headers=extra_headers,
    )


def _extract_supabase_error_message(response: requests.Response) -> str:
    return supabase_service_request_extract_error_helper(response)


def _supabase_service_rest_request(
    method: str,
    table_path: str,
    params: Optional[Dict[str, str]] = None,
    payload: Optional[Any] = None,
    extra_headers: Optional[Dict[str, str]] = None,
    timeout: int = 8,
) -> Tuple[Optional[Any], Optional[str], int]:
    return supabase_service_request_helper(
        method,
        table_path,
        supabase_url=SUPABASE_URL,
        supabase_service_role_key=SUPABASE_SERVICE_ROLE_KEY,
        params=params,
        payload=payload,
        extra_headers=extra_headers,
        timeout=timeout,
        requests_module=requests,
        extract_supabase_error_message_fn=_extract_supabase_error_message,
    )


def _fetch_active_passkeys_for_user_id(user_id: str) -> List[Dict[str, Any]]:
    return passkey_store_fetch_active_passkeys_for_user_id(
        user_id,
        supabase_service_rest_request=_supabase_service_rest_request,
        logger=logger,
    )


def _fetch_active_passkey_by_credential_id(credential_id: str) -> Optional[Dict[str, Any]]:
    return passkey_store_fetch_active_passkey_by_credential_id(
        credential_id,
        supabase_service_rest_request=_supabase_service_rest_request,
        logger=logger,
    )


def _insert_user_passkey_row(passkey_row: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    return passkey_store_insert_user_passkey_row(
        passkey_row,
        supabase_service_rest_request=_supabase_service_rest_request,
    )


def _update_user_passkey_row(passkey_id: str, patch: Dict[str, Any]) -> Tuple[bool, Optional[str], int]:
    return passkey_store_update_user_passkey_row(
        passkey_id,
        patch,
        supabase_service_rest_request=_supabase_service_rest_request,
    )


def _send_supabase_email_link(
    email: str,
    flow: str,
    client_redirect_to: str = "",
    redirect_path: str = "/login",
    redirect_query: Optional[Dict[str, str]] = None,
) -> None:
    return supabase_send_email_link_helper(
        email,
        flow,
        client_redirect_to=client_redirect_to,
        redirect_path=redirect_path,
        redirect_query=redirect_query,
        supabase_url=SUPABASE_URL,
        supabase_api_key=SUPABASE_API_KEY,
        build_auth_redirect_url_fn=_build_auth_redirect_url,
        requests_module=requests,
    )


def _generate_supabase_magic_link_url(
    email: str,
    client_redirect_to: str = "",
    redirect_path: str = "/login",
) -> str:
    return supabase_generate_magic_link_url_helper(
        email,
        client_redirect_to=client_redirect_to,
        redirect_path=redirect_path,
        supabase_url=SUPABASE_URL,
        supabase_service_role_key=SUPABASE_SERVICE_ROLE_KEY,
        build_auth_redirect_url_fn=_build_auth_redirect_url,
        requests_module=requests,
    )


# Auth/session runtime wiring
auth_runtime = auth_create_runtime_helper(
    request_obj=request,
    jsonify_fn=jsonify,
    g_obj=g,
    is_valid_email_fn=email_validation_is_valid_email_helper,
    purge_expired_agent_sessions_fn=_purge_expired_agent_sessions,
    token_urlsafe_fn=secrets.token_urlsafe,
    now_fn=time.time,
    agent_session_ttl_seconds=AGENT_SESSION_TTL_SECONDS,
    agent_sessions_store=AGENT_SESSIONS,
    agent_session_cookie=AGENT_SESSION_COOKIE,
    supabase_jwt_secret=SUPABASE_JWT_SECRET,
    supabase_url=SUPABASE_URL,
    supabase_api_key=SUPABASE_API_KEY,
    looks_like_uuid_fn=_looks_like_uuid,
    get_supabase_jwks_client_fn=_get_supabase_jwks_client,
    jwt_module=jwt,
    logger=logger,
    requests_module=requests,
)

# Security runtime wiring
security_runtime = security_create_runtime_helper(
    request_obj=request,
    jsonify_fn=jsonify,
    logger=logger,
    hmac_module=hmac,
    wraps_fn=wraps,
    api_key=API_KEY,
    re_module=re,
)

# Transmittal runtime wiring
transmittal_runtime = transmittal_create_runtime_helper(
    request_obj=request,
    json_module=json,
    secure_filename_fn=secure_filename,
    os_module=os,
    shutil_module=shutil,
    subprocess_module=subprocess,
    path_cls=Path,
    after_this_request_fn=after_this_request,
    logger=logger,
)


def _verify_supabase_user_token(token: str) -> Optional[Dict[str, Any]]:
    return auth_runtime.verify_supabase_user_token(token)


def require_supabase_user(f):
    """Decorator to require a valid Supabase access token."""
    return auth_runtime.require_supabase_user(f)


def _is_admin_user(user: Dict[str, Any]) -> bool:
    return agent_runtime.is_admin_user(user)


def _is_agent_task_allowed(task_name: str, user: Dict[str, Any]) -> bool:
    return agent_runtime.is_agent_task_allowed(task_name, user)


def _create_agent_session(token: str, user_id: str) -> Tuple[str, int]:
    return auth_runtime.create_agent_session(token, user_id)


def _get_agent_session() -> Optional[Dict[str, Any]]:
    return auth_runtime.get_agent_session()


def _clear_agent_session_for_request() -> None:
    auth_runtime.clear_agent_session_for_request()


def require_agent_session(f):
    """Decorator to require a valid agent session cookie."""
    return auth_runtime.require_agent_session(f)


def is_valid_api_key(provided_key: Optional[str]) -> bool:
    return security_runtime.is_valid_api_key(provided_key)

def require_api_key(f):
    return security_runtime.require_api_key(f)


def require_autocad_auth(f):
    """Decorator for AutoCAD routes: bearer-token auth first, optional API-key fallback."""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        remote_addr = _get_request_ip()
        path = str(request.path or "")
        method = str(request.method or "GET")
        auth_header = str(request.headers.get("Authorization") or "").strip()

        if auth_header and not auth_header.lower().startswith("bearer "):
            logger.warning(
                "AutoCAD auth rejected (invalid authorization scheme) %s %s from %s",
                method,
                path,
                remote_addr,
            )
            return jsonify({"error": "Invalid Authorization header", "code": "AUTH_INVALID"}), 401

        bearer_token = _get_bearer_token()
        if bearer_token:
            user = _verify_supabase_user_token(bearer_token)
            if user is not None:
                g.supabase_user = user
                g.autocad_auth_mode = "bearer"
                user_id = str(_get_supabase_user_id(user) or "unknown")
                logger.info(
                    "AutoCAD auth success via bearer %s %s from %s (user_id=%s)",
                    method,
                    path,
                    remote_addr,
                    user_id,
                )
                return f(*args, **kwargs)

            logger.warning(
                "AutoCAD bearer token rejected %s %s from %s",
                method,
                path,
                remote_addr,
            )
            if not AUTOCAD_ALLOW_API_KEY_FALLBACK:
                return jsonify({"error": "Invalid bearer token", "code": "AUTH_INVALID"}), 401

        provided_key = str(request.headers.get("X-API-Key") or "").strip()
        if AUTOCAD_ALLOW_API_KEY_FALLBACK and provided_key:
            if is_valid_api_key(provided_key):
                g.autocad_auth_mode = "api_key"
                logger.info(
                    "AutoCAD auth success via API key fallback %s %s from %s",
                    method,
                    path,
                    remote_addr,
                )
                return f(*args, **kwargs)
            logger.warning(
                "AutoCAD API-key fallback rejected %s %s from %s",
                method,
                path,
                remote_addr,
            )
            return jsonify({"error": "Invalid API key", "code": "AUTH_INVALID"}), 401

        auth_required_message = (
            "Authorization bearer token required"
            if not AUTOCAD_ALLOW_API_KEY_FALLBACK
            else "Authorization bearer token or API key required"
        )
        logger.warning(
            "AutoCAD auth missing credentials %s %s from %s (api_key_fallback=%s)",
            method,
            path,
            remote_addr,
            AUTOCAD_ALLOW_API_KEY_FALLBACK,
        )
        return jsonify({"error": auth_required_message, "code": "AUTH_REQUIRED"}), 401

    return decorated_function


# ── Input Validation ─────────────────────────────────────────────
def validate_layer_config(config: Any) -> Dict[str, Any]:
    return security_runtime.validate_layer_config(config)


# ── Transmittal Builder helpers ─────────────────────────────────
def _parse_json_field(name: str, default):
    return transmittal_runtime.parse_json_field(name, default)


def _save_upload(file_storage, dest_dir: str, filename: Optional[str] = None) -> str:
    return transmittal_runtime.save_upload(file_storage, dest_dir, filename)


def _schedule_cleanup(path: str) -> None:
    return transmittal_runtime.schedule_cleanup(path)


def _convert_docx_to_pdf(docx_path: str, output_dir: str) -> Tuple[Optional[str], str]:
    return transmittal_runtime.convert_docx_to_pdf(docx_path, output_dir)

# AutoCAD runtime wiring (COM helpers + manager factory)
autocad_runtime = autocad_create_runtime_helper(
    autocad_com_available=AUTOCAD_COM_AVAILABLE,
    pythoncom_module=pythoncom,
    win32com_module=win32com,
    psutil_module=psutil,
    time_module=time,
    threading_module=threading,
    os_module=os,
    re_module=re,
    traceback_module=traceback,
    logger=logger,
    datetime_now_fn=datetime.now,
    api_base_dir=os.path.dirname(os.path.abspath(__file__)),
    foundation_source_type="Foundation Coordinates",
    print_fn=print,
)


def dyn(obj: Any) -> Any:
    return autocad_runtime.dyn(obj)


def connect_autocad() -> Any:
    return autocad_runtime.connect_autocad()


def get_manager() -> Any:
    return autocad_runtime.get_manager()

# ========== API ENDPOINTS ==========

# ========== AGENT BROKER ENDPOINTS ==========

def _request_gateway_pairing_code() -> Tuple[Optional[str], Optional[str], int]:
    return agent_runtime.request_gateway_pairing_code()


def _pair_agent_session_for_user(
    pairing_code: str,
    user_id: str,
    extra_payload: Optional[Dict[str, Any]] = None,
):
    return agent_runtime.pair_agent_session_for_user(
        pairing_code,
        user_id,
        _create_agent_session,
        extra_payload,
    )


def _revoke_gateway_agent_token(token: str):
    return agent_runtime.revoke_gateway_agent_token(token)


# ── Split Route Groups ──────────────────────────────────────────
register_route_groups(
    app,
    require_api_key=require_api_key,
    require_autocad_auth=require_autocad_auth,
    is_valid_api_key=is_valid_api_key,
    limiter=limiter,
    logger=logger,
    issue_ws_ticket=_issue_ws_ticket,
    api_key=API_KEY,
    schedule_cleanup=_schedule_cleanup,
    supabase_url=SUPABASE_URL,
    supabase_api_key=SUPABASE_API_KEY,
    auth_email_honeypot_field=AUTH_EMAIL_HONEYPOT_FIELD,
    auth_email_turnstile_secret=AUTH_EMAIL_TURNSTILE_SECRET,
    auth_email_require_turnstile=AUTH_EMAIL_REQUIRE_TURNSTILE,
    apply_auth_email_response_floor=_apply_auth_email_response_floor,
    auth_email_generic_response=_auth_email_generic_response,
    is_valid_email=_is_valid_email,
    get_request_ip=_get_request_ip,
    is_auth_email_request_allowed=_is_auth_email_request_allowed,
    email_fingerprint=_email_fingerprint,
    verify_turnstile_token=_verify_turnstile_token,
    send_supabase_email_link=_send_supabase_email_link,
    load_transmittal_profiles_payload=_load_transmittal_profiles_payload,
    transmittal_template_path=TRANSMITTAL_TEMPLATE_PATH,
    backup_storage_dir=BACKUP_STORAGE_DIR,
    backup_max_bytes=BACKUP_MAX_BYTES,
    backup_max_files=BACKUP_MAX_FILES,
    autodraft_dotnet_api_url=AUTODRAFT_DOTNET_API_URL,
    batch_session_cookie=BATCH_SESSION_COOKIE,
    batch_session_ttl_seconds=BATCH_SESSION_TTL_SECONDS,
    require_supabase_user=require_supabase_user,
    require_agent_session=require_agent_session,
    passkey_deps=dependency_bundle_build_passkey_deps_helper(globals()),
    agent_deps=dependency_bundle_build_agent_deps_helper(globals()),
    transmittal_render_deps=dependency_bundle_build_transmittal_render_deps_helper(
        globals()
    ),
    get_manager=get_manager,
    connect_autocad=connect_autocad,
    dyn=dyn,
    pythoncom=pythoncom,
    validate_layer_config=validate_layer_config,
    traceback_module=traceback,
)


@sock.route('/ws')
def websocket_status_bridge(ws):
    """WebSocket status stream for frontend real-time backend/AutoCAD connectivity updates."""
    return websocket_status_bridge_helper(
        ws,
        request_obj=request,
        is_valid_api_key_fn=is_valid_api_key,
        consume_ws_ticket_fn=_consume_ws_ticket,
        allow_api_key_fallback=WS_ALLOW_API_KEY_FALLBACK,
        logger=logger,
        get_manager=get_manager,
        json_module=json,
        time_module=time,
        backend_id='coordinates-grabber-api',
        backend_version='1.0.0',
    )


# ========== MAIN ==========

if __name__ == '__main__':
    server_entrypoint_run_helper(
        app=app,
        environ=os.environ,
        parse_int_env_fn=_parse_int_env,
        print_startup_banner_fn=bootstrap_print_startup_banner_helper,
        get_manager_fn=get_manager,
        print_initial_manager_status_fn=bootstrap_print_initial_manager_status_helper,
        debug=False,
        threaded=True,
    )
