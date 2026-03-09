# Agent Orchestration Runbook

Backend-led orchestration runs agents in parallel stages and stores all progress in a persistent run ledger.

For full operator instructions and scenario playbooks, start with `docs/agent/README.md`.

## Endpoints

1. `POST /api/agent/runs`
- Requires broker auth + agent session.
- Request body:
  - `objective` (required)
  - `profiles[]` (optional)
  - `synthesisProfile` (optional, defaults to `koro`)
  - `context` (optional)
  - `timeoutMs` (optional)
- Response:
  - `success`, `runId`, `status`, `requestId`

2. `GET /api/agent/runs/:runId`
- Returns:
  - run metadata
  - stage/step status and outputs
  - final synthesis output (when complete)
  - `requestId`

3. `GET /api/agent/runs/:runId/events`
- SSE stream of lifecycle events:
  - `run_started`
  - `step_started`
  - `step_completed`
  - `step_failed`
  - `run_completed`
  - `run_cancelled`

4. `POST /api/agent/runs/:runId/cancel`
- Cancels in-flight runs.
- Response:
  - `success`, `status`, `requestId`

## Execution Graph

1. Stage A: parallel worker pass for selected profiles.
2. Stage B: cross-review pass where each selected profile reviews Stage A outputs.
3. Stage C: synthesis pass (default `koro`) produces final actionable output.

## Observability and Correlation

- Every run includes a top-level `requestId`.
- Every step has a distinct `stepRequestId`.
- Ledger tables:
  - `agent_runs`
  - `agent_run_steps`
  - `agent_run_messages`
- SSE payloads include event IDs for resume/cursor usage.

## Guardrails

- No major auth-flow redesigns.
- Preserve deterministic profile-based single-model routing across frontend/backend.
- Keep compatibility fallback fields present as empty arrays until explicit contract cleanup.
- Keep AutoCAD and other domain behavior unchanged unless explicitly approved.
