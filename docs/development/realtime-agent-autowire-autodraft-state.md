# Real-Time State: Agent + AutoWire + AutoDraft

Last updated: 2026-03-10

This document captures how the system behaves in real time right now, after the latest stabilization and backcheck passes.

## 1) Runtime Topology (Current)

- Frontend: Vite app (`http://localhost:5173`)
- Agent gateway: Suite-native gateway (`npm run gateway:dev`, typically `http://127.0.0.1:3000`)
- Backend API: Flask app (`/api/*`)
- Local model runtime: Ollama

Current intended transport split:

- Agent direct chat reliability baseline: `direct` transport supported and stable.
- Multi-agent orchestration/live run ledger: `backend` (brokered) transport required.

## 2) Agent Real-Time Behavior (Current)

### Direct Profile Chat

- Uses one selected profile -> one deterministic model (no cross-profile fallbacks).
- Requests stream incrementally in direct path when stream is available.
- Connect gate timeout is short; long generation uses a separate stream runtime window.
- Cancel stops active stream and keeps partial response.

### General Channel + Run Threads

- Team/Shared scope is now **General**.
- Orchestration runs auto-create a run-linked General conversation thread (`runId`).
- General scope does not require manual new/delete thread controls.
- Run events mirror into the run thread:
  - `agent_message` -> assistant-style message entry with source profile attribution.
  - `step_*`, `task_*`, `run_*` -> system/event entries.
- Thinking indicators are event-driven from real run state transitions, not synthetic timers.

### Queue + Activity

- Task queue and activity feed are global by default (not per-profile gated).
- Filters available by profile/run/source/status/priority.
- Clicking queue/activity entries with a `runId` opens the corresponding General run thread.

## 3) Pairing/Auth Session Behavior (Current)

- Local low-friction mode is currently email-link-first for sign-in.
- Pairing restore is wired for returning users on the same device/session.
- Pairing remains security-enforced (token/session based).
- Brokered verification flows are available where configured.

## 4) AutoWire Real-Time Behavior (Current)

### Canonical App Identity

- Canonical route: `/app/apps/autowire`
- Compatibility redirect: `/app/apps/conduit-route` -> `/app/apps/autowire`

### Route Compute + Backcheck

- Routing computes through `/api/conduit-route/route/compute`.
- Backcheck runs through `/api/conduit-route/backcheck`.
- UI surfaces backcheck status per route (`not_run|pass|warn|fail|overridden|error`).

### Terminal CAD Sync Gate (Current)

- Before route CAD sync, route-level backcheck runs.
- If backcheck returns fail and no override reason is provided, CAD sync is blocked.
- If override reason is set, route can continue as `overridden`.
- Diagnostics record both backcheck and sync outcomes with request correlation metadata.

## 5) AutoDraft Real-Time Behavior (Current)

### Plan / Backcheck / Execute Path

- Plan: `POST /api/autodraft/plan`
- Backcheck: `POST /api/autodraft/backcheck`
- Execute: `POST /api/autodraft/execute`

Current behavior:

- Backcheck is manual and read-only.
- CAD-aware context is used when available; degrades gracefully when unavailable.
- Findings return structured pass/warn/fail status with per-action notes/suggestions.
- Execute path enforces override when backcheck fail count is present.

## 6) Current Guardrails Preserved

- No Tailwind in Suite app (CSS modules + existing styles only).
- No major auth architecture change without explicit approval.
- AutoCAD API error envelopes remain backward compatible where already standardized.
- Agent profile routing remains deterministic and single-model per profile.

## 7) Known Gaps To Improve Next

- Expand backcheck from geometric sanity checks to engineering-rule checks (discipline-specific rulesets).
- Improve review visibility details in activity feed for failed/rework task context.
- Continue form semantics sweep (`id`/`name` + label association) in remaining native-field pockets.
- Reduce heavy-route backcheck complexity with spatial indexing for large obstacle sets.
