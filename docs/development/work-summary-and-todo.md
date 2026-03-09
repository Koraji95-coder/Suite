# Suite Work Summary + TODO

Date: March 2, 2026  
Branch: `main`

This is a restart/handoff doc summarizing what has already been completed and what to do next.

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

## P1 - Finish remaining UI scalability hotspots

These files are still larger than ideal and should be split next:

- `src/components/apps/projects/useProjectManagerState.ts` (~1093 lines)
- `src/services/agentService.ts` (~1027 lines)
- `src/supabase/database.ts` (~845 lines)
- `src/components/apps/ground-grid-generator/useGridGeneratorState.ts` (~610 lines)
- `src/components/apps/transmittal-builder/transmittalBuilderModels.ts` (~593 lines)
- `src/routes/LoginPage.tsx` (~507 lines)
- `src/routes/settings/AccountSettings.tsx` (~499 lines)
- `src/components/apps/coordinatesgrabber/useCoordinatesGrabberState.ts` (~491 lines)

Refactor target for each: separate pure models/types, API/service wrappers, and UI state hooks to reduce collision risk when adding future panels.

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

1. Finish passkey provider decision + env wiring.
2. Implement passkey credential management UI.
3. Run auth/pairing test matrix and capture a go/no-go report.
4. Continue splitting top remaining UI hotspots in descending file size.
5. Implement transmittal protected-name selector with schema validation.

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

