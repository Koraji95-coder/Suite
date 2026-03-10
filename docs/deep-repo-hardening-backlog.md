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

- [x] AutoDraft execute backcheck gate is client-bypassable
  - Fix:
    - `backend/route_groups/api_autodraft.py` now computes execute gate decisions from
      server-side backcheck summary (`server_backcheck_fail_count`) and only logs
      client/server mismatch telemetry.
  - Acceptance:
    - execute blocks on failing server-side backcheck unless `backcheck_override_reason`
      is provided.
    - spoofed client `backcheck_fail_count` no longer bypasses the gate.

- [x] Agent conversation storage limits can exceed browser localStorage quota
  - Fix:
    - lowered default transcript caps in `agentTaskManager`.
    - added byte-budget enforcement with conversation/message trimming before writes.
    - added quota-retry path with aggressive trim and structured warning telemetry.
  - Acceptance:
    - oversized histories are trimmed deterministically before persistence.
    - quota exceptions no longer hard-fail normal save paths.

## Medium

- [x] Expand CAD-aware backcheck from request-supplied context to live CAD-read enrichment
  - Fix:
    - added live CAD-read enrichment hooks for layers/locks/entities via
      `AutoCADManager.get_layer_snapshot()` and `AutoCADManager.get_entity_snapshot()`.
    - `api_autodraft` now collects action-layer hints and hydrates CAD context from
      live manager snapshots when client `cad_context` is missing or partial.
  - Acceptance:
    - backcheck can perform entity-overlap and locked-layer checks with live CAD data
      without requiring client-provided CAD context payloads.

- [x] Complete legacy AutoWire artifact retirement
  - Fix:
    - removed legacy duplicate prototype artifacts under `src/components/apps/autowire/*`.
    - documented archival/removal mapping in
      `docs/development/autowire-legacy-artifacts-archive.md`.
  - Acceptance:
    - no runtime imports reference `src/components/apps/autowire/*`.
    - canonical AutoWire implementation remains under
      `src/components/apps/conduit-route/*`.

- [x] Promote AutoDraft .NET backcheck from contract stub to CAD-native verifier
  - Fix:
    - upgraded `.NET` backcheck service to deterministic CAD-context verification
      (locked-layer checks, entity overlap checks, cloud-intent conflict checks,
      action overlap conflict checks).
    - preserved response contract while populating `cad.entity_count`,
      `cad.locked_layer_count`, and detailed finding notes/suggestions from live context.
  - Acceptance:
    - backcheck no longer returns purely stubbed findings when `cad_context` is provided.

- [x] `require_cad_context` check rejects valid live-CAD-only backcheck requests
  - Fix:
    - `backend/route_groups/api_autodraft.py` now satisfies `require_cad_context=true`
      from merged effective context (live OR client).
  - Acceptance:
    - live-CAD-only requests no longer fail when client payload omits `cad_context`.

- [x] Conduit route backcheck collision pass has O(segments x obstacles) hot loop
  - Fix:
    - `backend/route_groups/api_autocad.py` now builds a coarse spatial bucket index of
      inflated obstacle envelopes and evaluates segment intersections against bucketed candidates.
  - Acceptance:
    - obstacle checks are pre-filtered per segment instead of full scan on every segment.
    - collision findings remain functionally equivalent on existing backcheck tests.

- [x] AutoDraft JSON error envelope consistency drift
  - Fix:
    - introduced shared AutoDraft error helpers that emit `code`, `message`, `requestId`,
      plus compatibility `error`/`ok`/`success` fields.
    - normalized plan/execute/backcheck non-2xx paths to use the shared envelope.
  - Acceptance:
    - non-2xx `api_autodraft` responses include stable correlation and machine-readable codes.

- [x] Docs root index corruption / drift
  - Fix:
    - replaced `docs/README.md` with a clean repository docs index.
    - moved exploratory prose to
      `docs/development/autodraft-integration-notes-legacy.md`.
  - Acceptance:
    - docs root now points to stable category entry points and high-signal docs.
    - exploratory notes are preserved outside the root index.
