# Coordinates Grabber API Server

This Flask backend bridges the React web interface to AutoCAD's COM interface, enabling real-time AutoCAD detection and interaction from the browser.

## What This Solves

Browsers cannot directly access Windows processes or AutoCAD due to security sandboxing. This local server acts as a trusted bridge running on your PC.

## Features

- Real-time AutoCAD detection (`acad.exe` process)
- COM connection management
- Drawing state monitoring
- Layer listing from active drawing
- Selection count and trigger support
- Smart status caching to reduce CPU usage

## Quick Start

Canonical implementation files live in:

- `backend/api_server.py`
- `backend/requirements-api.txt`
- `backend/start_api_server.bat`

The backend will read a repo-root `.env` file if present (recommended for `API_KEY`).

### Option 1: Batch file (Windows)

```bat
cd backend
start_api_server.bat
```

### Option 2: Manual start

```bash
cd backend
pip install -r requirements-api.txt
python api_server.py
```

### Option 3: Workspace npm helper

```bash
npm run backend:coords:dev
```

Server default: `http://localhost:5000`

## Prerequisites

- Python 3.9+
- AutoCAD installed (Windows)
- Windows OS (uses `pywin32` COM)

## API Endpoints

### `GET /api/status`
Returns AutoCAD connection and backend status.

### `GET /api/layers`
Returns all layers from the active drawing.

### `GET /api/selection-count`
Returns count of currently selected AutoCAD objects.

### `POST /api/trigger-selection`
Brings AutoCAD to foreground for user selection.

### `GET /ws?api_key=<API_KEY>`
WebSocket stream for real-time backend/AutoCAD connection status.

### `GET /health`
Simple health check endpoint.

## Status States

| State | Process | COM | Document | Meaning |
|---|---|---|---|---|
| Offline | ❌ | ❌ | ❌ | AutoCAD not running |
| Starting | ✅ | ❌ | ❌ | AutoCAD launching |
| No Drawing | ✅ | ✅ | ❌ | AutoCAD ready, no drawing open |
| Ready | ✅ | ✅ | ✅ | Fully operational |

## Troubleshooting

### AutoCAD not detected
- Verify `acad.exe` in Task Manager
- Restart AutoCAD
- Confirm correct AutoCAD version

### COM connection failed
- Restart AutoCAD
- Close modal dialogs in AutoCAD
- Avoid mismatched privilege mode (normal/admin)

### No drawing open
- Create/open a drawing in AutoCAD

### Port already in use
- Change Flask port in `api_server.py`
- Update `VITE_COORDINATES_BACKEND_URL` in env

## Security Notes

- Intended for localhost development and trusted environments
- Use API key header authentication (`X-API-Key`)
- Keep keys in env files, not source code
- Default bind is loopback-only (`API_HOST=127.0.0.1`) to reduce network exposure

## Runtime Environment Variables

- `API_KEY` (required): shared header key expected in `X-API-Key`
- `API_KEY` can be set in `.env` at the repo root for local development
- `API_HOST` (optional): bind host (default `127.0.0.1`)
- `API_PORT` (optional): bind port (default `5000`)
- `API_ALLOWED_ORIGINS` (optional): comma-separated CORS origins
- `API_MAX_CONTENT_LENGTH` (optional): max request body bytes (default `104857600`)
- `API_RATE_LIMIT_DAY` (optional): global day limit (default `200 per day`)
- `API_RATE_LIMIT_HOUR` (optional): global hour limit (default `50 per hour`)

## Agent Broker (Optional)

The backend can broker ZeroClaw pairing + webhook calls so the browser never sees the bearer token.

Endpoints (all require Supabase auth `Authorization: Bearer <access_token>`):

- `GET /api/agent/health` → proxy gateway health
- `GET /api/agent/session` → `{ paired: boolean, expires_at?: string }`
- `POST /api/agent/pair` → `{ pairing_code: "123456" }`
- `POST /api/agent/unpair`
- `POST /api/agent/webhook` → same payload as gateway `/webhook`

Broker env vars (backend-only):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (preferred) or `SUPABASE_JWT_SECRET`
- If using new ECC JWT keys, leave `SUPABASE_JWT_SECRET` empty and rely on JWKS via `SUPABASE_URL`
- `AGENT_GATEWAY_URL` (default `http://127.0.0.1:3000`)
- `AGENT_WEBHOOK_SECRET`
- `AGENT_SESSION_TTL_SECONDS`

## WebSocket Event Shape

- `connected`: initial handshake payload with backend id/version
- `status`: periodic status payload (`connected`, `autocad_running`, `drawing_open`, `drawing_name`, `error`, `checks`)
- `error`: auth/connection errors (e.g., invalid API key)
