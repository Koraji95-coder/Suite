# Post-Bridge Tranche Handoff (2026-04-03)

Use this note to start the next chat without depending on thread memory.

## Current State

- The named-pipe bridge tranche is complete.
- `.env` parity is fixed.
- `npm run check` passes.
- The bridge is no longer part of the default daily runtime.

## What Landed

- Added the missing env parity key:
  - `SUITE_SUPABASE_LOCAL_ANALYTICS_ENABLED=`
- Made the in-process ACADE host explicit in local env defaults:
  - `AUTOCAD_DOTNET_ACADE_PIPE_NAME=SUITE_ACADE_PIPE`
- Made the legacy bridge opt-in/manual by default:
  - `AUTOCAD_DOTNET_AUTOSTART_BRIDGE=false`
  - `SUITE_DEV_AUTOSTART_NAMED_PIPE_BRIDGE=false`
- `npm run dev:full` no longer starts `dotnet/named-pipe-bridge` unless explicitly enabled.
- workstation bring-up no longer treats the bridge as a default build/startup dependency.
- backend bridge autostart is disabled by default for `SUITE_AUTOCAD_PIPE`.
- docs and architecture metadata now describe the bridge as:
  - manual diagnostics against `SUITE_AUTOCAD_PIPE`
  - optional explicit AutoDraft bridge fallback only
- Biome/typecheck issues that were blocking `npm run check` were fixed.

## Intentional Remaining Bridge Surface

These are not open tranche bugs. They are the deliberate remaining bridge surface after reclassification:

- manual validation against `SUITE_AUTOCAD_PIPE`
- AutoDraft execute only when the operator explicitly chooses:
  - `AUTODRAFT_EXECUTE_PROVIDER=dotnet_bridge`, or
  - `AUTODRAFT_EXECUTE_PROVIDER=dotnet_bridge_fallback_api`

Do not reintroduce default bridge startup or default docs wording for these paths.

## Validation Snapshot

Passed on April 3, 2026:

- `npm run env:check`
- `npm run docs:manifest`
- `npm run arch:generate`
- `python -m unittest backend.tests.test_dotnet_bridge_contract backend.tests.test_api_runtime_config`
- `python -m unittest backend.tests.test_api_route_groups`
- `npm run typecheck`
- `npm run check`

Manual AutoCAD/ACADE workstation validation was not run in this environment.

## Key Files For This Tranche

- `.env`
- `.env.example`
- `scripts/dev-full.mjs`
- `scripts/bootstrap-suite-workstation.ps1`
- `backend/dotnet_bridge.py`
- `backend/api_server.py`
- `backend/route_groups/api_autodraft.py`
- `docs/cad/named-pipe-bridge.md`
- `docs/runtime-control/README.md`
- `docs/frontend/project-setup-title-block-runtime-flow.md`
- `src/data/architectureModel.ts`
- `src/data/architectureSnapshot.generated.ts`
- `src/routes/knowledge/modules/generated/developerDocsManifest.generated.json`

## Next Recommended Tranche

1. Conservative tracked cleanup.
2. UI/design system overhaul.

If the next chat stays in the cleanup lane, focus on tracked stale tests/docs/assets only. Do not touch ignored local `bin`, `obj`, or `__pycache__` folders, and do not reopen the bridge architecture unless the goal is an explicit breaking removal of the manual fallback path.
