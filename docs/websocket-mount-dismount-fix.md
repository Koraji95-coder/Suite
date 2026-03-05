# WebSocket Mount/Dismount Fix and API Key Alignment

## Summary
This document captures the exact root causes and code changes made to stop repeated websocket connect/disconnect behavior in Ground Grid Generation, and to harden API key alignment between Vite frontend and Python backend.

## Root Causes
1. Multiple React components were each calling `connectWebSocket()` on mount.
2. An extra `setInterval` loop forced reconnect attempts every 10 seconds even when the service already had retry/backoff logic.
3. The websocket service did not treat backend `AUTH_INVALID` as a terminal auth state, so reconnect loops could continue after invalid key responses.
4. There was no explicit backend startup check warning when `VITE_API_KEY` and `API_KEY` were different.
5. In development, React StrictMode mount/unmount cycles amplified all of the above.

## What Was Fixed

### 1) Single websocket connection owner pattern
`GroundGridContext` remains the connection owner. Other views now only subscribe to events.

- Removed extra `connectWebSocket()` calls from:
  - `src/components/apps/ground-grid-generator/GroundGridGeneratorApp.tsx`
  - `src/components/apps/ground-grid-generator/UnifiedLog.tsx`
  - `src/components/apps/coordinatesgrabber/useCoordinatesGrabberState.ts`

### 2) Removed duplicate forced reconnect loop
- Deleted the 10-second reconnect interval in:
  - `src/components/apps/coordinatesgrabber/useCoordinatesGrabberState.ts`

The service-level reconnect logic (with backoff and max attempts) is now the only reconnect mechanism.

### 3) Terminal handling for websocket auth failure
Updated:
- `src/components/apps/ground-grid-generator/coordinatesGrabberService.ts`

Changes:
1. Added an `authInvalid` state flag.
2. If server sends websocket message `{ type: "error", code: "AUTH_INVALID" }`, the client now:
   - marks auth as invalid,
   - emits explicit error/disconnected events for UI visibility,
   - disables reconnect,
   - closes the socket.
3. Future `connectWebSocket()` calls reject immediately until state reset.
4. `disconnect()` resets `authInvalid` so manual reconnect flows are still possible after correction/reload.

### 4) Backend startup guard for key mismatch
Updated:
- `backend/api_server.py`

Changes:
1. Added explicit startup check for `VITE_API_KEY`.
2. Logs warning if `VITE_API_KEY` is missing.
3. Logs error if `VITE_API_KEY` and `API_KEY` do not match.
4. Log message includes remediation: set both keys equal and restart both servers.

### 5) Environment template clarification
Updated:
- `.env.example`

Change:
1. Clarified that `API_KEY` must match `VITE_API_KEY` in local development for websocket auth to succeed.

## Files Edited
1. `src/components/apps/ground-grid-generator/coordinatesGrabberService.ts`
2. `src/components/apps/ground-grid-generator/GroundGridGeneratorApp.tsx`
3. `src/components/apps/ground-grid-generator/UnifiedLog.tsx`
4. `src/components/apps/coordinatesgrabber/useCoordinatesGrabberState.ts`
5. `backend/api_server.py`
6. `.env.example`
7. `docs/development/websocket-mount-dismount-fix.md` (new)

## Verification Performed
1. Confirmed local `.env` currently has matching values for:
   - `API_KEY`
   - `VITE_API_KEY`
2. Ran TypeScript checks:
   - `npm run typecheck` passed.

## How to Validate Locally
1. Restart backend server (`python backend/api_server.py`).
2. Restart Vite dev server (`npm run dev`).
3. Open Ground Grid Generation page.
4. Confirm only one stable websocket session is maintained.
5. If key mismatch exists, backend logs now explicitly report it at startup.

## Operational Notes
1. After changing `.env`, both backend and frontend dev servers must be restarted.
2. Browser-open tabs using old bundles can retain stale `VITE_*` values; refresh after restart.
3. React StrictMode still mounts/unmounts in dev, but duplicate connection side effects are now removed.

## Main PC Runbook
Use this on your main PC to apply and verify the same fix.

### 1) Pull/apply code changes
1. Ensure these files contain the same updates:
   - `src/components/apps/ground-grid-generator/coordinatesGrabberService.ts`
   - `src/components/apps/ground-grid-generator/GroundGridGeneratorApp.tsx`
   - `src/components/apps/ground-grid-generator/UnifiedLog.tsx`
   - `src/components/apps/coordinatesgrabber/useCoordinatesGrabberState.ts`
   - `backend/api_server.py`
   - `.env.example`

### 2) Confirm API key alignment
1. In `.env`, confirm:
   - `API_KEY=<value>`
   - `VITE_API_KEY=<same value>`
2. If different, make them identical.

### 3) Fully restart all services
1. Stop backend (`api_server.py`) process.
2. Stop Vite dev process (`npm run dev`).
3. Start backend first:
   - `python backend/api_server.py`
4. Start frontend:
   - `npm run dev`

### 4) Clear stale browser state
1. Close all browser tabs for Suite.
2. Re-open `http://localhost:5173`.
3. Hard refresh once (`Ctrl+F5`).

### 5) Validate backend logs
Expected good behavior:
1. WebSocket connects successfully on `/ws?api_key=...`.
2. API status/layers requests show `Auth: Valid`.
3. No repeated rapid connect/disconnect loop.

Example healthy sequence seen during fix:
1. `WebSocket connected from 127.0.0.1`
2. `API Request: GET /api/status ... Auth: Valid`
3. `API Request: GET /api/layers ... Auth: Valid`

### 6) If websocket still fails
1. Verify backend is listening on `127.0.0.1:5000`.
2. Verify Vite is serving on `5173`.
3. Re-check `.env` values and restart both processes again.
4. Confirm you are running the updated frontend code that uses websocket query auth (`/ws?api_key=...`), not the old subprotocol auth path.
