# AutoDraft Execute Cutover Guide

Date: 2026-03-07

## Scope

This document defines when to switch from current staged AutoDraft behavior to
the full execute path in production.

## Current Behavior

- `POST /api/autodraft/plan`
  - Works with .NET proxy when configured and reachable.
  - Falls back to Python local rules when .NET is offline/unconfigured.
- `POST /api/autodraft/execute`
  - Proxies to .NET only.
  - Returns `501` with an error when `AUTODRAFT_DOTNET_API_URL` is not set.

## Frontend Status

- AutoDraft Studio now calls both:
  - `autoDraftService.plan(markups)`
  - `autoDraftService.execute(actions, { dryRun: true })`
- Studio shows execute status (`status`, `accepted`, `skipped`, `job_id`,
  `source`) or the backend error.

## Cutover Gate (Required Before Swapping)

Swap to "working system" for execution only when all items are true:

- .NET execute endpoint is deployed and reachable from backend:
  - `POST {AUTODRAFT_DOTNET_API_URL}/api/autodraft/execute`
- Backend health shows `.NET API = Connected`.
- Dry-run responses are stable for representative markups:
  - `ok = true`
  - `status = dry-run`
  - expected `accepted/skipped` counts
- Non-dry-run path is approved by owner and validated in a safe environment.
- Audit/logging for execute requests and outcomes is enabled.

## Swap Procedure

1. Keep frontend endpoint unchanged (`/api/autodraft/execute`).
2. Set `AUTODRAFT_DOTNET_API_URL` in backend environment to the target .NET service.
3. Run acceptance from AutoDraft Studio:
   - Run sample markups.
   - Execute dry run.
4. Confirm no `501` responses and verify `source = dotnet`.
5. After owner approval, allow non-dry-run execute usage.

## Rollback

- If execute errors regress, unset `AUTODRAFT_DOTNET_API_URL` or point to a
  known-good .NET deployment.
- Resulting behavior returns to safe mode:
  - plan still works (Python fallback)
  - execute rejects with `501` (no CAD writes)
