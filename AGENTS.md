# Agent Instructions (Suite Root)

## Styling Rule (Non-Negotiable)

- Do not add or use Tailwind in this repository's main app.
- Use the existing global CSS + CSS Modules approach already in the project.
- Keep `zeroclaw-main/` behavior and stack isolated unless explicitly asked.

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

## MCP/Handoff Guardrail

- When using `suite_repo_mcp`, prefer observability-safe tools/prompts and preserve this repo's guardrails.
- Any codex handoff should retain:
  - no Tailwind in Suite app,
  - no major auth changes without approval,
  - AutoCAD requestId/error-envelope conventions,
  - deterministic profile-model routing with no cross-model fallback retries.

## Gateway Build/Runtime Guardrail

- `zeroclaw-gateway` is the default gateway path for Suite workflows.
- Use `npm run gateway:dev` as the canonical command for daily development and handoffs.
- Full CLI gateway (`zeroclaw gateway`) is incident-only diagnostics, not an equal daily alternative.
- `SUITE_GATEWAY_USE_FULL_CLI=1` is allowed only for explicit diagnostics and evidence capture.
- If rustc crashes (`stack overflow`, `0xc0000005`, ICE), capture versions + failure signature once, classify as compiler/toolchain instability, then return to default gateway path.
- Do not stack speculative build-flag workarounds in-session after a classified compiler/toolchain failure.
- Escalate upstream only after collecting a minimal reproducible diagnostic capture.

## Agent Orchestration Guardrail

- Use backend run-ledger orchestration endpoints for parallel agent work:
  - `POST /api/agent/runs`
  - `GET /api/agent/runs/:runId`
  - `GET /api/agent/runs/:runId/events`
  - `POST /api/agent/runs/:runId/cancel`
- Keep orchestration additive; do not change existing single-chat or pairing behavior.
