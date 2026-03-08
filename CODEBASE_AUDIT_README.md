# Suite Codebase Audit README

Date: 2026-03-07
Scope: `src/`, `backend/`, `dotnet/`, `zeroclaw-main/`
Mode: audit + remediation log (includes implemented P1 backend changes on 2026-03-07)

## Executive Summary

- Build/lint/typecheck/tests for Suite frontend/backend/.NET are currently passing in this workspace.
- Highest impact gaps are consistency and scale gaps, not immediate compile failures.
- The most important fixes are:
1. finish error-envelope/requestId consistency in AutoCAD endpoints
2. migrate remaining raw `fetch` calls to shared timeout/error utility
3. replace in-memory rate-limit storage for multi-instance/prod safety
4. reduce backend exception swallowing in AutoCAD/COM layers
5. finish ZeroClaw Android bridge (currently stub/simulated)

## What Was Validated

1. Frontend checks:
- `npm run check` passed
- `npm run build` passed

2. Backend checks:
- `python -W error -m unittest discover -s backend/tests` passed (335 tests)

3. .NET checks:
- `dotnet test dotnet/autodraft-api-contract.Tests/AutoDraft.ApiContract.Tests.csproj -c Release` passed
- `dotnet build dotnet/named-pipe-bridge/NamedPipeServer.csproj -c Release` passed

4. ZeroClaw compile check:
- `cargo check --workspace` failed due to environment/toolchain (`link.exe` missing), not a confirmed code regression

## Confirmed Issues and Risks (Prioritized)

## P1 - Observability and Production Reliability

1. Rate limiter uses in-memory storage (non-shared state across instances).
- Evidence: `backend/api_server.py:332`
- Risk: inconsistent throttling in multi-process/multi-host deployments.
- Upgrade: use Redis or another shared store for limiter state.
- Status: completed (backend implementation done).
- Fixes implemented:
- Added shared limiter storage resolver in `backend/route_groups/api_http_hardening.py`.
- `backend/api_server.py` now resolves storage URI from `API_LIMITER_STORAGE_URI` or `REDIS_URL`.
- Production/required-shared modes now fail fast if storage remains in-memory (`API_ENV=production` or `API_REQUIRE_SHARED_LIMITER_STORAGE=true`).
- Added tests in `backend/tests/test_api_http_hardening.py`.

2. Flask `app.run(...)` entrypoint and explicit threading in process bootstrap.
- Evidence: `backend/route_groups/api_server_entrypoint.py:39`, `backend/api_server.py:1741`
- Risk: runtime drift between local/dev and production WSGI/ASGI hosting.
- Upgrade: standardize deployment entrypoint (gunicorn/uwsgi/waitress/etc.) and keep `app.run` local-only.
- Status: completed (entrypoint hardening done).
- Fixes implemented:
- `backend/route_groups/api_server_entrypoint.py` now supports `allow_dev_server` guard and defaults `threaded=False`.
- `backend/api_server.py` now gates dev-server startup via `API_ALLOW_FLASK_DEV_SERVER` (default disabled in production envs).
- Added `API_DEV_SERVER_THREADED` for explicit opt-in threading in local/dev.
- Added test coverage in `backend/tests/test_api_server_entrypoint.py` for the dev-server block path.

3. AutoCAD API error payloads are still inconsistent (many errors still omit `requestId`).
- Evidence samples: `backend/route_groups/api_autocad.py:567`, `backend/route_groups/api_autocad.py:841`, `backend/route_groups/api_autocad.py:895`, `backend/route_groups/api_autocad.py:949`
- Risk: harder failure correlation across frontend/backend/bridge logs.
- Upgrade: complete Scope 2 phase-2 rollout for all AutoCAD routes.
- Status: completed for route-layer envelope/requestId normalization.
- Fixes implemented:
- Added route-level default error normalization in `backend/route_groups/api_autocad.py` (`_default_error_code` + enhanced `_autocad_attach_request_id`).
- Error responses now auto-fill missing `requestId`, `code`, and `message` for error payloads.
- Migrated remaining legacy branches in `selection-count`, `trigger-selection`, `download-result`, and `open-export-folder` to `_error_response` envelope usage.
- Added structured exception logging with stage/code context for download/open-folder failures.

4. Heavy broad-exception footprint and swallow patterns remain in AutoCAD/COM paths.
- Evidence:
- `except Exception` count in backend scan: high concentration in `backend/coordinatesgrabber.py`, `backend/route_groups/api_autocad.py`, `backend/route_groups/api_autocad_manager.py`
- `except Exception: pass` pattern count in backend scan: high concentration in same modules
- Risk: hidden root causes and silent degraded behavior.
- Upgrade: replace broad catch/pass with typed exceptions + stage code + structured logging.
- Status: completed for swallow-pattern remediation in the three hotspot files.
- Fixes implemented:
- Removed `except Exception: pass` patterns from:
- `backend/route_groups/api_autocad.py`
- `backend/route_groups/api_autocad_manager.py`
- `backend/coordinatesgrabber.py`
- Added recoverable-exception logging helpers (`_log_ignored_exception` / `log_ignored_exception`) to preserve behavior while surfacing root-cause context.
- Added targeted narrowing for parse failures (`TypeError`/`ValueError`) where safe (for example `max_entities` parsing in manager label sync path).

## P1 - Frontend Network Reliability Consistency

1. Remaining raw `fetch` calls in critical services bypass shared timeout/error mapping.
- Evidence:
- `src/services/agentService.ts` (multiple raw fetches)
- `src/components/apps/ground-grid-generator/coordinatesGrabberService.ts:339`, `:596`, `:639`, `:694`, `:720`, `:746`, `:771`, `:793`, `:823`
- `src/components/apps/conduit-route/conduitRouteService.ts:110`, `:174`, `:208`
- `src/components/apps/autodraft-studio/autodraftService.ts:337`
- `src/components/apps/transmittal-builder/transmittalService.ts:114`
- Risk: inconsistent timeout behavior and user-facing error messages.
- Upgrade: migrate all to `src/lib/fetchWithTimeout.ts`.
- Status: completed (P1 migration implemented on 2026-03-07).
- Fixes implemented:
- Migrated critical service calls to shared `fetchWithTimeout` in:
- `src/services/agentService.ts`
- `src/components/apps/ground-grid-generator/coordinatesGrabberService.ts`
- `src/components/apps/conduit-route/conduitRouteService.ts`
- `src/components/apps/autodraft-studio/autodraftService.ts`
- `src/components/apps/transmittal-builder/transmittalService.ts`
- Added standardized response error parsing via `parseResponseErrorMessage` and normalized fetch-failure message mapping via `mapFetchErrorMessage`/`mapFetchErrorCode` where those services already expose structured error codes.
- Preserved existing auth headers/credentials and service-level response contracts.

2. Timeout utility duplication still exists in feature services.
- Evidence:
- `src/components/apps/autodraft-studio/autodraftService.ts:276`
- `src/components/apps/transmittal-builder/transmittalService.ts:42`
- Risk: diverging cancellation semantics and duplicated maintenance.
- Upgrade: remove local wrappers and use shared utility.
- Status: completed (local wrappers removed).
- Fixes implemented:
- Deleted local timeout helpers from AutoDraft and Transmittal service modules.
- Both services now route all network calls through `src/lib/fetchWithTimeout.ts` with explicit `requestName` + timeout values.
- Validation:
- `rg "\bfetch\s*\("` across the five critical service files now returns no matches.
- `npx biome lint` on the five migrated files passed.
- `npm run typecheck` passed.
- `npm run check` passed after snapshot refresh (`npm run arch:generate`).

## P1 - ZeroClaw Completeness Gaps

1. Android bridge is still stubbed/simulated.
- Evidence:
- `zeroclaw-main/clients/android/app/src/main/java/ai/zeroclaw/android/bridge/ZeroClawBridge.kt:22`, `:36`, `:45`, `:55`, `:65`, `:74`
- `zeroclaw-main/clients/android-bridge/src/lib.rs:123`, `:130`, `:142`, `:176`, `:177`
- Risk: mobile integration appears present but does not execute real gateway flow end-to-end.
- Upgrade: wire JNI/UniFFI bridge to real gateway lifecycle and streaming responses.

2. Rust check currently blocked on missing MSVC linker in environment.
- Evidence: `cargo check --workspace` error indicates `link.exe` missing.
- Risk: cannot verify ZeroClaw compile health in current machine state.
- Upgrade: install Build Tools for Visual Studio (C++ toolchain) or use GNU toolchain target for CI checks.

## P2 - Performance and Scale

1. Frontend bundle still has large main and feature chunks.
- Evidence from build:
- main app chunk around `155 KB` after P2 split (`dist/assets/index-*.js`)
- framework vendor chunk around `254 KB` (`dist/assets/framework-*.js`)
- `GridPreview3D` chunk around `500 KB` (lazy-loaded)
- `exceljs` chunk around `936 KB` (lazy-loaded)
- `GroundGridGenerationRoutePage` around `154 KB`
- Impact: slower cold load and route transitions on weaker devices.
- Upgrade: continue route-level chunking/manual chunk strategy and reduce shared bundle weight.
- Status: partially completed (P2 chunking pass implemented on 2026-03-07).
- Fixes implemented:
- `src/App.tsx` now lazy-loads `AppDashboardPage` route instead of including it in the entry bundle.
- `vite.config.ts` now applies manual vendor chunking for `framework`, `supabase`, `date-fns`, `lucide`, `dnd-kit`, and YAML libs.
- Build impact observed:
- Entry chunk reduced from ~`626.84 KB` to ~`154.75 KB`.
- Route/feature chunks remain deferred (`GridPreview3D`, `exceljs`, `GroundGridGenerationRoutePage`).

2. Dashboard job polling interval is aggressive (`220ms`).
- Evidence: `src/components/apps/dashboard/dashboardOverviewService.ts:47`, `:177`
- Impact: higher backend request volume and noisy client CPU/network behavior.
- Upgrade: adaptive backoff polling (fast-start then slow), or websocket progress channel.
- Status: completed.
- Fixes implemented:
- Replaced fixed `220ms` interval with adaptive schedule in `dashboardOverviewService.ts`.
- New behavior is fast-start polling, then progressive backoff under long-running idle states, with faster polling near completion based on reported progress.

3. Websocket status bridge uses polling sleep loop per connection.
- Evidence: `backend/route_groups/api_websocket_status.py:86`, `:210`
- Impact: avoidable server CPU wakeups and extra status traffic.
- Upgrade: push-on-change or longer adaptive interval.
- Status: completed.
- Fixes implemented:
- Added status-signature dedupe so unchanged status frames are not emitted every iteration.
- Added keepalive status interval so clients still receive periodic status while idle.
- Added adaptive poll/backoff timing based on status/progress activity.
- Added regression coverage in `backend/tests/test_api_websocket_status.py` for dedupe + backoff behavior.

4. Named pipe server currently handles one connection instance at a time.
- Evidence: `dotnet/named-pipe-bridge/BatchFindAndReplace.cs:32`-`:37` with max server instances set to `1`
- Impact: serialized command throughput under heavier automation.
- Upgrade: multi-instance listener loop + bounded worker concurrency.
- Status: completed.
- Fixes implemented:
- Converted bridge listener to multi-instance accept loop in `dotnet/named-pipe-bridge/BatchFindAndReplace.cs`.
- Added bounded worker concurrency via `SemaphoreSlim`.
- Added env controls:
- `AUTOCAD_DOTNET_MAX_PIPE_INSTANCES` (default `4`, clamped `1..254`)
- `AUTOCAD_DOTNET_MAX_PIPE_WORKERS` (default `2`)
- Updated bridge docs in `dotnet/named-pipe-bridge/README.md` and `docs/backend/named-pipe-bridge.md`.

## P2 - Test Coverage Gaps

1. No frontend test files detected in `src` (`*.test.*` / `*.spec.*`).
- Risk: UI/service regressions rely heavily on manual QA.
- Upgrade: add Vitest unit coverage for service utilities and critical state hooks, plus Playwright happy-path smoke tests.
- Status: completed (baseline coverage introduced on 2026-03-07).
- Fixes implemented:
- Added Vitest infrastructure (`vitest.config.ts`, `src/test/setup.ts`).
- Added frontend unit tests:
- `src/lib/fetchWithTimeout.test.ts`
- `src/components/apps/dashboard/useDashboardLayout.test.tsx`
- Added Playwright smoke suite:
- `playwright.config.ts`
- `tests/e2e/app-smoke.spec.ts`
- Added test scripts in `package.json`:
- `test:unit`, `test:unit:watch`, `test:e2e`, `test:e2e:list`
- Validation:
- `npm run test:unit` passed (7 tests).
- `npm run test:e2e:list` passed (2 smoke tests discovered).
- Full `npm run test:e2e` execution currently requires browser binaries via `npx playwright install`.

2. Some backend route/helper modules appear to lack direct test references.
- Examples from static mapping:
- `backend/route_groups/api_batch_find_replace.py`
- `backend/route_groups/api_transmittal_render.py`
- `backend/route_groups/api_backup.py`
- `backend/route_groups/api_health.py`
- Upgrade: add focused failure-mode tests for each uncovered route family.
- Status: completed.
- Fixes implemented:
- Added focused route-family tests:
- `backend/tests/test_api_batch_find_replace.py`
- `backend/tests/test_api_transmittal_render.py`
- `backend/tests/test_api_backup.py`
- `backend/tests/test_api_health.py`
- These tests cover auth/validation/helper-unavailable/not-found style failures and route payload contracts.
- Validation:
- `python -m unittest backend.tests.test_api_batch_find_replace backend.tests.test_api_transmittal_render backend.tests.test_api_backup backend.tests.test_api_health` passed.

## Dependency and Tooling Upgrade Opportunities

1. JavaScript dependencies with notable available updates:
- `@supabase/supabase-js` `2.57.4 -> 2.98.0`
- `typescript` `5.6.3 -> 5.9.3`
- `@biomejs/biome` `2.4.4 -> 2.4.6`
- `postcss` `8.5.6 -> 8.5.8`
- Status: completed.
- Fixes implemented:
- Updated JS/tooling dependencies in `package.json` + `package-lock.json`:
- `@supabase/supabase-js` to `2.98.0`
- `typescript` to `5.9.3`
- `@biomejs/biome` to `2.4.6`
- `postcss` to `8.5.8`
- Added test tooling dependencies:
- `vitest`, `jsdom`, `@testing-library/react`, `@playwright/test`
- Validation:
- `npm run check` passed.

2. Python dependency management uses open ranges (`>=`) without lockfile pinning.
- Evidence: `backend/requirements-api.txt`, `backend/Transmittal-Builder/requirements.txt`
- Risk: non-reproducible installs and drift across machines/CI.
- Upgrade: introduce lockfile strategy (`pip-tools`, `uv`, or Poetry) for deterministic builds.
- Status: completed with `pip-tools` lock workflow.
- Fixes implemented:
- Added source input files:
- `backend/requirements-api.in`
- `backend/Transmittal-Builder/requirements.in`
- Added compiled lockfiles:
- `backend/requirements-api.lock.txt`
- `backend/Transmittal-Builder/requirements.lock.txt`
- Added root script:
- `npm run deps:python:lock`
- Updated install guidance and startup pathing:
- `backend/start_api_server.bat` now prefers `requirements-api.lock.txt` when present.
- `docs/backend/coordinates-grabber-api.md` now documents lockfile install and lock refresh command.
- Validation:
- Lockfiles successfully generated via `python -m piptools compile ...`.

## App-by-App Findings (Main Suite Frontend Apps)

1. `autodraft-studio`
- P1 reliability migration completed: now uses shared `fetchWithTimeout` and shared response error parsing.
- Add contract tests for `/api/autodraft/health|rules|plan|execute` normalization behavior.

2. `autowire`
- Contains large legacy artifacts and TODO-heavy implementation guide docs.
- Improve by splitting legacy/experimental code path from production route path.

3. `Batch_find_and_replace`
- Good: already migrated to shared timeout utility.
- Next: add optimistic UI and per-stage telemetry counters for preview/apply durations.

4. `block-library`
- No major static defects found.
- Next: add search indexing/caching for larger block sets.

5. `calendar`
- No major static defects found.
- Next: add query-level caching and virtualized list rendering for dense schedules.

6. `conduit-route`
- High complexity/size and significant catch/fetch surface.
- P1 reliability migration completed for `conduitRouteService` network calls; now uses shared timeout/error utility.
- Candidate for decomposition of monolithic workflow component.

7. `coordinatesgrabber`
- High catch density and retry/poll behavior.
- Add stronger typed error codes and staged telemetry for scan/execute flows.

8. `dashboard`
- Polling now uses adaptive backoff (fast-start + slowdown + near-complete acceleration).
- Add timeout utility to job start/status calls for consistent UX.

9. `drawing-list-manager`
- Placeholder format hints like `XXX` visible in UI strings.
- Validate project-number format constraints explicitly in UI and backend.

10. `dxfer`
- Raw fetch + custom error handling patterns still present.
- Migrate to shared timeout utility for status/run calls.

11. `excelformatter`
- No major static defects found.
- Next: move heavy parsing transforms off main thread if browser-based.

12. `file-manager`
- No major static defects found.
- Next: add pagination/virtualization for very large directories.

13. `graph`
- No major static defects found.
- Next: add memoized selectors and virtualization for larger graph datasets.

14. `ground-grid-generator`
- P1 reliability migration completed for `coordinatesGrabberService`; network calls now use shared timeout/error utility.
- 3D and Excel lazy split is in place, but route chunk remains sizable.
- Continue timeout-value tuning and route-level further chunking.

15. `projects`
- High catch density in state manager.
- Add stronger error typing and optimistic rollback rules.

16. `standards-checker`
- No major static defects found.
- Next: add background worker for heavy file checks.

17. `storage`
- No major static defects found.
- Next: add retry + backoff and explicit progress for large restores.

18. `transmittal-builder`
- P1 reliability migration completed: removed local timeout wrapper and migrated requests to shared utility.
- Add result caching for repeated template/profile fetches.

19. `ui`
- No major static defects found.
- Next: add visual regression snapshots for primitives.

20. `watchdog`
- No major static defects found.
- Next: add backpressure controls for high event volume.

21. `whiteboard`
- No major static defects found.
- Next: consider worker/offscreen rendering for complex canvases.

## Backend Route-Group Focus Areas

1. AutoCAD family (`api_autocad.py`, `api_autocad_manager.py`, `api_autocad_terminal_scan.py`, `api_autocad_terminal_route_plot.py`)
- Status: completed for phase-2 route/manager normalization on 2026-03-07.
- Fixes implemented:
- Normalized early-return/validation failures in `backend/route_groups/api_autocad.py` to shared `_error_response(...)` envelope across terminal scan, route compute/draw, label sync (legacy + bridge), obstacle scan, ETAP cleanup, and ws-ticket failure paths.
- Standardized error payload contract for these paths with explicit `success`, `code`, `message`, and `requestId`, plus stage/provider metadata for correlation.
- Added typed AutoCAD failure classes in `backend/route_groups/api_autocad_failures.py` and applied them in `backend/route_groups/api_autocad_manager.py` (`execute_layer_search`, `plot_ground_grid`, `plot_terminal_routes`, `sync_terminal_labels`) to reduce broad untyped failure handling in core manager flows.
- Introduced typed route validation failures in `backend/route_groups/api_autocad_terminal_route_plot.py` (`TerminalRouteValidationError`) and narrowed several broad conversion/property catches to explicit parse/attribute failure types.
- Validation:
- `python -m unittest backend.tests.test_api_autocad_dotnet_provider backend.tests.test_api_route_groups backend.tests.test_api_autocad_manager backend.tests.test_api_autocad_terminal_route_plot backend.tests.test_api_autocad_terminal_scan` passed.

2. Websocket status bridge
- Status: completed for correlation logging enhancement.
- Fixes implemented:
- Added request correlation derivation (`requestId`) and per-connection correlation id generation in `backend/route_groups/api_websocket_status.py`.
- Updated websocket auth-failure, connect, and disconnect/error logs to include `request_id` and `connection_id`.
- Existing status dedupe + adaptive polling behavior remains unchanged.
- Validation:
- `python -m unittest backend.tests.test_api_websocket_status` passed.

3. Runtime hardening
- Status: completed.
- Fixes implemented:
- Shared limiter storage resolver already enforced via `API_LIMITER_STORAGE_URI`/`REDIS_URL` with production fail-fast in `backend/route_groups/api_http_hardening.py`.
- Production process model remains explicit with guarded local dev-server entry in `backend/route_groups/api_server_entrypoint.py` and `backend/api_server.py`.
- Added explicit test for the `API_REQUIRE_SHARED_LIMITER_STORAGE=true` guard in `backend/tests/test_api_http_hardening.py`.

## Dotnet Bridge Focus Areas

1. `named-pipe-bridge` currently has a very large single-file implementation (`BatchFindAndReplace.cs`).
- Status: completed with action-level extraction and handler split.
- Fixes implemented:
- Added isolated action entry classes:
- `dotnet/named-pipe-bridge/TerminalScanAction.cs`
- `dotnet/named-pipe-bridge/ObstacleScanAction.cs`
- `dotnet/named-pipe-bridge/TerminalRouteDrawAction.cs`
- `dotnet/named-pipe-bridge/TerminalLabelSyncAction.cs`
- `dotnet/named-pipe-bridge/EtapCleanupAction.cs`
- `PipeRouter` now dispatches to these isolated action classes instead of directly switching into monolithic handler methods.
- Extracted the five large action implementations from `BatchFindAndReplace.cs` into dedicated partial handler files:
- `dotnet/named-pipe-bridge/ConduitRouteTerminalScanHandler.cs`
- `dotnet/named-pipe-bridge/ConduitRouteObstacleScanHandler.cs`
- `dotnet/named-pipe-bridge/ConduitRouteTerminalRouteDrawHandler.cs`
- `dotnet/named-pipe-bridge/ConduitRouteTerminalLabelSyncHandler.cs`
- `dotnet/named-pipe-bridge/ConduitRouteEtapCleanupHandler.cs`

2. Single-instance pipe loop can bottleneck automation throughput.
- Completed baseline fix: multi-instance listeners + bounded worker concurrency with env tuning.

3. Add perf telemetry:
- request queue time
- COM call retry counts
- scan entity counts and timings per action
- Status: completed.
- Fixes implemented:
- Added per-request queue timing in named-pipe worker path (`queueWaitMs`) measured between task queue and worker acquisition.
- Added request telemetry context and COM retry counter instrumentation (`comReadRetryCount`) via `BridgeRequestTelemetry` and `ReadWithTransientComRetry(...)` hooks.
- Added action-level timing (`actionMs`) plus queue/retry telemetry attachment into every action response meta from `PipeRouter`.
- Existing per-action scan metrics remain in action results (for example `scanMs`, `scannedEntities`, `scannedBlockReferences`, `scannedGeometryEntities`) and now ship alongside the new shared telemetry fields.
- Validation:
- `dotnet build dotnet/named-pipe-bridge/NamedPipeServer.csproj -c Release` passed.

## ZeroClaw Focus Areas

1. Complete Android bridge from stubs to real runtime integration.
2. Address panic-risk patterns over time (`unwrap`/`expect` usage is high).
3. Break up oversized modules to reduce review/merge risk:
- `zeroclaw-main/src/config/schema.rs`
- `zeroclaw-main/src/channels/mod.rs`

## Suggested Upgrade Roadmap

1. Phase A (Reliability first)
- Complete AutoCAD error-envelope/requestId consistency for all endpoints.
- Migrate all remaining raw fetch services to `fetchWithTimeout`.
- Replace limiter storage backend.

2. Phase B (Performance and scale)
- Complete websocket event-driven status channel (polling optimization baseline is done).
- Additional chunking and route-level perf passes for conduit/ground-grid.
- Dotnet bridge telemetry improvements and concurrency tuning validation under real CAD load.

3. Phase C (Quality and delivery speed)
- Add frontend tests (Vitest + Playwright smoke).
- Expand backend route-family negative/failure tests.
- Add CI gates for dependency drift and performance budgets.

## Feature Ideas (New)

1. AutoDraft
- Rule simulator panel: paste markup payload and preview exact action classification + confidence breakdown.
- Conflict explainer: explicit reason codes when color/text intent conflicts.
- Plan diff viewer: compare two plan runs and show changed actions.

2. Conduit Route
- "Route rationale" overlay showing why each path segment was chosen.
- Batch routing mode for multiple start/end pairs with grouped draw apply.
- Route quality score (length, clearance, crossings, obstacle penalty).

3. Ground Grid
- Scenario compare mode (A/B grid layouts with material counts and cost deltas).
- Export profile presets (client/company templates).
- Constraint checker for spacing/clearance standards before draw.

4. DXF/ETAP
- Preflight diagnostics with actionable fixes before cleanup execution.
- Cleanup dry-run artifact report with expected command sequence.

5. Watchdog/Storage
- Unified operations timeline across file events, backups, and restores.
- Smart anomaly detection for unusually large or risky file changes.

6. ZeroClaw integration
- In-app pairing diagnostics page with token/session health detail.
- End-to-end command replay tool for reproducible bug reports.
- Provider fallback policy editor with runtime observability.

## Notes

- No auth-flow changes were made.
- No runtime behavior changes were made in this audit task.
- This document is static-analysis + local-check evidence; production telemetry should be added for runtime confirmation of top perf risks.
