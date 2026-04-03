# Agent Instructions (Suite Root)

## Styling Rule (Non-Negotiable)

- Do not add or use Tailwind in this repository's main app.
- Use the existing global CSS + CSS Modules approach already in the project.
- Do not reintroduce removed ZeroClaw subtree code or workshop artifacts into active Suite codepaths.

## Auth Guardrail

- Do not make major auth flow changes without explicit user approval first.

## AutoCAD Reliability Guardrail

- Keep AutoCAD API error envelopes backward compatible:
  - `success`, `code`, `message`, `requestId`, optional `meta`.
- Include `requestId` in every AutoCAD error response and correlated logs.
- Prefer structured `logger.exception(...)` with stage context over ad-hoc prints.
- Do not introduce new `except Exception: pass` swallow patterns.
- Do not change CAD geometry/business behavior without explicit user approval.

## Agent Model Routing Guardrail

- Agent profile routing is deterministic and profile-driven.
- Keep profile to model mapping consistent across frontend and backend.
- If broker transport is enabled, backend profile routing is source of truth.
- Active profile catalog is six profiles: `koro`, `devstral`, `sentinel`, `forge`, `draftsmith`, `gridsage`.
- Runtime routing is strict single-model per profile (no cross-profile fallback retries).
- Keep compatibility fields (`model_fallbacks`, `fallback_models`) present in contracts as empty arrays until explicit breaking cleanup.

## Local Learning Guardrail

- Keep learning data, SQLite state, JSONL exports, and promoted model artifacts local-only.
- Active local learning domains are `autodraft_markup`, `autodraft_replacement`, and `transmittal_titleblock`.
- Do not mix AutoWire route data into the AutoDraft or transmittal learning domains.
- Agent hints are advisory features only; they must not silently override deterministic extraction or promoted local model output.

## AutoDraft And AutoWire Boundary

- Keep AutoDraft recognition/replacement logic separate from AutoWire routing logic.
- Shared code between the systems should stay limited to generic helpers such as geometry, OCR/text extraction, model-artifact handling, and observability utilities.
- AutoWire remains deterministic in this repo tranche: preview or sketch paths must not be treated as valid issued routes.

## Transmittal OCR Review Gate

- Use embedded PDF text extraction first and local OCR fallback only when embedded text is weak or absent.
- If no Excel index is uploaded, standard transmittal render requires reviewed `pdf_document_data` so temporary index generation stays review-first.
- Low-confidence title-block rows must be accepted or corrected before render.

## MCP/Handoff Guardrail

- When using `suite_repo_mcp`, prefer observability-safe tools/prompts and preserve this repo's guardrails.
- Any codex handoff should retain:
  - no Tailwind in Suite app,
  - no major auth changes without approval,
  - AutoCAD requestId/error-envelope conventions,
  - deterministic profile-model routing with no cross-model fallback retries.
  - UI semantics checks for form fields/labels/dialog composition (id/name/htmlFor and Dialog context safety).

## Documentation Navigation

- Start repo documentation at `docs/README.md`.
- Canonical runtime section indexes live under:
  - `docs/frontend/README.md`
  - `docs/backend/README.md`
  - `docs/runtime-control/README.md`
  - `docs/cad/README.md`
- `docs/development` is for operational/support docs, not canonical runtime architecture.
- Historical-only notes belong under `docs/archive/legacy`.
- When a slice changes runtime ownership, update or move its docs in the same tranche; do not leave stale pointers behind.

## Gateway Build/Runtime Guardrail

- The Suite-native gateway is the default gateway path for Suite workflows.
- Use `npm run gateway:dev` as the canonical command for daily development and handoffs.
- Legacy ZeroClaw CLI fallback is retired from active Suite workflows.
- If the runtime detects an unexpected legacy gateway process, stop it and relaunch the canonical Suite-native path.
- Do not reintroduce legacy gateway launchers or gateway-mode toggles into active Suite tooling.
- Historical rust/toolchain failures from the retired legacy path should stay archived as diagnostics, not as an active workaround track.

## Agent Orchestration Guardrail

- Use backend run-ledger orchestration endpoints for parallel agent work:
  - `POST /api/agent/runs`
  - `GET /api/agent/runs/:runId`
  - `GET /api/agent/runs/:runId/events`
  - `POST /api/agent/runs/:runId/cancel`
- Keep orchestration additive; do not change existing single-chat or pairing behavior.

## Performance Workflow

- For browser timing passes, prefer the repo's authenticated Playwright flow over manual login or ad-hoc stopwatch timing.
- Bootstrap protected-route auth state with `npm run auth:playwright:bootstrap`.
- Use `npm run test:e2e:dashboard:perf` for dashboard timing snapshots; the run emits `dashboard-performance.json` and reads `window.__suiteDashboardPerf`.
- Dashboard perf instrumentation lives in `src/components/apps/dashboard/dashboardPerf.ts`; update it additively and keep probes dev-safe.
- If browser automation or MCP browser tooling is available, use that authenticated flow first before adding new one-off perf scripts.
