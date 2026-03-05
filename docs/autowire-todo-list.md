# AutoWire TODO List

Last updated: 2026-03-05

## Immediate

- [ ] Set backend provider mode in `.env`:
  - `CONDUIT_ROUTE_AUTOCAD_PROVIDER=dotnet_fallback_com`
  - `AUTOCAD_DOTNET_PIPE_NAME=SUITE_AUTOCAD_PIPE`
  - `AUTOCAD_DOTNET_TIMEOUT_MS=30000`
- [ ] Start the .NET named-pipe server and verify both actions respond:
  - `conduit_route_terminal_scan`
  - `conduit_route_obstacle_scan`
- [ ] Validate terminal scan in a real drawing that includes terminal strip blocks/attributes.
- [ ] Validate obstacle scan in a real drawing with known routing layers.
- [ ] Confirm frontend status and logs are clean during normal use (no reconnect/auth noise).

## Functional Hardening

- [ ] Tighten terminal block detection rules for your actual CAD standards.
- [ ] Add layer-rule presets for obstacle classification per project template.
- [ ] Improve no-match diagnostics in responses (which layers were scanned, why entities were skipped).
- [ ] Add request correlation ID logging across frontend, backend, and .NET bridge.
- [ ] Add retry logic around transient COM read failures in .NET action handlers.

## Security / Auth

- [ ] Keep bearer-token auth as primary for `/api/conduit-route/*`.
- [ ] Keep API-key fallback disabled in production:
  - `AUTOCAD_ALLOW_API_KEY_FALLBACK=false`
  - `WS_ALLOW_API_KEY_FALLBACK=false`
- [ ] Set and validate optional pipe token (`AUTOCAD_DOTNET_TOKEN`) if using shared workstation scenarios.
- [ ] Add startup validation that provider mode + pipe settings are coherent.

## Performance

- [ ] Benchmark scan duration on large drawings (10k, 50k, 100k entities).
- [ ] Add scan caps and early-exit rules for very dense modelspaces.
- [ ] Add telemetry counters for:
  - scan time
  - matched entities
  - deduped entities
  - obstacle count / strip count

## Testing

- [ ] Add automated contract tests between backend and .NET bridge payload shapes.
- [ ] Add integration tests for provider modes:
  - `com`
  - `dotnet`
  - `dotnet_fallback_com`
- [ ] Add regression tests for auth failure, pipe unavailable, and malformed action payloads.

## Production Migration (Next Major Step)

- [ ] Replace COM-backed .NET reads with ObjectARX/AutoCAD .NET DB transaction reads.
- [ ] Keep existing action contract stable while migrating internals.
- [ ] Add write-path actions for route placement/tagging with transactional safety.
- [ ] Add feature flag to switch read/write implementation per environment.
- [ ] Document deployment/runbook for production startup order and health checks.

