# Suite

Suite is a local-first engineering operations workspace for electrical and CAD production teams.

It focuses on deterministic workflows, review-first execution, and clear workstation ownership. Office owns local chat, orchestration, and operator-assistant work; Suite does not host an agent product surface.

## Product Families

The authenticated shell is organized around five families:

- `Home` for current work, product entry points, and restrained readiness signals
- `Projects` for the project notebook, meetings/calendar, files, stage status, review, and release context
- `Draft` for released drafting tools such as Drawing List Manager and Block Library
- `Review` for standards validation, readiness summaries, and math/reference support
- `Developer` for control, architecture, and lab surfaces that stay outside the released customer shell

## Core Capabilities

- Project operations:
  - project notebook
  - meetings/calendar folded into project workflow
  - files, release context, and review context tied back to the project record
- Drafting and delivery:
  - Drawing List Manager
  - Block Library
  - Transmittal Builder
  - deterministic title-block and delivery workflows
- Review and validation:
  - Standards Checker
  - readiness summaries
  - project review inbox and issue-set flows
- CAD-heavy lab workflows:
  - AutoDraft Studio
  - AutoWire
  - Ground Grid Generation
  - Batch Find & Replace
  - Whiteboard and supporting developer labs
- Runtime and diagnostics:
  - Runtime Control companion app
  - Command Center diagnostics
  - Work Ledger and changelog publishing support
  - Watchdog telemetry under the Developer family

## Architecture

### Frontend

- React 19 + TypeScript + Vite
- `src/routes/*` for route entry, redirects, audience gating, and shell composition
- `src/features/*` for active product and workflow ownership
- `src/components/system/*` for shared UI ownership

### Backend

- Flask API in `backend/`
- AutoCAD bridge endpoints
- auth and passkey support
- project, review, watchdog, transmittal, and work-ledger APIs

### Workstation And .NET

- `dotnet/Suite.RuntimeControl/*` for workstation-local companion behavior
- `dotnet/suite-cad-authoring/*` for in-process ACADE actions
- `dotnet/autodraft-api-contract/*` for AutoDraft contract support
- optional named-pipe bridge kept manual-only for explicit diagnostics

## Runtime Ownership

Suite uses a hybrid local/container model:

- Docker runtime core:
  - frontend
  - backend
  - Redis
  - local Supabase lane
- Runtime Control owns:
  - workstation-local start/stop
  - Docker observability
  - workstation identity
  - support bundles
  - local action handoff
- Machine-local only:
  - AutoCAD plugins and CAD execution
  - watchdog collectors and startup tasks
  - workstation profile data
  - SQLite state, JSONL exports, and promoted local model artifacts

Office is the local home for chat, orchestration, and operator-assistant work. Future local ML work inside Suite should be treated as new deterministic/local-model design, not as a continuation of the retired Suite agent stack.

## Local Development

### Prerequisites

- Node.js + npm
- Python 3.9+
- .NET SDK 8+
- Windows workstation for live AutoCAD flows
- AutoCAD installed for CAD-backed operations

### Install

```bash
npm install
python -m pip install -r backend/requirements-api.lock.txt
dotnet restore dotnet/Suite.RuntimeControl/Suite.RuntimeControl.csproj
dotnet restore dotnet/suite-cad-authoring/SuiteCadAuthoring.csproj
dotnet restore dotnet/autodraft-api-contract/AutoDraft.ApiContract.csproj
```

### Environment Setup

```bash
copy .env.example .env
npm run env:sync:dry
npm run env:sync
```

Minimum configuration:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_KEY`
- `API_KEY`
- any passkey callback settings required by your environment

### Start The Main Stack

Recommended daily flow:

```bash
npm run dev:full
```

That starts the frontend, backend, documentation/architecture checks, AutoDraft contract service, and the local runtime-core dependencies required for daily Suite work.

Useful focused commands:

```bash
npm run dev
npm run backend:coords:dev
npm run runtime:core:up
npm run runtime:core:ps
npm run runtime:core:down
npm run workstation:bringup:validate
npm run workstation:bringup -- -WorkstationId YOUR-WORKSTATION
```

## Validation

```bash
npm run typecheck
npm run test:unit
npm run build
npm run auth:playwright:bootstrap
npm run test:e2e:dashboard:perf
```

Derived outputs:

```bash
npm run docs:manifest
npm run arch:generate
```

## Documentation Map

Start here:

- `docs/README.md`

Canonical sections:

- `docs/frontend/README.md`
- `docs/backend/README.md`
- `docs/runtime-control/README.md`
- `docs/cad/README.md`

High-signal operating docs:

- `docs/runtime-control/local-vs-container-ownership.md`
- `docs/runtime-control/workstation-bringup.md`
- `docs/runtime-control/workstation-transfer-runbook.md`
- `docs/frontend/project-core-feature-slice.md`
- `docs/frontend/project-review-feature-slice.md`
- `docs/cad/README.md`

## Notes

- No Tailwind in the main app. Use the existing CSS modules + global CSS approach.
- Keep AutoCAD error envelopes backward compatible with `success`, `code`, `message`, and `requestId`.
- Do not make major auth flow changes without explicit approval.
- Historical-only notes belong under `docs/archive/legacy`.
