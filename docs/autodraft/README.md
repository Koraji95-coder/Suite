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
- Optional proxy to .NET AutoDraft API (`AUTODRAFT_DOTNET_API_URL`).

### .NET API (Planned)

- CAD-native operations and high-performance geometry transforms.
- Replace direct AutoCAD COM coupling for this workflow.
- Contract scaffold now lives at `dotnet/autodraft-api-contract`.

## Initial Backend Endpoints

- `GET /api/autodraft/health`
- `GET /api/autodraft/rules`
- `POST /api/autodraft/plan`
- `POST /api/autodraft/execute`

These endpoints support staged rollout: local fallback logic now, .NET-backed
execution when the external API is available.

## .NET Contract Project

- Path: `dotnet/autodraft-api-contract`
- Local run: `dotnet run` (inside that directory)
- Set backend env to enable proxying:
  - `AUTODRAFT_DOTNET_API_URL=http://localhost:5275`
