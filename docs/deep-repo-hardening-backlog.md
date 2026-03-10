# Deep Repo Hardening Backlog

Last updated: 2026-03-10

This backlog captures the deep-scan findings for frontend/backend/.NET and
tracks implementation priorities with explicit acceptance criteria.

## Critical

- [x] AutoWire route fragmentation (`/app/apps/conduit-route` vs legacy AutoWire naming)
  - Fix: canonical route moved to `/app/apps/autowire` with compatibility redirect.
  - Acceptance:
    - `/app/apps/autowire` loads successfully.
    - `/app/apps/conduit-route` redirects to `/app/apps/autowire`.

- [x] Missing AutoDraft CAD backcheck path (manual QA bottleneck)
  - Fix: added `POST /api/autodraft/backcheck` (backend + .NET contract stub + UI trigger).
  - Acceptance:
    - backcheck returns structured findings with `requestId`.
    - degraded-mode warnings appear when CAD context is unavailable.
    - no CAD writes occur in backcheck flow.

## High

- [x] AutoDraft execution safety visibility gap
  - Fix: execution panel now surfaces explicit backcheck state and fail warnings.
  - Acceptance:
    - execution remains non-blocking in v1.
    - operator sees visible warning when backcheck is missing or failing.

- [x] Conduit/AutoWire preset drift risk across duplicated sources
  - Fix: unified typed preset source introduced for obstacle layer preset options.
  - Acceptance:
    - route UI reads presets from a single typed module.
    - preset options remain unchanged functionally.

## Medium

- [ ] Expand CAD-aware backcheck from request-supplied context to live CAD-read enrichment
  - Next step: add backend-side CAD context gatherers (entities/layers/locks) for
    backcheck requests that do not provide `cad_context`.

- [ ] Complete legacy AutoWire artifact retirement
  - Next step: port any remaining valuable logic from `src/components/apps/autowire/*`
    into typed modules under `src/components/apps/conduit-route/*`, then archive/remove
    duplicate prototype artifacts.

- [ ] Promote AutoDraft .NET backcheck from contract stub to CAD-native verifier
  - Next step: replace mock findings with geometry-aware checks against drawing context.
