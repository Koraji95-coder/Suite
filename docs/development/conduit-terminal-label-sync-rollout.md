# Conduit Terminal Label Sync Rollout

This runbook describes how to move terminal label sync from the legacy COM endpoint to the new bridge endpoint with a controlled rollback path.

## Scope

- Legacy endpoint: `/api/conduit-route/terminal-labels/sync`
- Bridge endpoint: `/api/conduit-route/bridge/terminal-labels/sync`
- Frontend switch: `VITE_CONDUIT_TERMINAL_LABEL_SYNC_MODE`

## Prerequisites

- Backend bridge route is deployed.
- .NET named-pipe bridge process is available in the environment.
- Backend provider/runtime settings are already valid for your target environment (`CONDUIT_ROUTE_AUTOCAD_PROVIDER`, `AUTOCAD_DOTNET_*`).
- Existing auth flow remains unchanged.

## Frontend Mode Values

- `legacy`: always use legacy COM endpoint.
- `auto`: use bridge endpoint only when runtime provider is `dotnet` and bridge sender is ready.
- `bridge`: always use bridge endpoint.

## Recommended Rollout Sequence

1. Set `VITE_CONDUIT_TERMINAL_LABEL_SYNC_MODE=legacy` in production baseline.
2. Set `VITE_CONDUIT_TERMINAL_LABEL_SYNC_MODE=auto` in dev/staging.
3. Validate parity using the checklist below.
4. Keep `auto` for one full validation cycle in staging.
5. Move staging to `bridge` once stable.
6. Move production to `auto` first.
7. Move production to `bridge` only after acceptance criteria are met.

## Validation Checklist

1. Scan terminal strips in a representative drawing.
2. Run terminal label sync.
3. Verify `TERMxx_LABEL` values match expected labels.
4. Confirm status/diagnostics show `providerPath=dotnet` when bridge is active.
5. Test unmatched target behavior and verify expected failure codes:
   - `NO_TARGET_STRIPS_MATCHED`
   - `NO_TERMINAL_STRIPS_FOUND`
6. Confirm no auth/session regressions.

## Rollback Triggers

Rollback immediately if any of the following occur:

- Terminal labels fail to write correctly.
- Bridge endpoint returns repeated 5xx or `DOTNET_BRIDGE_FAILED`.
- Runtime provider diagnostics are inconsistent with expected environment behavior.
- User-facing sync failures exceed acceptable threshold for your team.

## Rollback Steps

1. Set `VITE_CONDUIT_TERMINAL_LABEL_SYNC_MODE=legacy`.
2. Redeploy frontend.
3. Re-run quick smoke:
   - scan
   - sync
   - confirm legacy endpoint behavior is restored
4. Keep bridge endpoint enabled in backend for investigation; do not remove until root cause is fixed.

## Verification Commands

- Backend tests:
  - `python -m unittest backend.tests.test_api_route_groups backend.tests.test_api_autocad_dotnet_provider`
- Frontend typecheck:
  - `npm run typecheck -- --pretty false`

