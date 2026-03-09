# Agent Profile Model Pack (Ollama)

This repo uses deterministic profile-based model routing for Suite Agent.

## Active Profiles

1. `koro`
   - Primary: `qwen3:14b`
2. `devstral`
   - Primary: `devstral-small-2:latest`
3. `sentinel`
   - Primary: `gemma3:12b`
4. `forge`
   - Primary: `qwen2.5-coder:14b`
5. `draftsmith`
   - Primary: `joshuaokolo/C3Dv0:latest`
6. `gridsage`
   - Primary: `ALIENTELLIGENCE/electricalengineerv2:latest`

## Transport Behavior

1. `VITE_AGENT_TRANSPORT=backend` (or `broker`) [default]
   - Frontend sends profile metadata to backend `/api/agent/webhook`.
   - Backend resolves profile route and performs a single-model attempt per request.
2. `VITE_AGENT_TRANSPORT=direct` [local override]
   - Frontend sends profile + primary model metadata directly to ZeroClaw `/webhook`.
   - Frontend performs a single-model attempt per request.

## Runtime Override (No Code Changes)

Use `.env` keys to swap model pack values.

Frontend (direct mode):

- `VITE_AGENT_MODEL_<PROFILE>_PRIMARY`

Backend (broker mode):

- `AGENT_MODEL_<PROFILE>_PRIMARY`

Examples:

- `AGENT_MODEL_DEVSTRAL_PRIMARY=devstral-small-2:latest`
- `AGENT_MODEL_GRIDSAGE_PRIMARY=ALIENTELLIGENCE/electricalengineerv2:latest`
- `AGENT_ORCHESTRATION_MAX_PARALLEL_PROFILES=2` (recommended local cap for heavy model packs)

Compatibility note:

- `*_FALLBACKS` keys are deprecated and ignored in current runtime behavior.
- API compatibility fields (`model_fallbacks`, `fallback_models`) remain present as empty arrays in this phase.

## API Surface

Backend exposes:

- `GET /api/agent/profiles` for profile/model metadata
- `POST /api/agent/webhook` for brokered requests with strict profile route selection
- `POST /api/agent/runs` for background multi-agent orchestration enqueue
- `GET /api/agent/runs/:runId` for run status + outputs
- `GET /api/agent/runs/:runId/events` for SSE progress events
- `POST /api/agent/runs/:runId/cancel` for cancellation

ZeroClaw webhook accepts:

- `model` in request body for explicit model override per request

## Advanced Usage Patterns

1. CAD route drafting:
   - Switch to `draftsmith`.
   - Ask for route constraints + obstacle strategy + draw order in one prompt.
2. Electrical system strategy:
   - Switch to `gridsage`.
   - Ask for assumptions, protection checks, and implementation constraints.
3. Implementation pass:
   - Switch to `devstral`.
   - Ask for concrete refactor + test additions + rollback notes.
4. Pre-merge QA:
   - Switch to `sentinel`.
   - Ask for regression/failure-mode checklist by changed module.
5. Documentation package generation:
   - Switch to `forge`.
   - Ask for structured release notes + operator runbook draft.

## Guardrails

- No major auth-flow changes are part of this model-pack implementation.
- AutoCAD reliability/logging guardrails remain governed by root `AGENTS.md`.
- Detailed profile behavior contracts: `docs/agent/profile-playbook.md`.
- Orchestration operator workflow: `docs/agent/orchestration-runbook.md`.
