# AutoWire TODO List

Last updated: 2026-03-05

Historical note (2026-04-03): conduit-route dotnet-provider actions now use the
in-process ACADE host. Any named-pipe bridge steps below are legacy diagnostic
instructions only and are not part of the default daily runtime.

## Handoff Snapshot (2026-03-05 Evening)

- Status: **core terminal strip scan pipeline is working** with strict metadata filtering and AutoCAD bridge connectivity.
- Status: **actual CAD strip geometry rendering is now implemented** end-to-end (backend COM + .NET bridge + frontend renderer).
- Status: **routing overlay plumbing is in place** (obstacle sync + canvas overlay controls).
- Current provider target: `dotnet_fallback_com` (preferred for stability while iterating).

What was validated today:

- `python -m pytest backend/tests/test_api_autocad_terminal_scan.py -q` -> passed.
- `python -m pytest backend/tests/test_api_autocad_dotnet_provider.py -q` -> passed.
- `npm run typecheck` -> passed.
- `.NET bridge compile` -> succeeded when building to alternate output (default output file was locked by running server process).

## Next Session Quick Start (Detailed)

1. Stop any old bridge/backend/frontend processes.
   - If the .NET bridge is still running, stop it first (it can lock build outputs).
2. Start backend.
   - From repo root: `python backend/api_server.py`
3. Start the legacy .NET named pipe bridge only if you are intentionally doing pipe diagnostics.
   - From repo root: `dotnet run --project dotnet/named-pipe-bridge/NamedPipeServer.csproj`
4. Start frontend.
   - From repo root: `npm run dev`
5. Open app.
   - Navigate to `http://localhost:5173`
   - Go to `Apps` -> `Conduit Route` -> `Terminal Strips`
6. Run scan.
   - Click `Connect & Scan` (or rely on auto-connect if enabled).
7. Verify expected result.
   - Badge should show bridge connected and terminal count > 0.
   - Terminal map should show **actual strip geometry lines/polylines** for `TB_STRIP_META_SIDE` blocks.
8. If geometry is missing:
   - Confirm metadata block name matches allow-list (`TB_STRIP_META_SIDE` by default).
   - Confirm metadata block still contains attributes: `PANEL_ID`, `PANEL_NAME`, `SIDE`, `STRIP_ID`, `TERMINAL_COUNT`.
   - Confirm geometry entities are inside the block definition (or nested block refs).
   - Click `Rescan`.
9. If scan returns nothing:
   - Check CAD block reference names in drawing.
   - Check attribute tags are exact (uppercase expected logically).
   - Temporarily relax strict profile in frontend if needed for diagnosis.
10. Before rebuilding .NET bridge:
   - Stop running `NamedPipeServer` process first, then run build.

## Live Test Checklist (When You’re Back)

- [ ] Scan finds the two strips (`RP1L1`, `RP1R1`) in your test drawing.
- [ ] Geometry for each strip is visible in the map, not just synthetic rails.
- [ ] Clicking terminal points selects start/end and creates routed conductor path.
- [ ] Route Feed entries populate with `REF/FROM/TO/FN/COLOR/LEN`.
- [ ] No repeated `Failed to fetch` errors in browser console.
- [ ] Obstacle overlay sync works (or cleanly reports unavailable with message).

## Immediate

- [x] Set backend provider mode in `.env`:
  - `CONDUIT_ROUTE_AUTOCAD_PROVIDER=dotnet_fallback_com`
  - `AUTOCAD_DOTNET_PIPE_NAME=SUITE_AUTOCAD_PIPE`
  - `AUTOCAD_DOTNET_TIMEOUT_MS=30000`
- [x] Legacy diagnostic step: start the .NET named-pipe server and verify both actions respond:
  - `conduit_route_terminal_scan`
  - `conduit_route_obstacle_scan`
  - Validation snapshot (2026-03-05):
    - wrong token -> `AUTH_INVALID_TOKEN`
    - terminal action -> responded (`NO_TERMINAL_STRIPS_FOUND`)
    - obstacle action -> responded (`NO_OBSTACLES_FOUND`)
- [ ] Validate terminal scan in a real drawing that includes terminal strip blocks/attributes.
- [ ] Validate terminal geometry rendering in a real drawing using production-style block definitions.
- [ ] Validate obstacle scan in a real drawing with known routing layers.
- [ ] Confirm frontend status and logs are clean during normal use (no reconnect/auth noise).

## Functional Hardening

- [ ] Tighten terminal block detection rules for your actual CAD standards.
  - Progress snapshot (2026-03-05):
    - configurable `terminalProfile` support added in backend + .NET bridge
    - supports project-specific tag keys and defaults without code edits
- [x] Add layer-rule presets for obstacle classification per project template.
  - Validation snapshot (2026-03-05):
    - `backend/route_groups/api_autocad.py` (`layerPreset` + preset catalog + merge logic)
    - `backend/tests/test_api_autocad_dotnet_provider.py`
    - `src/components/apps/conduit-route/ConduitRouteApp.tsx`
- [x] Improve no-match diagnostics in responses (which layers were scanned, why entities were skipped).
  - Validation snapshot (2026-03-05):
    - `backend/route_groups/api_conduit_route_obstacle_scan.py`
    - `backend/route_groups/api_autocad_terminal_scan.py`
    - `backend/tests/test_api_conduit_route_obstacle_scan.py`
    - `backend/tests/test_api_autocad_terminal_scan.py`
- [x] Add request correlation ID logging across frontend, backend, and .NET bridge.
- [x] Add retry logic around transient COM read failures in .NET action handlers.
  - Validation snapshot (2026-03-05):
    - `dotnet/named-pipe-bridge/BatchFindAndReplace.cs`
    - env knobs: `AUTOCAD_DOTNET_COM_READ_RETRY_ATTEMPTS`, `AUTOCAD_DOTNET_COM_READ_RETRY_DELAY_MS`
- [x] Return terminal strip geometry primitives (`line`/`polyline`) in terminal scan payload.
  - Validation snapshot (2026-03-05):
    - `backend/route_groups/api_autocad_terminal_scan.py`
    - `dotnet/named-pipe-bridge/BatchFindAndReplace.cs`
    - `backend/tests/test_api_autocad_terminal_scan.py`
- [x] Render real CAD geometry in Terminal Strips map (fallback to synthetic rails when geometry unavailable).
  - Validation snapshot (2026-03-05):
    - `src/components/apps/conduit-route/conduitTerminalEngine.ts`
    - `src/components/apps/conduit-route/ConduitTerminalWorkflow.tsx`
    - `src/components/apps/conduit-route/conduitTerminalTypes.ts`

## Security / Auth

- [ ] Keep bearer-token auth as primary for `/api/conduit-route/*`.
- [x] Keep API-key fallback disabled in production:
  - `AUTOCAD_ALLOW_API_KEY_FALLBACK=false`
  - `WS_ALLOW_API_KEY_FALLBACK=false`
- [ ] Set and validate optional pipe token (`AUTOCAD_DOTNET_TOKEN`) if using shared workstation scenarios.
- [x] Add startup validation that provider mode + pipe settings are coherent.

## Performance

- [x] Benchmark scan duration on large drawings (10k, 50k, 100k entities).
  - Validation snapshot (2026-03-05):
    - `backend/benchmarks/conduit_route_benchmark.py` (`synthetic`, `replay`, `template` CLI modes)
    - `backend/tests/test_conduit_route_benchmark_harness.py`
    - sample smoke:
      - `python -m backend.benchmarks.conduit_route_benchmark synthetic --entity-counts 10000,50000,100000 --iterations 5`
      - `python -m backend.benchmarks.conduit_route_benchmark replay --snapshot backend/benchmarks/snapshots/replay-template.json --iterations 5`
- [x] Add scan caps and early-exit rules for very dense modelspaces.
  - Validation snapshot (2026-03-05):
    - `backend/route_groups/api_autocad.py` (`maxEntities` clamped to 500..200000, provider payload capped)
    - `backend/route_groups/api_conduit_route_obstacle_scan.py` (ModelSpace capped scan + cap warning)
    - `backend/route_groups/api_autocad_terminal_scan.py` (ModelSpace capped scan + cap warning)
- [x] Add telemetry counters for:
  - scan time
  - matched entities
  - deduped entities
  - obstacle count / strip count
  - Validation snapshot (2026-03-05):
    - `backend/route_groups/api_autocad.py` (`scanMs`, `obstacleScanMs`, `resolvedObstacleCount`)
    - `backend/route_groups/api_conduit_route_obstacle_scan.py` (`matchedLayerEntities`, `dedupedEntities`, diagnostics counters)
    - `backend/route_groups/api_autocad_terminal_scan.py` (`totalStrips`, `totalTerminals`, block-level diagnostics)

## Testing

- [x] Add automated contract tests between backend and .NET bridge payload shapes.
- [x] Add integration tests for provider modes:
  - `com`
  - `dotnet`
  - `dotnet_fallback_com`
- [x] Add regression tests for auth failure, pipe unavailable, and malformed action payloads.
  - Validation snapshot (2026-03-05):
    - `backend/tests/test_dotnet_bridge_contract.py`
    - `backend/tests/test_api_autocad_dotnet_provider.py`
    - `backend/tests/test_api_websocket_status.py`

## Production Migration (Next Major Step)

- [ ] Replace COM-backed .NET reads with ObjectARX/AutoCAD .NET DB transaction reads.
- [ ] Keep existing action contract stable while migrating internals.
- [ ] Add write-path actions for route placement/tagging with transactional safety.
- [ ] Add feature flag to switch read/write implementation per environment.
- [ ] Document deployment/runbook for production startup order and health checks.

