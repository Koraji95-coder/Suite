# Named Pipe Bridge (Backend <-> .NET)

This guide describes a safe, robust local bridge between the existing backend and a .NET AutoCAD automation service using Windows named pipes. It keeps the TSX UI intact and does not require exposing network ports.

## Goals

- Keep React UI and Python backend as-is.
- Move AutoCAD automation into a .NET service (in-process add-in or local worker).
- Use a local-only IPC channel for reliability and security.

## Overview

- **Frontend (TSX)** calls the existing backend via HTTP.
- **Backend** sends automation jobs to a **.NET named pipe server**.
- **.NET service** executes AutoCAD operations and returns results.

This removes COM connection issues from the backend and avoids exposing keys to the browser.

## Pipe Naming

Pick a stable pipe name with no spaces, e.g.:

- `SUITE_AUTOCAD_PIPE`
- `AutoCAD_UIPipeline`

Named pipes are local to each Windows machine, so the same name can be used on multiple computers without conflict.

## Security & Robustness

- **Local-only**: Named pipes are not reachable from the network.
- **Auth**: Use a short-lived HMAC token from the backend as a request field.
- **Timeouts**: Set read/write timeouts in both client and server.
- **Bounded concurrency**: The .NET service now supports multi-instance listeners with bounded workers; tune conservatively for AutoCAD stability.

## Message Protocol (JSON lines)

Each request/response is a single JSON object on its own line (newline-delimited JSON).

Example request:

```json
{"id":"job-123","action":"batch_find_replace","payload":{"files":["C:\\path\\a.dwg"],"rules":[{"find":"A","replace":"B"}],"requestId":"req-abc-123","layerPreset":"substation_default","layerNames":["S-FNDN-PRIMARY"],"layerTypeOverrides":{"S-FNDN-PRIMARY":"foundation"}},"token":"<hmac>"}
```

Example response:

```json
{"id":"job-123","ok":true,"result":{"changed":12},"error":null}
```

## Step 1: Create the .NET named pipe server

- Host a `NamedPipeServerStream`.
- Read a line of JSON.
- Execute the requested action.
- Write a JSON response.

Starter code is in: `dotnet/named-pipe-bridge/BatchFindAndReplace.cs`.

## Step 2: Add a backend named pipe client

- Connect with `win32pipe`/`win32file` (pywin32).
- Send JSON request and read JSON response.

Starter code is in: `backend/dotnet_bridge.py`.

## Step 3: Wire into backend endpoints (later)

- Add an internal backend function to call the pipe client.
- Map existing `/api/*` endpoints to the .NET actions.
- Keep input validation in the backend.

### Current env wiring (Conduit Route)

The backend now supports provider selection for Conduit Route endpoints:

- `CONDUIT_ROUTE_AUTOCAD_PROVIDER=com` (default)
- `CONDUIT_ROUTE_AUTOCAD_PROVIDER=dotnet`
- `CONDUIT_ROUTE_AUTOCAD_PROVIDER=dotnet_fallback_com`

Named-pipe bridge settings:

- `AUTOCAD_DOTNET_PIPE_NAME=SUITE_AUTOCAD_PIPE`
- `AUTOCAD_DOTNET_TIMEOUT_MS=30000`
- `AUTOCAD_DOTNET_TOKEN=` (optional)
  - if set, .NET bridge rejects mismatched/missing tokens with `AUTH_INVALID_TOKEN`
- `AUTOCAD_DOTNET_MAX_PIPE_INSTANCES=4` (optional)
- `AUTOCAD_DOTNET_MAX_PIPE_WORKERS=2` (optional)
- `AUTOCAD_DOTNET_COM_READ_RETRY_ATTEMPTS=3` (optional)
- `AUTOCAD_DOTNET_COM_READ_RETRY_DELAY_MS=35` (optional)

When `dotnet` is selected, these endpoints call the pipe bridge directly:

- `/api/conduit-route/terminal-scan`
- `/api/conduit-route/obstacles/scan`
- `/api/conduit-route/terminal-routes/draw`

With `dotnet_fallback_com`, backend falls back to COM if the bridge call fails.

Terminal label sync now has parallel endpoints for staged migration:

- New bridge path (dotnet-only): `/api/conduit-route/bridge/terminal-labels/sync`
- Existing COM path (unchanged): `/api/conduit-route/terminal-labels/sync`

Obstacle scan requests can include optional preset-driven layer mapping:

- `layerPreset` (for example: `substation_default`, `industrial_plant`, `utility_yard`)
- `layerNames` (merged with preset layers)
- `layerTypeOverrides` (manual overrides take precedence over preset defaults)

Terminal scan requests can include optional terminal profile overrides:

- `terminalProfile.panelIdKeys`, `terminalProfile.panelNameKeys`, `terminalProfile.sideKeys`
- `terminalProfile.stripIdKeys`, `terminalProfile.stripNumberKeys`
- `terminalProfile.terminalCountKeys`, `terminalProfile.terminalTagKeys`
- `terminalProfile.terminalNameTokens`
- `terminalProfile.defaultPanelPrefix`, `terminalProfile.defaultTerminalCount`

Terminal strip metadata can include optional per-terminal label attributes:

- `TERM01_LABEL`, `TERM02_LABEL`, ... (1-based index)
- Returned in scan response as `strips[].terminalLabels[]`

Expected bridge actions for current Conduit Route integration:

- `conduit_route_terminal_scan`
- `conduit_route_obstacle_scan`
- `conduit_route_terminal_routes_draw`
- `conduit_route_terminal_labels_sync`

Each action response should follow:

```json
{"id":"job-123","ok":true,"result":{"success":true,"data":{},"meta":{},"warnings":[]}}
```

Bridge action responses now include shared telemetry in `result.meta`:

- `action`: normalized bridge action key
- `actionMs`: handler elapsed time (ms)
- `queueWaitMs`: time waiting for an available worker (ms)
- `comReadRetryCount`: transient COM read retries consumed during request execution
- Action-specific scan/draw metrics also remain in `result.meta` (for example:
  `scanMs`, `drawMs`, `scannedEntities`, `scannedBlockReferences`,
  `scannedGeometryEntities`, `segmentsDrawn`, `labelsDrawn`).

Current implementation status: these four actions are wired and execute live
AutoCAD operations through the .NET bridge process (COM-backed today).

Bridge maintainability refactor: action implementations are now split into
dedicated files under `dotnet/named-pipe-bridge/`:

- `ConduitRouteTerminalScanHandler.cs`
- `ConduitRouteObstacleScanHandler.cs`
- `ConduitRouteTerminalRouteDrawHandler.cs`
- `ConduitRouteTerminalLabelSyncHandler.cs`
- `ConduitRouteEtapCleanupHandler.cs`

## Terminal Label Sync Cutover Plan

Use this plan when moving UI/API traffic from COM label-sync to bridge label-sync.

### 1) Keep both endpoints active during validation

- Keep existing calls on `/api/conduit-route/terminal-labels/sync` for production behavior.
- Run validation traffic against `/api/conduit-route/bridge/terminal-labels/sync`.
- Frontend/client switch is controlled by `VITE_CONDUIT_TERMINAL_LABEL_SYNC_MODE`:
  - `legacy` (default): always call COM path endpoint.
  - `auto`: call bridge endpoint only when CAD provider is `dotnet` and sender is ready.
  - `bridge`: always call bridge endpoint.

### 2) Validate parity

- Automated check: run `python -m pytest backend/tests/test_api_autocad_dotnet_provider.py -k terminal_label`.
- Manual check in a real drawing:
  - Same strip target list and terminal count.
  - Same `TERMxx_LABEL` final values after sync.
  - Same/matching failure signals for unmatched strips (`NO_TARGET_STRIPS_MATCHED`) and no-strip drawings (`NO_TERMINAL_STRIPS_FOUND`).
  - No regression in existing auth/session flow.

### 3) Swap criteria

Swap UI/backend callers to `/api/conduit-route/bridge/terminal-labels/sync` only when:

- Bridge endpoint passes automated tests in CI/local.
- Manual drawing parity is verified on representative projects.
- Bridge process is available/reliable in the target environment.

### 4) Rollback path

If bridge label-sync degrades, route traffic back to `/api/conduit-route/terminal-labels/sync`
(COM path) immediately. This is low-risk because the legacy endpoint behavior is unchanged.

Detailed operator runbook: `docs/development/conduit-terminal-label-sync-rollout.md`.

## Step 4: Long-running jobs (optional)

For long tasks:

- Backend creates a job ID and returns immediately.
- .NET service processes in background and reports status.
- Frontend polls `/api/jobs/:id`.

## Next steps

- Decide on pipe name and token scheme.
- Confirm where the .NET service will run (AutoCAD add-in vs standalone worker).
- Pick 1 automation feature to pilot (e.g., batch find/replace).
