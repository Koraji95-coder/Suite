# Suite

Suite is a local-first engineering operations workspace that combines:

- CAD-integrated workflow apps (AutoWire, AutoDraft, ground grid, Drawing Cleanup, etc.)
- a Flask backend bridge for AutoCAD and orchestration APIs
- a profile-based multi-agent system (Suite agent gateway + Ollama)
- project operations UX (dashboard, projects, calendar, docs, command center)

The app is designed for day-to-day electrical/CAD production work, with emphasis on deterministic execution, review gates, and operator control.

## What Suite Does

### 1) Engineering Workspace

- Project and dashboard workflows (`/app/dashboard`, `/app/projects`)
- Calendar and planning (`/app/calendar`)
- Knowledge libraries (Math Tools, Whiteboard)

### 2) CAD and Drafting Automation

- **AutoWire** (`/app/apps/autowire`)
  - Conduit/cable route planning
  - obstacle scanning
  - terminal scan/draw/label sync flows
  - backcheck and sync safety gates
- **AutoDraft Studio** (`/app/apps/autodraft-studio`)
  - Bluebeam-style markup interpretation
  - deterministic action planning
  - read-only CAD-aware backcheck
  - controlled execute path with override reason on failing backchecks
- **Ground Grid Generation** (`/app/apps/ground-grid-generation`)
  - coordinate workflows + plotting/export support
- **Batch Find & Replace** (`/app/apps/batch-find-replace`)
  - review-first Drawing Cleanup for dirty imports and noisy active drawings
  - active-drawing CAD replacement
  - file-based replacement
- Additional active tools:
  - Drawing List Manager
  - Transmittal Builder
  - Standards Checker
  - Graph Explorer

### 3) Multi-Agent Orchestration

- Agent Studio (`/app/agent`) supports:
  - direct profile chat
  - orchestration runs with run ledger + SSE events
  - live run threads and activity/task visibility
- Six deterministic profiles:
  - `koro`, `devstral`, `sentinel`, `forge`, `draftsmith`, `gridsage`
- Strict single-model routing per profile (no cross-profile fallback retries)

### 4) Local Control Plane (Command Center)

- Dev/admin command presets
- watchdog monitoring and event feed
- architecture panel and operational utilities

## High-Level Architecture

### Frontend (React + TypeScript + Vite)

- Location: `src/`
- Routing and workspace shell in `src/routes/*`
- App modules in `src/components/apps/*`
- Agent UX in `src/components/agent/*`

### Backend (Python Flask)

- Entry point: `backend/api_server.py`
- Domain route groups: `backend/route_groups/*`
- Primary role:
  - AutoCAD bridge APIs
  - auth/pairing APIs
  - agent broker + orchestration APIs
  - transmittal/watchdog/dashboard support APIs
- Project setup/title-block hosted-core ownership now stays on `api_project_setup.py`; legacy `api_title_block_sync.py` is removed and `/api/watchdog/pick-root` is retired.

### .NET Services

- `dotnet/suite-cad-authoring` (`net8.0-windows`)
  - in-process ACADE host for project setup, standards review, batch/terminal authoring, conduit-route dotnet-provider actions, and other native CAD actions
- `dotnet/autodraft-api-contract` (`net8.0`)
  - AutoDraft contract service (`/api/autodraft/*`)
- `dotnet/named-pipe-bridge` (`net8.0`)
  - local named-pipe bridge kept for explicit diagnostics and manual validation against `SUITE_AUTOCAD_PIPE`

### Suite Agent Gateway

- Canonical daily command from this repo:
  - `npm run gateway:dev`
- Default path:
  - Suite-native Node gateway in `scripts/suite-agent-gateway.mjs`
- Legacy ZeroClaw CLI fallback is retired from the active Suite gateway workflow.
- Historical ZeroClaw extraction notes remain in `docs/development/zeroclaw-*.md`; the old subtree is no longer part of the active repo layout.

## Tech Stack

- Frontend: React 19, TypeScript, Vite, React Router
- UI primitives: custom primitives + CSS modules/global CSS (no Tailwind)
- Backend: Flask, Flask-CORS, Flask-Limiter, Flask-Sock, pywin32
- Auth: Supabase (email-link first, optional passkey rollout paths)
- Agent runtime: Suite-native gateway + Ollama local models
- .NET: ASP.NET Core (AutoDraft contract) + `suite-cad-authoring` + optional named-pipe bridge for explicit diagnostics or bridge-mode AutoDraft fallback
- Quality: Biome, TypeScript typecheck, Vitest, Playwright, pytest, dotnet test

## Repository Layout

- `src/` - frontend app, routes, components, services
- `backend/` - Flask API bridge and route groups
- `dotnet/` - Runtime Control, CAD host, contract, and diagnostic bridge projects
- `docs/` - canonical documentation and runbooks
- `scripts/` - env sync, architecture model, gateway/dev orchestration helpers

## Local Development

## Prerequisites

- Node.js + npm
- Python 3.9+ (Windows strongly recommended for AutoCAD integration)
- .NET SDK 8+ (for .NET services)
- AutoCAD installed (required for live CAD operations)
- Ollama (required for local agent model execution)

Optional but recommended:

- Redis-compatible runtime for limiter state (the repo defaults to Docker Redis locally)
- DailyDesk / Office source available in its own local workspace or repo
  - preferred root: `C:\Users\<you>\Documents\GitHub\Office`
  - live knowledge/state: `%USERPROFILE%\Dropbox\SuiteWorkspace\Office\Knowledge` and `%USERPROFILE%\Dropbox\SuiteWorkspace\Office\State`

## 1) Install Dependencies

```bash
npm install
```

```bash
python -m pip install -r backend/requirements-api.lock.txt
```

```bash
dotnet restore dotnet/Suite.RuntimeControl/Suite.RuntimeControl.csproj
dotnet restore dotnet/suite-cad-authoring/SuiteCadAuthoring.csproj
dotnet restore dotnet/autodraft-api-contract/AutoDraft.ApiContract.csproj
```

Optional manual restore for legacy pipe diagnostics:

```bash
dotnet restore dotnet/named-pipe-bridge/NamedPipeServer.csproj
```

## 2) Environment Setup

```bash
copy .env.example .env
```

Then sync missing keys from `.env.example` into your local `.env`:

```bash
npm run env:sync:dry
npm run env:sync
```

At minimum, configure:

- Supabase keys/URLs
- API key values (`VITE_API_KEY`, `API_KEY`)
- agent/gateway settings (`AGENT_GATEWAY_URL`, `AGENT_WEBHOOK_SECRET`, etc.)
- model routing keys if you override defaults

## 3) Start the Stack

### Full local stack (recommended)

```bash
npm run dev:full
```

This orchestrates:

- frontend (`npm run dev`)
- backend (`npm run backend:coords:dev`)
- gateway (`npm run gateway:dev`)
- AutoDraft .NET API (`dotnet run --project dotnet/autodraft-api-contract/AutoDraft.ApiContract.csproj`)
- Redis startup via Docker (`suite-redis-local` on `127.0.0.1:6379` by default)

The named-pipe bridge is not started by default. Start it manually only for explicit diagnostics/manual validation against `SUITE_AUTOCAD_PIPE`, or for an intentional bridge-mode AutoDraft fallback.

To disable AutoDraft .NET API autostart in full mode:

- `SUITE_DEV_AUTOSTART_AUTODRAFT_DOTNET=false`

To opt into legacy named-pipe bridge autostart in full mode:

- `SUITE_DEV_AUTOSTART_NAMED_PIPE_BRIDGE=true`

### Redis + limiter startup behavior

- Limiter URI precedence stays: `API_LIMITER_STORAGE_URI`, then `REDIS_URL`.
- `dev:full` ensures a Docker Redis container is running for local limiter/session storage.
  - Default container: `suite-redis-local`
  - Default volume: `suite_redis_local_data`
  - Default image: `redis:7-alpine`
  - Optional overrides: `SUITE_REDIS_CONTAINER_NAME`, `SUITE_REDIS_DATA_VOLUME`, `SUITE_REDIS_IMAGE`
- Strict shared-storage mode is enabled when either:
  - `API_REQUIRE_SHARED_LIMITER_STORAGE=true`, or
  - `API_ENV`/`FLASK_ENV` is `production` or `prod`.
- In non-strict mode with `API_LIMITER_DEV_DEGRADE_ON_REDIS_FAILURE=true`, backend degrades to `memory://` when Redis is unreachable and logs a high-visibility warning.
- In strict mode, unreachable Redis fails backend startup immediately.
- `/health` now includes limiter runtime metadata under `limiter.storage`, `limiter.degraded`, and `limiter.reason`.
- Agent pairing/session storage can use Redis for restart persistence:
  - `AGENT_SESSION_REDIS_ENABLED=true` (default)
  - `AGENT_SESSION_REDIS_URL` (optional override; otherwise uses limiter/`REDIS_URL` Redis URI)
  - `AGENT_SESSION_TTL_SECONDS` (set `604800` for a 7-day session window)
- `/health` includes agent session store status under `agent_session_store.mode` and `agent_session_store.reason`.
- `runtime:core` uses an internal Compose Redis service for the backend container path.

Docker Redis checks:

```bash
docker ps --filter "name=^/suite-redis-local$"
docker exec suite-redis-local redis-cli ping
```

If the browser reports CORS/preflight failures, verify backend startup logs first. A limiter bootstrap failure can return backend `500` before request handlers execute, which often appears as a CORS error in the browser.

### Manual startup (when debugging specific layers)

Frontend:

```bash
npm run dev
```

Backend:

```bash
npm run backend:coords:dev
```

Gateway:

```bash
npm run gateway:dev
```

Optional AutoDraft contract service:

```bash
dotnet run --project dotnet/autodraft-api-contract/AutoDraft.ApiContract.csproj
```

## 4) Health Checks

- Frontend: `http://localhost:5173`
- Backend health: `http://127.0.0.1:5000/health`
- Gateway health: `http://127.0.0.1:3001/health`

## Cross-Workstation Bring-Up

Suite and Office are intentionally kept separate:

- `Suite` repo preferred local root: `C:\Users\<you>\Documents\GitHub\Suite`
- `DailyDesk` / Office preferred local root: `C:\Users\<you>\Documents\GitHub\Office`
- Office live knowledge/state roots: `%USERPROFILE%\Dropbox\SuiteWorkspace\Office\Knowledge` and `%USERPROFILE%\Dropbox\SuiteWorkspace\Office\State`
- `Suite Runtime Control` stays inside the `Suite` repo

Use the new workstation bootstrap flow when setting up another Windows PC:

```bash
npm run workstation:bringup:validate
npm run workstation:bringup -- -WorkstationId DUSTIN-WORK -DailyRepoUrl https://github.com/Koraji95-coder/Office.git
```

If both repos are already cloned into the standard roots, that is the preferred path:

```bash
git clone https://github.com/Koraji95-coder/Suite.git C:\Users\<you>\Documents\GitHub\Suite
git clone https://github.com/Koraji95-coder/Office.git C:\Users\<you>\Documents\GitHub\Office
cd C:\Users\<you>\Documents\GitHub\Suite
npm run workstation:bringup:validate
npm run workstation:bringup -- -WorkstationId DUSTIN-WORK
```

In that layout, bootstrap will detect the existing `Documents\GitHub\Office` workspace automatically and use it without needing `-DailyRepoUrl`.

If the Daily workspace is not yet in its own Git repo, you can temporarily hydrate it from an existing local source path:

```bash
npm run workstation:bringup -- -WorkstationId DUSTIN-WORK -DailySourcePath "C:\\Users\\koraj\\OneDrive\\Desktop\\Daily"
```

Related docs:

- `docs/runtime-control/workstation-bringup.md`
- `docs/runtime-control/workstation-transfer-runbook.md`
- `docs/development/electrical-drawing-program-test-readiness.md`

## Agent System Summary

### Profile to Model Defaults

- `koro` -> `qwen3:14b`
- `devstral` -> `devstral-small-2:latest`
- `sentinel` -> `gemma3:12b`
- `forge` -> `qwen2.5-coder:14b`
- `draftsmith` -> `joshuaokolo/C3Dv0:latest`
- `gridsage` -> `ALIENTELLIGENCE/electricalengineerv2:latest`

### Transport Modes

- `VITE_AGENT_TRANSPORT=backend` (brokered; recommended for orchestration)
- `VITE_AGENT_TRANSPORT=direct` (direct browser -> gateway troubleshooting path)

### Key Agent APIs

- `GET /api/agent/profiles`
- `POST /api/agent/webhook`
- `POST /api/agent/runs`
- `GET /api/agent/runs/:runId`
- `GET /api/agent/runs/:runId/events`
- `POST /api/agent/runs/:runId/cancel`

## AutoCAD + AutoDraft + AutoWire API Highlights

### Core bridge and CAD status

- `GET /api/status`
- `GET /api/layers`
- `GET /api/selection-count`
- `POST /api/trigger-selection`

### AutoWire / conduit routing

- `POST /api/conduit-route/obstacles/scan`
- `POST /api/conduit-route/route/compute`
- `POST /api/conduit-route/backcheck`
- `POST /api/conduit-route/terminal-scan`
- `POST /api/conduit-route/terminal-routes/draw`
- `POST /api/conduit-route/terminal-labels/sync`
- `POST /api/conduit-route/bridge/terminal-labels/sync`
  - compatibility alias; dotnet-backed conduit routing now uses the in-process ACADE host rather than the named-pipe bridge

### AutoDraft

- `GET /api/autodraft/health`
- `GET /api/autodraft/rules`
- `POST /api/autodraft/plan`
- `POST /api/autodraft/backcheck`
- `POST /api/autodraft/execute`
- `POST /api/autodraft/compare/prepare`
- `POST /api/autodraft/compare`

Compare v1 notes:

- `compare/prepare` extracts Bluebeam annotations from a selected PDF page.
- `compare` is QA-only (no CAD writes) and defaults to auto-calibration.
- Manual two-point calibration is still available via `calibration_mode=manual` or `manual_override=true`.
- Agent pre-review (`draftsmith`) can provide bounded advisory boosts before deterministic replacement scoring.

### Auth and pairing

- `POST /api/auth/email-link`
- `GET /api/auth/passkey-capability`
- `POST /api/auth/passkey/sign-in`
- `POST /api/auth/passkey/enroll`
- `POST /api/auth/passkey/callback/complete`
- `POST /api/agent/pairing-challenge`
- `POST /api/agent/pairing-confirm`
- `POST /api/agent/session/clear`

## Quality and Validation

Primary repo check:

```bash
npm run check
```

Useful subsets:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:e2e
```

Backend tests:

```bash
python -m pytest backend/tests
```

.NET tests:

```bash
dotnet test dotnet/autodraft-api-contract.Tests/AutoDraft.ApiContract.Tests.csproj -v minimal
```

## Documentation Map

Start here:

- `docs/README.md`

High-signal sections:

- `docs/agent/README.md`
- `docs/autodraft/README.md`
- `docs/frontend/README.md`
- `docs/runtime-control/README.md`
- `docs/cad/README.md`
- `docs/deep-repo-hardening-backlog.md`
- `docs/development/realtime-agent-autowire-autodraft-state.md`

## Operational Guardrails (Current Project Conventions)

- No Tailwind in the Suite app (CSS modules/global CSS only)
- Biome-only lint/format workflow (no ESLint adoption)
- Do not make major auth-flow changes without explicit approval
- Keep AutoCAD error envelopes backward compatible (`success`, `code`, `message`, `requestId`, optional `meta`)
- Keep deterministic profile-based model routing with no cross-profile fallback retries

## Current State

This repository is actively evolving and optimized for local engineering production workflows. The best source of "what changed recently" is:

- `docs/deep-repo-hardening-backlog.md`
- `docs/development/realtime-agent-autowire-autodraft-state.md`
