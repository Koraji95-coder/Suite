# Named Pipe Bridge (CAD Local IPC)

Status: this is the canonical low-level reference for explicit diagnostic/manual bridge validation. Project setup/title block, project standards review, AutoDraft / automation-recipe markup apply, terminal authoring preview/apply, batch find/replace preview/apply, Drawing Cleanup, and conduit-route dotnet-provider actions no longer depend on this bridge as a default runtime path.

Default startup status:

- `npm run dev:full` does not start the bridge unless `SUITE_DEV_AUTOSTART_NAMED_PIPE_BRIDGE=true`
- backend bridge autostart is disabled by default unless `AUTOCAD_DOTNET_AUTOSTART_BRIDGE=true`
- start `dotnet/named-pipe-bridge` manually when you intentionally need legacy `SUITE_AUTOCAD_PIPE` validation

This guide describes a safe, robust local bridge between Suite's hosted/local orchestration layers and a .NET AutoCAD automation service using Windows named pipes. It keeps AutoCAD transport local-only and does not require exposing network ports.

## Goals

- Keep browser and hosted-core APIs decoupled from AutoCAD execution details.
- Move AutoCAD automation into a .NET service (in-process add-in or local worker).
- Use a local-only IPC channel for reliability and security.

## Overview

- **Frontend (TSX)** calls hosted-core APIs or a trusted local companion.
- **Hosted core or Runtime Control** sends automation jobs to a **.NET named pipe server** when the active flow uses pipe dispatch.
- **.NET service** executes AutoCAD operations and returns results.

This keeps AutoCAD execution off the browser boundary and avoids exposing privileged local automation directly to the web client.

## Current Scope

No longer bridge-backed:

- project setup ACADE open/create/drawing scan/title-block apply
- project standards native review
- AutoDraft / automation-recipe markup apply (`suite_markup_authoring_project_apply`)
- terminal authoring preview/apply (`suite_terminal_authoring_project_preview`, `suite_terminal_authoring_project_apply`)
- batch find/replace CAD preview/apply (`suite_batch_find_replace_preview`, `suite_batch_find_replace_apply`)
- batch find/replace project preview/apply (`suite_batch_find_replace_project_preview`, `suite_batch_find_replace_project_apply`)
- conduit-route terminal scan / obstacle scan / route draw / terminal label sync
- `/api/conduit-route/bridge/terminal-labels/sync` as an HTTP compatibility alias; it now forwards to the in-process ACADE host

Still bridge-backed:

- any explicit diagnostic/manual validation against `SUITE_AUTOCAD_PIPE`
- AutoDraft execute only when `AUTODRAFT_EXECUTE_PROVIDER` is set to a bridge mode and the bridge has been started intentionally

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

### Current env wiring

The backend still exposes provider selection for conduit-route endpoints:

- `CONDUIT_ROUTE_AUTOCAD_PROVIDER=com` (default)
- `CONDUIT_ROUTE_AUTOCAD_PROVIDER=dotnet`
- `CONDUIT_ROUTE_AUTOCAD_PROVIDER=dotnet_fallback_com`

Current meaning:

- `com`: conduit-route uses the legacy COM manager path
- `dotnet`: conduit-route uses the in-process ACADE host through the backend ACADE sender
- `dotnet_fallback_com`: conduit-route uses the in-process ACADE host first and falls back to COM if that host call fails

Conduit-route endpoints that now target the in-process ACADE host when `dotnet` is selected:

- `/api/conduit-route/terminal-scan`
- `/api/conduit-route/obstacles/scan`
- `/api/conduit-route/terminal-routes/draw`
- `/api/conduit-route/terminal-labels/sync`
- `/api/conduit-route/bridge/terminal-labels/sync` as a compatibility alias
- `/api/conduit-route/route/compute` when `obstacleSource=autocad`

The compatibility alias keeps legacy HTTP routing and error-code expectations for older callers, but it no longer dispatches through `SUITE_AUTOCAD_PIPE`.

Named-pipe bridge settings remain relevant for explicit manual validation against the bridge transport:

- `AUTOCAD_DOTNET_PIPE_NAME=SUITE_AUTOCAD_PIPE`
- `AUTOCAD_DOTNET_TIMEOUT_MS=30000`
- `AUTOCAD_DOTNET_TOKEN=` (optional)
  - if set, the named-pipe bridge rejects mismatched/missing tokens with `AUTH_INVALID_TOKEN`
- `AUTOCAD_DOTNET_MAX_PIPE_INSTANCES=4` (optional)
- `AUTOCAD_DOTNET_MAX_PIPE_WORKERS=2` (optional)
- `AUTOCAD_DOTNET_COM_READ_RETRY_ATTEMPTS=3` (optional)
- `AUTOCAD_DOTNET_COM_READ_RETRY_DELAY_MS=35` (optional)

The in-process ACADE host has separate backend wiring and should be documented in the CAD/runtime ownership docs instead of this bridge-specific reference.

Each named-pipe action response should follow:

```json
{"id":"job-123","ok":true,"result":{"success":true,"data":{},"meta":{},"warnings":[]}}
```

Named-pipe action responses include shared telemetry in `result.meta`:

- `action`: normalized action key
- `actionMs`: handler elapsed time (ms)
- `queueWaitMs`: time waiting for an available worker (ms)
- `comReadRetryCount`: transient COM read retries consumed during request execution

For conduit-route HTTP results that now use the in-process ACADE host, the backend still preserves compatibility telemetry field names such as `bridgeMs` and `bridgeRequestId` even though the transport is no longer the named-pipe bridge.

## Conduit Terminal Label Sync Current State

The conduit terminal label-sync rollout is complete:

- `/api/conduit-route/terminal-labels/sync` uses COM only when the configured conduit provider is `com`
- `/api/conduit-route/terminal-labels/sync` uses the in-process ACADE host when the configured conduit provider is `dotnet` or `dotnet_fallback_com`
- `/api/conduit-route/bridge/terminal-labels/sync` remains as a compatibility alias but now also targets the in-process ACADE host
- `VITE_CONDUIT_TERMINAL_LABEL_SYNC_MODE=auto` now prefers the primary endpoint even for dotnet-backed runtime status

Operational follow-up notes live in `docs/development/conduit-terminal-label-sync-rollout.md`.

## Step 4: Long-running jobs (optional)

For long tasks:

- Backend creates a job ID and returns immediately.
- .NET service processes in background and reports status.
- Frontend polls `/api/jobs/:id`.

## Next steps

- Decide on pipe name and token scheme.
- Confirm where the .NET service will run (AutoCAD add-in vs standalone worker).
- Pick 1 automation feature to pilot (e.g., batch find/replace).
