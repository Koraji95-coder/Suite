# Suite Work Summary + TODO

Date: March 18, 2026  
Branch: `main`

This is a restart/handoff doc summarizing what has already been completed and what to do next.

## March 18, 2026 Checkpoint

### What Landed In This Tranche

- Unified dark-theme reset is live across the main app.
- Theme picker and AI Config settings surface were removed; Settings is now account-focused.
- Dashboard is now the primary command-center surface for Watchdog, architecture, agent memory, and project telemetry.
- Watchdog is now backed by durable ledger storage under `backend/watchdog/` instead of only in-memory heartbeat state.
- Filesystem collector is live with workstation-aware startup/install/check scripts.
- AutoCAD collector is live with:
  - tracker plugin project under `dotnet/watchdog-cad-tracker/`
  - plugin install/check scripts
  - readiness doctor
  - live `tracker-state.json` export ingestion
- Versioned workstation profile sync is live:
  - `tools/suite-repo-mcp/workstation-profiles.json`
  - `scripts/sync-suite-workstation-profile.ps1`
  - `scripts/restore-suite-local-state.ps1` now reapplies workstation-specific MCP env after mirror restore
- Command Center no longer carries the old Watchdog UI path.
- Legacy widget-era dashboard files that were no longer referenced were removed.
- Project detail now surfaces Watchdog telemetry summaries and dashboard deep links.
- Stage 1 ops-surface cleanup landed:
  - dashboard sections/selectors/formatters
  - command-center model/history/tab sections
  - project-manager UI-state/selectors seam
  - account-settings sections/hooks/shared primitives
- First-pass frontend hotspot splits landed for:
  - `LoginPage`
  - `AgentChatPanel`
  - `AutoDraftComparePanel`
  - `ConduitRouteApp`
  - `ConduitTerminalWorkflow`
- Work Ledger is now a first-class product surface:
  - `/app/changelog`
  - workstation-local Worktale publisher
  - publish-job receipts
  - dashboard Ops Summary bridge for readiness, milestones, blockers, and hotspot-linked entries
- `agentService` now routes through split capability modules under `src/services/agent/`.
- Request transport and orchestration internals were split into smaller transport/event/run helpers.
- Graph Explorer and Architecture Map now use the same command-surface shell language as the main dashboard.
- Coordinates Grabber primary tabs and key Ground Grid preview/data panels moved further away from legacy inline-style presentation patterns.

### Current Baseline

- `npm run check`
- `npm run test:unit`
- `python -m unittest backend.tests.test_api_watchdog_service backend.tests.test_api_route_groups backend.tests.test_watchdog_filesystem_collector backend.tests.test_watchdog_autocad_state_collector backend.tests.test_suite_repo_mcp_server`
- `dotnet test dotnet/autodraft-api-contract.Tests/AutoDraft.ApiContract.Tests.csproj -v minimal`
- `npm run watchdog:autocad:doctor`

### MCP / Workstation Settings TODO

Current local MCP server config is in `%USERPROFILE%\.codex\config.toml` under `mcp_servers.suite_repo_mcp.env`.

Current live workstation assumptions:

- workstation id: `DUSTINWARD`
- workstation label: `Dustin workstation`
- workstation role: `active`
- current explicit MCP env includes workstation identity plus filesystem collector, AutoCAD collector, plugin, readiness, and backend startup metadata
- `tools/suite-repo-mcp/workstation-profiles.json` is the versioned workstation profile source-of-truth
- `scripts/sync-suite-workstation-profile.ps1` is the only supported path to stamp `mcp_servers.suite_repo_mcp.env`
- `scripts/restore-suite-local-state.ps1` now reuses the shared workstation profile sync helper
- local watchdog startup/install state on `DUSTINWARD` is expected to use HKCU `Run` fallback when scheduled-task registration is denied
- AutoCAD readiness can still report `awaiting_autocad` until `tracker-state.json` is emitted on this workstation

MCP workstation prep closeout status:

1. Combined workstation doctor is available in MCP.
   - `repo.check_suite_workstation` reports backend, filesystem collector, AutoCAD collector, AutoCAD plugin, and AutoCAD readiness in one normalized payload.

2. Deterministic workstation naming rules are documented in `docs/development/mcp-workstation-matrix.md`.

3. Restart-required note is unchanged.
   - Any change to `config.toml` still requires restarting the developer window/Codex session.

4. The combined doctor reports MCP env stamping drift and startup/readiness issues with recommended actions.

5. Decide whether Dropbox mirror state should be represented in MCP config or stay outside MCP.
   - Current recommendation: keep Dropbox sync operational state outside MCP and keep MCP limited to local tooling and diagnostics.

### Next Workstation Transition Checklist

For the next session on `DUSTIN-HOME`:

1. Pull latest `main`.
2. Run:
   - `PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/restore-suite-local-state.ps1 -WorkstationId DUSTIN-HOME`
3. Restart Codex so the workstation-specific MCP env reloads.
4. If only the MCP workstation block needs to be rewritten, skip the full restore and run:
   - `npm run workstation:sync -- -WorkstationId DUSTIN-HOME`
5. If you are switching machines, mirror local-only state before leaving the current box:
   - `npm run workstation:mirror`
6. The destination box can use the new npm alias instead of the raw PowerShell path:
   - `npm run workstation:restore -- -WorkstationId DUSTIN-HOME`
7. Bootstrap Worktale on each workstation where changelog publishing matters:
   - `npm install -g worktale`
   - `npm run worktale:bootstrap`
   - `npm run worktale:doctor`
8. Verify startup/doctor status before doing app work:
   - `npm run watchdog:startup:check`
   - `npm run watchdog:startup:autocad:check`
   - `npm run watchdog:backend:startup:check`
   - `npm run watchdog:autocad:doctor`

## 1) What Is Already Done

### Repo hygiene and safety

- Removed tracked build artifacts and cache files (Python `__pycache__`, .NET `bin/` + `obj/`, `.pyc` outputs).
- Expanded ignore coverage and documented repo cleanup workflow.
- Added and validated repo hygiene playbook:
  - `docs/development/repo-hygiene-playbook.md`

### Auth migration to passwordless

- Password-based UX paths were removed from active app routes (login/signup are passwordless email-link flows).
- Canonical auth logic is centralized under `src/auth/*`.
- Added backend email-link endpoint with anti-abuse controls:
  - `POST /api/auth/email-link`
- Added redirect allowlist checks on frontend/backend to reduce open-redirect risk.

### Passkey rollout groundwork

- Added passkey capability and start/callback wiring (rollout-gated):
  - `GET /api/auth/passkey-capability`
  - `POST /api/auth/passkey/sign-in`
  - `POST /api/auth/passkey/enroll`
  - `POST /api/auth/passkey/callback/complete`
- Added external-provider redirect mode and signed callback verification controls.
- Added ZeroClaw bridge contract docs and gateway bridge endpoint support.

### Agent pairing security model

- Moved pairing/unpairing to email-verified challenge/confirm flow:
  - `POST /api/agent/pairing-challenge`
  - `POST /api/agent/pairing-confirm`
- Disabled legacy direct pair/unpair actions in broker mode (`428` requirement response).
- Added session cleanup endpoint:
  - `POST /api/agent/session/clear`
- Added pairing abuse controls (TTL, max entries, per-user throttles, confirm-failure blocking, retry-after metadata).

### Security telemetry + docs

- Added auth-method telemetry taxonomy (`security:auth_method:*`) and passkey event namespace.
- Documented security/auth status and rollout plan:
  - `docs/security/auth-landing-conversation-README.md`
  - `docs/security/auth-readiness-checklist.md`
  - `docs/security/auth-telemetry.md`
  - `docs/security/passkey-rollout-plan.md`
  - `docs/security/environment-and-secrets.md`
  - `docs/development/public-rollout-readiness.md`

### UI architecture hardening / modularization (major progress)

Large UI hotspots were split into smaller components/hooks/models for maintainability and safer layering.

Major areas already modularized:

- Block Library
- Standards Checker
- Drawing List Manager
- Coordinates Grabber
- Ground Grid Generator
- Projects (manager/detail views)
- Storage apps (backup/database/file browser)
- Dashboard widgets
- File Manager dashboard
- Calendar (toolbar/month/week/event dialog)
- Transmittal Builder sections

Recent milestone commits:

- `5e982a9` modularize core app panels for scalability
- `d50050a` modularize non-auth app panels (storage/dashboard/file-manager/calendar/transmittal)
- `5ab4ff5` split remaining non-auth hotspots into modular components

## 2) Current Auth Status Snapshot

- Current active auth: passwordless email-link.
- Passkey path is implemented but rollout-gated (not fully promoted to primary by default).
- Agent pairing challenge-confirm model is in place with abuse protections.
- Security telemetry is in place and emitting.

## 3) Prioritized TODO (Next Work)

## P0 - Finish auth to "production-complete"

1. Finalize passkey provider decision and enforce one primary path.
   - Choose Supabase-native passkey path (if available in project tier + SDK surface) or external-provider path.
   - Keep email-link as explicit fallback/recovery.

2. Complete passkey account-management UX.
   - Add credential list/revoke/rename UX in settings.
   - Ensure recovery messaging is clear when no passkey is available.

3. Complete production auth hardening sweep.
   - Validate all `AUTH_PASSKEY_*`, `AUTH_EMAIL_*`, redirect allowlists, and Turnstile settings in target envs.
   - Confirm callback signing requirements are enabled if using external provider.

4. Execute full auth/pairing test matrix and record outcomes.
   - Email-link signup/signin success + failure paths.
   - Passkey enroll/signin success + failure paths.
   - Pair/unpair challenge expiry, retry throttles, invalid confirm behavior.

## P1 - Continue service/state decomposition

The next refactor work should stay focused on the largest remaining responsibility collisions, in this order:

1. `src/services/agentService.ts`
   - Keep `agentService` as the public facade, but continue moving internals into capability modules for pairing/catalog, transport plumbing, orchestration runs, run-event streaming, and task/review/activity APIs.
2. `src/components/apps/ground-grid-generator/useGridGeneratorState.ts`
   - Keep shrinking the root hook until it only coordinates shared cross-panel state; placement, persistence, import/export, and editing history belong in dedicated controllers.
3. `src/components/apps/coordinatesgrabber/useCoordinatesGrabberState.ts`
   - Keep moving validation, execution history, backend status, and websocket lifecycle concerns out of the main state hook.
4. `src/components/apps/conduit-route/ConduitRouteApp.tsx` and `src/components/apps/conduit-route/ConduitTerminalWorkflow.tsx`
   - Continue pulling CAD preflight/backcheck/sync, obstacle editing, route-canvas interaction, crew review, and terminal workflow logic out of the route shells.
5. `src/components/apps/autodraft-studio/AutoDraftComparePanel.tsx` and `src/components/apps/autodraft-studio/autodraftService.ts`
   - Continue extracting compare preparation/execution, review queue state, viewport/canvas interaction, and learning/export adapters until the studio shell is orchestration-only.
6. Secondary oversized models/hooks
   - `src/components/apps/transmittal-builder/transmittalBuilderModels.ts`
   - remaining project manager state shells
   - any route/service file that architecture hotspots continue to flag after the above splits land

New canonical changelog/history work now lives in the Suite work ledger:

- Route: `/app/changelog`
- Dashboard module: Work Ledger
- Publish path: Suite stays canonical; Worktale-style payloads are generated outbound from ledger entries

UI-overhaul audit for the current command-center tranche:

- `docs/development/ui-overhaul-audit-2026-03-18.md`
- Shared-route overhaul is effectively complete for dashboard, changelog, projects, graph, architecture, and agent shells.
- Remaining visual debt is concentrated in Ground Grid manual-editor surfaces and a few app-local overlays/tool panes.

Frontend refactor target remains the same: thin route/app shells, feature-scoped controller hooks, pure selectors/formatters, and focused presentational sections.

## P1 - Agent output normalization

1. Normalize direct-model chat responses before rendering in the panel.
   - Detect tool-call/XML-like payloads (for example `<tool_call ...>` wrappers) and convert to user-facing assistant text.
   - Keep raw payload available for diagnostics, but default chat view should show normalized natural-language output.

## P1 - Agent routing contract cleanup

1. Keep strict one-model-per-profile execution behavior across direct, broker, and orchestration flows.
2. Maintain `model_fallbacks` / `fallback_models` compatibility fields as empty arrays in this phase.
3. Schedule an explicit breaking-contract pass to remove fallback fields after downstream consumers are migrated.

## P1 - Shared channel identity + transcript cleanup

1. Keep shared channel label as `Shared Channel` across all agent UI entry points.
2. Ensure shared-channel messages show real participating agent identities/models (Koro, Devstral, Sentinel, Forge).
3. Fix profile visual mapping so agent color/identity matches actual profile intent (for example Devstral should map to the green profile mark consistently).
4. In shared-channel orchestration, stream per-agent "thinking/progress/output" events into one transcript tagged by agent, instead of showing a single pseudo-agent voice.

## P1 - Transmittal Builder protected name selection

Goal: safely select template-defined names/values from `config.yaml` without brittle hardcoding.

1. Move selectable names into a typed allowlist source (schema-backed).
2. Expose dropdown/selector UI from that allowlist instead of free-form defaults.
3. Add strict validation + sanitization when writing selected values into transmittal payload.
4. Keep optional manual override behind explicit validation path.
5. Add tests for invalid/unexpected name injection and template mismatch handling.

## P2 - Operational visibility

1. Add dashboards/alerts for auth and pairing abuse metrics.
2. Add threshold alerts for passkey failure spikes and pairing-confirm failure bursts.
3. Document runbook for lockout recovery and incident response.

## 4) Suggested Next Session Order

1. On `DUSTIN-HOME`, pull latest `main`, run `scripts/restore-suite-local-state.ps1 -WorkstationId DUSTIN-HOME`, and restart Codex.
2. Finish Ground Grid manual-editor presentation cleanup so the last major visual outlier matches the command-surface system.
3. Split `src/services/workLedgerService.ts` into transport, realtime, and local-fallback layers.
4. Continue deeper AutoDraft and Conduit controller/service extraction.
5. Start backend hotspot splitting with `backend/coordinatesgrabber.py`, then reassess the next highest-pressure backend module.

## 5) Fast Resume Commands

```bash
git status --short
npm run lint
npm run build
```

Optional hotspot scan:

```bash
find src -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 wc -l | sort -nr | head -n 25
```

