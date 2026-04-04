# Coordinates Grabber API Server

Status: this is a compatibility/reference doc for backend-served local AutoCAD status and coordinates endpoints. Project setup/title block local actions no longer use a backend-owned folder-picker model; they go through Runtime Control first.

This Flask backend bridges the web interface to AutoCAD's COM interface for local status-style endpoints and compatibility flows.

## What This Solves

Browsers cannot directly access Windows processes or AutoCAD due to security sandboxing. This local server acts as a trusted bridge for backend-served local CAD status flows that still run through the Python API layer.

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
- `backend/requirements-api.txt` (unpinned input)
- `backend/requirements-api.lock.txt` (pinned lockfile)
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
pip install -r requirements-api.lock.txt
python api_server.py
```

To refresh locked pins after dependency changes:

```bash
cd backend
python -m piptools compile requirements-api.in --output-file requirements-api.lock.txt
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
Includes limiter runtime metadata under `limiter`:
`storage`, `degraded`, and `reason`.

### `GET /api/transmittal/profiles`
Returns allowed transmittal sender profiles and firm numbers from backend config.

### `POST /api/transmittal/render`
Generates a transmittal file from uploaded inputs.

Security note: include `fields.from_profile_id` to select a server-authoritative sender profile.  
When provided, backend resolves sender name/title/email/phone from the profile and does not trust client-edited sender values.

### `GET /api/transmittal/template`
Downloads the bundled transmittal template DOCX.

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
- `API_LIMITER_STORAGE_URI` (optional): primary limiter storage URI (prefer Redis-compatible backend)
- `REDIS_URL` (optional): fallback alias for limiter storage URI
- `API_LIMITER_DEV_DEGRADE_ON_REDIS_FAILURE` (optional): allow dev fallback to `memory://` when Redis is unreachable (default `true`)
- `API_LIMITER_REDIS_PROBE_TIMEOUT_MS` (optional): Redis probe timeout at startup (default `800`)
- `API_REQUIRE_SHARED_LIMITER_STORAGE` (optional): enforce strict shared storage outside production mode (default `false` in `.env.example`)

Auth and passkey callback behavior now lives under `docs/security/*`. Office owns local agent, chat, and orchestration work; those concerns are intentionally out of scope for this local CAD bridge note.

## WebSocket Event Shape

- `connected`: initial handshake payload with backend id/version
- `status`: periodic status payload (`connected`, `autocad_running`, `drawing_open`, `drawing_name`, `error`, `checks`)
- `error`: auth/connection errors (e.g., invalid API key)
