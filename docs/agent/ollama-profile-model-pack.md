# Agent Profile Model Pack (Ollama)

This repo now uses deterministic profile-based model routing for Suite Agent.

## Active Profiles

1. `koro`
   - Primary: `qwen3:14b`
   - Fallback: `gemma3:12b`
2. `devstral`
   - Primary: `devstral-small-2:latest`
   - Fallback: `qwen2.5-coder:14b`
3. `sentinel`
   - Primary: `gemma3:12b`
   - Fallback: `qwen3:8b`
4. `forge`
   - Primary: `qwen2.5-coder:14b`
   - Fallback: `devstral-small-2:latest`
5. `draftsmith`
   - Primary: `joshuaokolo/C3Dv0:latest`
   - Fallback: `ALIENTELLIGENCE/electricalengineerv2:latest`

## Transport Behavior

1. `VITE_AGENT_TRANSPORT=backend` (or `broker`) [default]
   - Frontend sends profile metadata to backend `/api/agent/webhook`.
   - Backend resolves profile route and retries fallback models server-side.
2. `VITE_AGENT_TRANSPORT=direct` [local override]
   - Frontend sends profile + model candidate metadata directly to ZeroClaw `/webhook`.
   - Frontend performs retry to fallback model on retryable gateway failures.

## Runtime Override (No Code Changes)

Use `.env` keys to swap model pack values.

Frontend (direct mode):

- `VITE_AGENT_MODEL_<PROFILE>_PRIMARY`
- `VITE_AGENT_MODEL_<PROFILE>_FALLBACKS` (comma-separated)

Backend (broker mode):

- `AGENT_MODEL_<PROFILE>_PRIMARY`
- `AGENT_MODEL_<PROFILE>_FALLBACKS` (comma-separated)

Examples:

- `AGENT_MODEL_DEVSTRAL_PRIMARY=devstral-small-2:latest`
- `AGENT_MODEL_DRAFTSMITH_FALLBACKS=ALIENTELLIGENCE/electricalengineerv2:latest`

## API Surface

Backend exposes:

- `GET /api/agent/profiles` for profile/model metadata
- `POST /api/agent/webhook` for brokered requests with profile route + fallback retry
- `POST /api/agent/runs` for background multi-agent orchestration enqueue
- `GET /api/agent/runs/:runId` for run status + outputs
- `GET /api/agent/runs/:runId/events` for SSE progress events
- `POST /api/agent/runs/:runId/cancel` for cancellation

ZeroClaw webhook now accepts optional:

- `model` in request body for explicit model override per request

## Advanced Usage Patterns

1. CAD route drafting:
   - Switch to `draftsmith`.
   - Ask for route constraints + obstacle strategy + draw order in one prompt.
2. Implementation pass:
   - Switch to `devstral`.
   - Ask for concrete refactor + test additions + rollback notes.
3. Pre-merge QA:
   - Switch to `sentinel`.
   - Ask for regression/failure-mode checklist by changed module.
4. Documentation package generation:
   - Switch to `forge`.
   - Ask for structured release notes + operator runbook draft.

## Guardrails

- No major auth-flow changes are part of this model-pack implementation.
- AutoCAD reliability/logging guardrails remain governed by root `AGENTS.md`.
- Detailed profile behavior contracts: `docs/agent/profile-playbook.md`.
- Orchestration operator workflow: `docs/agent/orchestration-runbook.md`.
