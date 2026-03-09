# Suite Agent System Manual

This is the primary operator manual for coordinating the Suite multi-agent system.

## 1) What this system does

The system gives you two modes:

1. Single-agent chat for direct interaction (`/api/agent/webhook` flow).
2. Multi-agent orchestration runs (`/api/agent/runs`) with:
- Stage A parallel worker outputs
- Stage B cross-review outputs
- Stage C synthesis output

All orchestration activity is persisted in the SQLite run ledger:

- `agent_runs`
- `agent_run_steps`
- `agent_run_messages`

This makes every run inspectable and replayable.

## 2) Active profiles and responsibilities

1. `koro`: orchestration and final synthesis.
2. `devstral`: implementation and debugging.
3. `sentinel`: risk/compliance/reliability review.
4. `forge`: documentation and operator packaging.
5. `draftsmith`: CAD/electrical drafting strategy.
6. `gridsage`: electrical systems reasoning and implementation constraints.

Model mapping details live in:

- `docs/agent/ollama-profile-model-pack.md`

Behavior contracts live in:

- `docs/agent/profile-playbook.md`

## 3) Guardrails you should keep

1. Do not make major auth-flow changes without explicit approval.
2. Keep profile mapping parity between frontend and backend.
3. Keep strict one-profile-to-one-model routing (no cross-profile fallback retries).
4. Keep AutoCAD behavior stable unless you explicitly approve behavior changes.

## 4) Startup and preflight checklist

1. Backend:
- Start backend and confirm no dependency-key startup errors.
- Confirm `AGENT_RUN_LEDGER_PATH` points to a writable location.

2. Gateway:
- If building Rust source locally on Windows, install Visual Studio Build Tools workload:
  `Desktop development with C++`.
- If missing `link.exe`, start shell from `x64 Native Tools Command Prompt for VS 2022` or run `VsDevCmd.bat`.

3. Frontend:
- Default should be broker mode: `VITE_AGENT_TRANSPORT=backend`.
- Use direct mode only for local troubleshooting/break-glass workflows.

4. Auth/session:
- Keep existing auth/session pairing flow unchanged.
- Confirm a valid agent session token before creating orchestration runs.

## 4.1) Pairing Lifecycle (Canonical)

Use the canonical pairing runbook:

- `docs/agent/pairing-lifecycle.md`

Broker pairing/unpairing now follows email verification for both actions:

1. `POST /api/agent/pairing-challenge`
2. User opens email link (`agent_action` + `agent_challenge`)
3. `POST /api/agent/pairing-confirm`

Direct broker endpoints are blocked by policy:

- `POST /api/agent/pair` -> `428`
- `POST /api/agent/unpair` -> `428`

## 5) Orchestration API quick reference

1. `POST /api/agent/runs`
- Enqueue run.
- Returns immediately with `202` and `{ success, runId, status, requestId }`.

2. `GET /api/agent/runs/:runId`
- Returns run metadata, steps, messages, stage summaries, and final synthesis when complete.

3. `GET /api/agent/runs/:runId/events`
- SSE stream for progress events:
  `run_started`, `step_started`, `step_completed`, `step_failed`, `run_completed`, `run_cancelled`.

4. `POST /api/agent/runs/:runId/cancel`
- Requests cancellation.

For strict endpoint contract details, use:

- `docs/agent/orchestration-runbook.md`

## 6) Standard operating workflow

1. Define objective:
- One concrete outcome, constraints, and success criteria.

2. Select profiles:
- Typical engineering run: `devstral`, `sentinel`, `forge`, `draftsmith`, `gridsage`.
- Synthesis profile usually `koro`.

3. Launch run:
- Submit `objective`, `profiles`, optional `context`, optional `timeoutMs`.

4. Monitor run:
- Subscribe to SSE events for live progress.
- Poll run snapshot for complete state and per-step details.

5. Use synthesis output:
- Treat Stage C output as action plan.
- Keep Stage A/Stage B outputs for audit trail and disagreement analysis.

6. Close loop:
- Convert synthesis tasks into concrete tickets.
- Record what was accepted/rejected and why.

## 6.1) Animated conversation view in the UI

The Agent page now includes a `Live Agent Collaboration` panel that animates multi-agent run events.

How to use it:

1. Open `App -> Agent`.
2. Ensure transport is broker mode (`VITE_AGENT_TRANSPORT=backend`) and pairing is active.
3. In `Live Agent Collaboration`, enter an objective and choose worker profiles.
4. Click `Start Run`.
5. Expand the panel to watch animated event bubbles as agents progress through Stage A/B/C.
6. Confirm stream badge moves to `stream live` (SSE active). If it drops, polling fallback still updates run status.
7. Use `Cancel` for stop requests, or `Refresh` to force an immediate status pull.
8. Use `Reconnect` to force an immediate stream reconnect without waiting for backoff.

The UI now auto-reconnects stream drops with exponential backoff + jitter and resumes from the last event id.

What you will see:

1. Stage summary cards (completed/in-progress/failed counts).
2. Event timeline with profile avatars and event badges.
3. Final synthesis output once Stage C completes.

## 7) Running this in parallel with Codex

Use this operating model:

1. Start an orchestration run in background (`POST /api/agent/runs`).
2. Continue coding/debugging in Codex immediately.
3. Watch run progress via SSE or periodic `GET /api/agent/runs/:runId`.
4. Pull final synthesis when complete.
5. Merge agent findings into current implementation branch.

This avoids blocking on one assistant path and gives you parallel analysis + implementation.

## 8) Prompt patterns that work well

### A) Reliability hardening

Objective example:

`Harden AutoCAD route draw and label sync error handling without behavior changes. Return typed failure map, patch set plan, and tests.`

Suggested profiles:

- `devstral`, `sentinel`, `forge`

### B) Feature implementation + QA

Objective example:

`Implement Ground Grid export improvements and provide a rollback-safe migration checklist with tests.`

Suggested profiles:

- `devstral`, `sentinel`, `forge`

### C) CAD drafting strategy

Objective example:

`Propose safe execution order for terminal scan -> route compute -> route draw -> label sync with pre/post validation gates.`

Suggested profiles:

- `draftsmith`, `gridsage`, `sentinel`

## 9) Real-life scenario playbooks

### Scenario 1: Pre-release reliability gate

Use when:
- You are 1-2 days from release and need confidence in production stability.

Run:
1. Profiles: `devstral`, `sentinel`, `forge`.
2. Ask for top regressions, highest-risk paths, and exact validation commands.
3. Have `koro` synthesize a release/no-release checklist.

Outcome:
- You get a prioritized fix list, risk justification, and operator runbook updates.

### Scenario 2: AutoCAD outage triage

Use when:
- A CAD pathing or draw workflow is failing in a way that is hard to reproduce.

Run:
1. Profiles: `devstral`, `draftsmith`, `gridsage`, `sentinel`.
2. Include logs, request IDs, and failing payload samples in `context`.
3. Require failure classification and recovery sequence.

Outcome:
- Fast root-cause narrowing, safer mitigation plan, and test reproduction steps.

### Scenario 3: Large refactor with low regression tolerance

Use when:
- You need internal cleanup but cannot break existing contracts.

Run:
1. Profiles: `devstral`, `sentinel`, `forge`.
2. Ask for phased refactor plan with compatibility envelope and rollback checkpoints.

Outcome:
- Sequenced refactor path with explicit contract tests before cutover.

### Scenario 4: Customer-facing pilot package

Use when:
- You want to demo one workflow to an external stakeholder.

Run:
1. Profiles: `forge`, `sentinel`, `devstral`.
2. Ask for deployment checklist, known limitations, and support runbook.

Outcome:
- Cleaner pilot onboarding package and lower support risk.

### Scenario 5: Fast bid-support drafting estimate

Use when:
- You need a same-day estimate for drafting automation effort.

Run:
1. Profiles: `draftsmith`, `gridsage`, `devstral`, `forge`.
2. Ask for phased estimate, assumptions, and acceptance tests per phase.

Outcome:
- A clearer scope/effort narrative and less underbidding risk.

## 10) Troubleshooting and failure handling

1. Run stays `queued`:
- Check worker thread availability and backend logs.
- Confirm run owner has active session context.

2. Frequent `step_failed`:
- Inspect `agent_run_steps.error_message`.
- Check the single-model route in `model_attempts_json` and the configured primary mapping.
- Confirm gateway URL/token/secret settings.

3. SSE disconnects:
- Reconnect using last received event ID.
- Poll `GET /api/agent/runs/:runId` as recovery path.

4. Low-quality outputs:
- Tighten objective and context.
- Reduce profile set to those needed for that run.
- Add explicit acceptance criteria in the objective.

## 11) Lightweight monetization pathways (minor focus)

These are practical, low-risk options to test marketability.

1. Internal productivity service
- Offer “automation reliability packs” for internal teams.
- Deliverables: runbook, reliability hardening, failure observability.

2. Drafting workflow package
- Package repeatable CAD workflows as a service tier.
- Sell by workflow outcome (turnaround time, consistency), not by model hype.

3. Managed rollout + support
- Offer setup + monitoring + monthly tuning for agent orchestration.
- Use run-ledger evidence for transparent support reports.

4. Compliance/risk review add-on
- Productize Sentinel-style release gates for critical route groups.

## 12) Optional business agent concept (future)

If you want a dedicated business profile later, add a seventh profile (example: `broker`) with:

1. Mission:
- Packaging, pricing experiments, customer discovery scripts, and sales collateral drafts.

2. Do:
- Generate offer hypotheses, qualification questions, and ROI framing.

3. Avoid:
- Financial/legal promises without human review.

4. Output schema:
- `offer_hypotheses`, `target_segment`, `pricing_tests`, `go_to_market_steps`, `risk_notes`.

Keep this separate from implementation-critical runs so business experimentation does not pollute engineering synthesis.

## 13) Suggested first 30-day operating cadence

1. Week 1:
- Use orchestration for release gating only.

2. Week 2:
- Add outage triage playbook to every major incident.

3. Week 3:
- Run one pilot customer/internal workflow package.

4. Week 4:
- Review run-ledger outcomes:
  - cycle time
  - escaped defects
  - fix lead time
  - pilot conversion signals

Then decide whether to add the optional business profile.

## 14) Operator command examples

PowerShell examples (replace placeholders):

```powershell
# enqueue run
$body = @{
  objective = "Harden AutoCAD route draw reliability without behavior changes."
  profiles = @("devstral","sentinel","forge","draftsmith","gridsage")
  synthesisProfile = "koro"
  context = @{ ticket = "INC-1422"; branch = "feature/reliability" }
  timeoutMs = 90000
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method POST `
  -Uri "http://localhost:5000/api/agent/runs" `
  -Headers @{ Authorization = "Bearer <agent_session_token>" } `
  -ContentType "application/json" `
  -Body $body
```

```powershell
# get run snapshot
Invoke-RestMethod -Method GET `
  -Uri "http://localhost:5000/api/agent/runs/<run_id>" `
  -Headers @{ Authorization = "Bearer <agent_session_token>" }
```

```powershell
# cancel run
Invoke-RestMethod -Method POST `
  -Uri "http://localhost:5000/api/agent/runs/<run_id>/cancel" `
  -Headers @{ Authorization = "Bearer <agent_session_token>" }
```

## 15) What to read next

1. `docs/agent/profile-playbook.md`
2. `docs/agent/orchestration-runbook.md`
3. `docs/agent/ollama-profile-model-pack.md`
4. `AGENTS.md`
