# Suite Work Summary + TODO

Date: March 18, 2026  
Branch: `main`

This is a restart/handoff doc summarizing what has already been completed and what to do next.

## March 31, 2026 ACADE Stabilization Checkpoint

### April 1, 2026 Clean Test Root

- Use this as the clean local Suite/ACADE test root on this workstation:
  - `C:\Users\koraj\Documents\Acade 2026\AeData\Proj\<TestProjectName>`
- Current recommended throwaway project path for live smoke tests:
  - `C:\Users\koraj\Documents\Acade 2026\AeData\Proj\suite1\suite1.wdp`
- Avoid `G:` and other network-backed paths while the project switch path is still being stabilized.
- Avoid using Autodesk demo projects such as `WDDEMO`, `IECDEMO`, or `EXTRA LIBRARY DEMO` as the target project-under-test:
  - ACADE is still exposing those active projects primarily as `%APPDATA%\...\Support\user\*.mdb`
  - Suite now closes them successfully, but they are still a noisy baseline for open/switch validation
  - the cleanest smoke path is a local Suite-created test project under `Documents\Acade 2026\AeData\Proj`

### April 1, 2026 Switch-Path Follow-Up

- ACADE active-project discovery is now `.wdp`-first instead of `.mdb`-first:
  - `GetActiveProjectFileName` / project-file accessors are preferred
  - `.mdb` remains captured as secondary diagnostic state
- Suite now uses an explicit switch-if-clean pipeline when another ACADE project is active:
  - evaluate switch eligibility
  - close current project first
  - then open the requested target `.wdp`
- Fast blocked failures now short-circuit project switching when:
  - `CMDNAMES` is not idle
  - `DBMOD` is non-zero
  - another Suite create/open operation is still marked active
  - a temporary scratch drawing is still pending cleanup
- Request traces now record:
  - active project `.wdp`
  - active project `.mdb`
  - switch blocked reason
  - close-stage and open-stage warning details
- `SUITEACADEDEBUGSTATUS` now prints:
  - active `.wdp`
  - active `.mdb`
  - `DBMOD`
  - switch eligibility / blocked reason
- Focused helper tests now live in `dotnet/suite-cad-authoring.Tests/` and cover:
  - `.wdp` preferred over `.mdb`
  - `.wdp`/`.mdb` same-project comparison
  - switch-eligibility blocking rules

### April 1, 2026 Close-Path Follow-Up

- When ACADE only exposes the active project as `%APPDATA%\\...\\Support\\user\\*.mdb`, Suite now tries to reconstruct the real project definition path from known ACADE project roots:
  - `%USERPROFILE%\\Documents\\Acade 2026\\AeData\\Proj`
  - `%PUBLIC%\\Documents\\Autodesk\\Acade 2026\\AeData\\Proj`
- The reconstruction is display-name aware and cached, so demo projects such as `IECDEMO` and `EXTRA LIBRARY DEMO` can resolve back to their `.wdp` definitions instead of staying `.mdb`-only.
- Close-current-project strategies now try the best available identifiers in this order:
  - derived / discovered `.wdp`
  - project display name
  - internal `.mdb`
- The latest live blocker is no longer pipe access or startup readiness:
  - ACADE session is healthy
  - `wd_load` is ready
  - Suite can now close the current active demo project
  - the remaining failure is the open-stage handoff after close when ACADE still reports the old active project as `%APPDATA%\...\Support\user\*.mdb`
  - root scanning now includes Autodesk default local project roots:
    - `%USERPROFILE%\Documents\Acade 2026\AeData\Proj`
    - `%USERPROFILE%\Documents\AcadE 2026\AeData\proj`
    - `%USERPROFILE%\My Documents\AcadE 2026\AeData\proj`
    - `%PUBLIC%\Documents\Autodesk\Acade 2026\AeData\Proj`

### What Landed In This Tranche

- Watchdog is now intentionally isolated from `<<ACADE>>` sessions at runtime:
  - no ACADE autostart
  - no ACADE startup banner
  - `STARTTRACKER` reports isolation in ACADE
  - `TRACKERSTATUS` reports suppression in ACADE
- Plain AutoCAD Watchdog behavior is unchanged.
- The Suite ACADE authoring bundle no longer queues `fboundp` warm-up expressions into the AutoCAD command line.
- ACADE project open/create now waits for a quieter readiness window before attempting project work.
- `wd_load` is the primary readiness signal for the Electrical runtime; if it never becomes available, Suite returns a structured not-ready failure instead of spamming the command line.
- The in-process ACADE pipe host no longer runs the entire open/create workflow on AutoCAD's UI thread; long readiness and verification waits now stay on the background pipe thread and only short AutoCAD API operations are marshaled onto the application thread.
- Direct `SendStringToExecute(...)` project fallbacks remain available, but only after in-process readiness checks pass, and they are no longer the main create/open path.
- Request-scoped diagnostics are now wired for ACADE create/open:
  - backend bridge logs include `requestId`, action timing, and plugin `tracePath`
  - the authoring bundle writes JSONL traces under `%LOCALAPPDATA%\Suite\logs\acade\YYYY-MM-DD\<requestId>.jsonl`
  - `SUITEACADEDEBUGSTATUS` prints current profile, active document, command state, `wd_load` readiness, active project path, and trace root

### Why This Was Necessary

- The repeated `; error: no function definition: FBOUNDP` failures were coming from Suite's old ACADE warm-up/open fallback path, not from the Watchdog tracker.
- AutoCAD Electrical can appear visually ready while its Electrical Lisp/ARX runtime is still initializing.
- The 120-second browser timeout / “blank grinding” ACADE window was caused by UI-thread sleep loops inside the old pipe-host execution model.
- Isolating Watchdog in ACADE removes one timing variable and gives a cleaner baseline while the authoring path is stabilized.

### What Still Needs Live Validation

- Fresh ACADE launch:
  - no Watchdog banner in ACADE
  - `TRACKERSTATUS` reports isolation
  - `SUITEPIPESTATUS` reports the in-process ACADE pipe host
- Suite-driven `Create and Open in ACADE`:
  - no command-line `FBOUNDP` spam
  - target project appears in Project Manager
  - temporary scratch drawing closes when safe
- New observability path:
  - reproduce one failing request
  - capture the frontend `requestId`
  - run `SUITEACADEDEBUGSTATUS`
  - inspect the request trace under `%LOCALAPPDATA%\Suite\logs\acade\...`
- Plain AutoCAD:
  - Watchdog still auto-starts and tracks normally outside `<<ACADE>>`

## Later Track

- Monetization/productization backlog is parked here for later:
  - `docs/development/monetization-readiness-backlog.md`
- After the current runtime/title-block overhaul is stable, revisit the local-learning plan with Dustin:
  - review `docs/backend/local-learning-opportunities.md`
  - choose the first pilot, likely `transmittal_titleblock` confidence scoring

## March 25, 2026 Structural Reboot Checkpoint

### What Landed In This Tranche

- Suite now follows a two-room structure:
  - customer product
  - developer workshop
- `Internal` was retired from the live app model; active audience shape is now `customer | dev`.
- `/app/developer` is the web-side Developer Portal, and `/app/operations` is only a compatibility redirect.
- Apps Hub is now product-only for all users; developer-only and future-product tools live in Developer Portal and Runtime Control instead of customer navigation.
- Command Center is now a dev-only diagnostics toolshed, not a second workstation-control surface.
- Runtime Control is now the primary local workshop front door for:
  - runtime start/stop/restart
  - Watchdog/plugin/collector operations
  - doctor/diagnostics entrypoints
  - support summary/export
  - launching dev-only web routes
- Shared Suite Doctor/runtime/support parity landed across:
  - backend `/api/runtime/status`
  - frontend shell/Developer Portal/Command Center
  - PowerShell runtime scripts
  - Runtime Control desktop shell
- Support bundle export now writes structured runtime + doctor + workstation context instead of rebuilding that picture ad hoc.
- Customer routes were rebuilt around the product story:
  - Dashboard is now a delivery mission board
  - Projects now anchor the delivery workflow
  - Watchdog now reads as a manager/operator reporting surface
  - Drawing List Manager, Standards Checker, and Transmittal Builder now open in project/package context and read as one workflow instead of separate utilities
- The project delivery flow now has an explicit path:
  - Setup
  - Readiness
  - Review
  - Issue Sets
  - Revisions
  - Files & Telemetry
- Title-block review is now a first-class lane inside the project delivery workflow rather than a separate app story.
- Standards Checker now has a dedicated frontend feature owner and a canonical Autodesk-vs-Suite flow note instead of living only as a component-local app with implicit behavior.
- Review decisions are now issue-set aware, and issue-set evidence now rolls up:
  - title block review
  - standards state
  - issue set snapshot
  - transmittal receipt
  - Watchdog attribution
- The Suite-native gateway is now the active and canonical gateway path.
- `zeroclaw-main/` was isolated, then removed from active Suite architecture and runtime flow.
- ZeroClaw references that remain are intentional historical/policy references only.
- Structural guards now protect the reboot boundaries:
  - no Tailwind in Suite app
  - workshop split guard
  - ZeroClaw isolation/removed guards
  - docs manifest and architecture guards

### Current Structural Baseline

- `npm run check`
- `npx vitest run --pool=threads`
- `python -m unittest backend.tests.test_api_health backend.tests.test_api_command_center backend.tests.test_api_route_groups backend.tests.test_suite_repo_mcp_server`
- `dotnet test dotnet/Suite.RuntimeControl.Tests/Suite.RuntimeControl.Tests.csproj --no-build`
- `npx playwright test tests/e2e/authenticated-shell.spec.ts --project chromium`

### What Is Intentionally Left For Later

- Monetization, org/admin/seats/licensing, and wider rollout/productization remain parked in:
  - `docs/development/monetization-readiness-backlog.md`
- Any future graduation of dev-only tools like AutoDraft, AutoWire, Ground Grid, Batch Find & Replace, ETAP DXF Cleanup, Whiteboard, and Agents should happen only after they are explicitly promoted out of the workshop.
- The next major structural milestone beyond this checkpoint would be a full gateway/runtime archival phase for ZeroClaw-era historical material, not an active Suite product dependency.

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
- Windows runtime control now includes:
  - HTML desktop shell under `dotnet/Suite.RuntimeControl/`
  - blue/gold operator-console UI
  - visible Windows sign-in startup with HKCU `Run` fallback when scheduled tasks are denied
  - local frontend (`5173`) as a first-class managed runtime service with shared log streaming
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

- workstation id: `DUSTIN-WORK`
- workstation label: `Dustin Work station`
- workstation role: `work`
- current explicit MCP env includes workstation identity plus filesystem collector, AutoCAD collector, plugin, readiness, and backend startup metadata
- `tools/suite-repo-mcp/workstation-profiles.json` is the versioned workstation profile source-of-truth
- `scripts/sync-suite-workstation-profile.ps1` is the only supported path to stamp `mcp_servers.suite_repo_mcp.env`
- `scripts/restore-suite-local-state.ps1` now reuses the shared workstation profile sync helper
- local watchdog startup/install state on `DUSTIN-WORK` is expected to use HKCU `Run` fallback when scheduled-task registration is denied
- AutoCAD readiness can still report `awaiting_autocad` until `tracker-state.json` is emitted on this workstation

MCP workstation prep closeout status:

1. Combined workstation doctor is available in MCP.
   - `repo.check_suite_workstation` reports backend, filesystem collector, AutoCAD collector, AutoCAD plugin, and AutoCAD readiness in one normalized payload.

2. Deterministic workstation naming rules are documented in `docs/runtime-control/mcp-workstation-matrix.md`.

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
   - restore now auto-bootstraps local Supabase, Watchdog startup, backend, and gateway unless `-SkipBootstrap` is passed
3. Restart Codex so the workstation-specific MCP env reloads.
4. If only the MCP workstation block needs to be rewritten, skip the full restore and run:
   - `npm run workstation:sync -- -WorkstationId DUSTIN-HOME`
5. If you are switching machines, mirror local-only state before leaving the current box:
   - `npm run workstation:mirror`
6. The destination box can use the new npm alias instead of the raw PowerShell path:
   - `npm run workstation:restore -- -WorkstationId DUSTIN-HOME`
7. Bootstrap Worktale on each workstation as part of the local-ready baseline:
   - `npm install -g worktale`
   - `npm run worktale:bootstrap`
   - `npm run worktale:doctor`
8. Verify startup/doctor status before doing app work:
   - `npm run watchdog:startup:check`
   - `npm run watchdog:startup:autocad:check`
   - `npm run watchdog:backend:startup:check`
   - `npm run gateway:startup:check`
   - `npm run frontend:startup:check`
   - `npm run watchdog:autocad:doctor`
9. For a full workstation replay guide, use:
   - `docs/runtime-control/workstation-transfer-runbook.md`
10. Keep workstation ids unique per box:
   - home machine stays `DUSTIN-HOME`
   - work machine should use `DUSTIN-WORK`
   - never restore or sync the work machine as `DUSTIN-HOME`

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
   - `src/features/transmittal-builder/models.ts`
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

## P3 - Deferred Zeroclaw cherry-picks

Only touch these when there is no higher-priority Suite product or reliability work open.

1. Manual-port upstream `632d513` so direct-model chat output preserves user-facing assistant text when tool/native-call payloads are present.
2. Review upstream `fc2aac7` for gateway websocket session persistence and restart-resume behavior.
3. Review upstream `b6c2930` for autonomy/approval enforcement correctness across gateway and channel execution paths.
4. Review upstream `9cc74a2` for shell-tool sandbox wiring and related tool-execution hardening.
5. Review upstream `3c117d2` for configurable sub-agent/delegate timeout handling.
6. Do not port upstream runtime model switching or pairing-flow changes without an explicit product decision:
   - skip `58b98c5` because it conflicts with deterministic profile-model routing
   - skip `4455b24`-style pairing/auth changes unless separately approved

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

