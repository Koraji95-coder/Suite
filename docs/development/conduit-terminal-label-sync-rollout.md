# Conduit Terminal Label Sync Rollout

This runbook now documents the post-cutover state for conduit terminal label sync. The staged bridge rollout is complete; dotnet-backed label sync now uses the in-process ACADE host, and the old bridge endpoint remains only as a compatibility alias.

## Scope

- Primary endpoint: `/api/conduit-route/terminal-labels/sync`
- Compatibility alias: `/api/conduit-route/bridge/terminal-labels/sync`
- Frontend switch: `VITE_CONDUIT_TERMINAL_LABEL_SYNC_MODE`

## Current Runtime Behavior

- `CONDUIT_ROUTE_AUTOCAD_PROVIDER=com` keeps the primary endpoint on the legacy COM manager path.
- `CONDUIT_ROUTE_AUTOCAD_PROVIDER=dotnet` sends the primary endpoint to the in-process ACADE host.
- `CONDUIT_ROUTE_AUTOCAD_PROVIDER=dotnet_fallback_com` sends the primary endpoint to the in-process ACADE host first and falls back to COM if that host call fails.
- The compatibility alias also targets the in-process ACADE host; it exists only to preserve older callers and compatibility tests.
- Existing auth flow remains unchanged.

## Frontend Mode Values

- `legacy`: always use legacy COM endpoint.
- `auto`: use the primary endpoint and let backend provider selection choose COM or the in-process ACADE host.
- `bridge`: force the compatibility alias path, which still reaches the in-process ACADE host for dotnet-backed runtime.

## Recommended Operational Baseline

1. Use `VITE_CONDUIT_TERMINAL_LABEL_SYNC_MODE=auto` as the default frontend setting.
2. Use `bridge` only when explicitly validating the compatibility alias.
3. Use `legacy` only when you need to pin traffic to COM for investigation or rollback.

## Validation Checklist

1. Scan terminal strips in a representative drawing.
2. Run terminal label sync.
3. Verify `TERMxx_LABEL` values match expected labels.
4. Confirm status/diagnostics show `providerPath=dotnet` when the in-process ACADE host is active.
5. Test unmatched target behavior and verify expected failure codes:
   - `NO_TARGET_STRIPS_MATCHED`
   - `NO_TERMINAL_STRIPS_FOUND`
6. Confirm no auth/session regressions.

## Rollback Triggers

Rollback immediately if any of the following occur:

- Terminal labels fail to write correctly.
- Dotnet-backed label sync returns repeated 5xx or `DOTNET_BRIDGE_FAILED`.
- Runtime provider diagnostics are inconsistent with expected environment behavior.
- User-facing sync failures exceed acceptable threshold for your team.

## Rollback Steps

1. Set `VITE_CONDUIT_TERMINAL_LABEL_SYNC_MODE=legacy`.
2. If needed, also set `CONDUIT_ROUTE_AUTOCAD_PROVIDER=com` on the backend.
3. Redeploy/restart the affected runtime.
3. Re-run quick smoke:
   - scan
   - sync
   - confirm COM endpoint behavior is restored
4. Keep the compatibility alias enabled for investigation; it no longer proves named-pipe bridge behavior by itself.

## Verification Commands

- Backend tests:
  - `python -m unittest backend.tests.test_api_route_groups backend.tests.test_api_autocad_dotnet_provider`
- Frontend typecheck:
  - `npm run typecheck -- --pretty false`

