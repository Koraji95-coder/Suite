# AutoDraft Studio

This folder tracks the migration from a one-off Python COM script to a staged
Suite app architecture:

- Frontend TypeScript app for review, rule management, and action preview.
- Backend API orchestration layer for auth, validation, and integration.
- External .NET API for CAD execution (preferred long-term replacement for COM).

## Reference Sources

The original source artifacts are preserved here:

- `reference/pdf_to_autocad_v5.py`
- `reference/markup_recognition_architecture.jsx`

Important: files in `reference/` are historical source snapshots and may contain
legacy rule semantics. Current active color semantics for cloud markups are:

- `green => DELETE`
- `red => ADD`

Canonical sources for current rule mapping are:

- `docs/autodraft/rule_seed_spec.json`
- `backend/route_groups/api_autodraft.py`
- `dotnet/autodraft-api-contract/Services/RuleBasedAutoDraftPlanner.cs`
- `src/features/autodraft-studio/ui/autodraftData.ts`

## Goal (Current Understanding)

Build an AutoDraft pipeline that:

1. Extracts base drawing geometry from PDF vector content.
2. Extracts Bluebeam markups from annotation objects.
3. Classifies markups into deterministic actions (delete/add/note/swap/etc.).
4. Resolves geometry context spatially.
5. Produces a reviewable action plan before execution.
6. Executes approved actions through a .NET API endpoint.

## Migration Split

### Frontend (TypeScript)

- App UX, rule visualization, and action-review workflow.
- Local, deterministic helper logic (geometry/rules) for preview and testing.

### Backend (Python Flask)

- Endpoint contracts for AutoDraft features.
- Input validation, auth/API key handling, throttling.
- .NET-first proxy path for AutoDraft API (`AUTODRAFT_DOTNET_API_URL`).
  - Default target when unset: `http://127.0.0.1:5275`.
  - Falls back to local Python rules for `/api/autodraft/plan` if .NET is unavailable.

### .NET API (Planned)

- CAD-native operations and high-performance geometry transforms.
- Replace direct AutoCAD COM coupling for this workflow.
- Contract scaffold now lives at `dotnet/autodraft-api-contract`.

## Initial Backend Endpoints

- `GET /api/autodraft/health`
- `GET /api/autodraft/rules`
- `POST /api/autodraft/plan`
- `POST /api/autodraft/execute`
- `POST /api/autodraft/backcheck`
- `POST /api/autodraft/compare/prepare`
- `POST /api/autodraft/compare`

These endpoints support staged rollout: local fallback logic now, .NET-backed
execution when the external API is available.

## Compare Workflow (v1)

- `POST /api/autodraft/compare/prepare` accepts a Bluebeam PDF upload and selected page index.
- Prepare extracts annotation markups (`/Annots`) and returns normalized markup payloads plus optional measurement seed hints.
- `POST /api/autodraft/compare` requires prepared markups and accepts:
  - compare engine (`auto|python|dotnet`) and tolerance profile (`strict|medium|loose`),
  - default `calibration_mode=auto` (manual two-point calibration only when requested).
- Compare is QA-only in v1:
  - no CAD writes,
  - deterministic plan + backcheck output,
  - strict add/delete mismatch findings with pass/warn/fail summary,
  - no agent advisory or broker-driven pre-review layer.
- Engine routing:
  - `auto` prefers .NET and falls back to Python if unavailable,
  - `dotnet` is strict (no fallback),
  - `python` forces local compare engine.

## .NET Contract Project

- Path: `dotnet/autodraft-api-contract`
- Local run: `dotnet run` (inside that directory)
- Runtime target: `.NET 8` (`net8.0`)
- Backend default proxy target:
  - `AUTODRAFT_DOTNET_API_URL=http://127.0.0.1:5275`
- Override only if your .NET service uses a different address.

## Cutover Documentation

- Execute-path swap-over guide:
  - `docs/autodraft/execute-cutover.md`
