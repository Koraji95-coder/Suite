# Documentation Structure and Move Rules

This document defines the permanent documentation move/archive policy for Suite.

## Canonical Navigation

- Start at `docs/README.md`.
- Then move into the owning section README:
  - `docs/frontend/README.md`
  - `docs/backend/README.md`
  - `docs/runtime-control/README.md`
  - `docs/cad/README.md`
  - plus domain/support sections as needed

## Section Ownership

- `docs/frontend`
  - browser-owned feature/runtime architecture
- `docs/backend`
  - hosted-core API and service ownership
- `docs/runtime-control`
  - workstation-local companion behavior, bring-up, transfer, MCP stamping, and local actions
- `docs/cad`
  - AutoCAD execution, local CAD transport, and CAD integration references
- `docs/development`
  - operational/support docs
- `docs/security`
  - security/auth/secrets/hardening docs
- `docs/archive/legacy`
  - historical-only notes

## Move / Delete / Archive Rules

- If a doc is obsolete and has no real historical value, delete it.
- If a doc is still valid but lives in the wrong section, move it to the owning section and update links in the same tranche.
- If a doc has historical value but should not guide active implementation, move it to `docs/archive/legacy`.
- Do not leave long-lived "moved" stubs behind in active sections.

## Slice Completion Rule

Every runtime ownership slice must ship with its doc work in the same tranche:

- canonical doc updates
- moved doc paths
- archived or deleted obsolete notes
- updated links from repo root and related READMEs

A slice is not complete until the docs tree matches the new ownership model.
