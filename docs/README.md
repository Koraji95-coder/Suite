# Suite Docs Index

This is the canonical entry point for repository documentation. People and tooling should start here, then move into the owning section README before drilling into individual notes.

## Runtime Sections

- [Frontend](./frontend/README.md)
  - Browser flows, app-owned feature slices, and UI/runtime ownership notes.
- [Backend](./backend/README.md)
  - Hosted-core Python APIs, route groups, and service/domain ownership.
- [Runtime Control](./runtime-control/README.md)
  - Workstation-local companion, bring-up, transfer, MCP workstation stamping, and local action ownership.
- [CAD](./cad/README.md)
  - AutoCAD execution, `suite-cad-authoring` ownership, Drawing Cleanup, and bridge diagnostic references.

## Domain Sections

- [AutoDraft](./autodraft/README.md)
  - Architecture, execute cutover, rules, and reference materials.

## Support Sections

- [Development](./development/README.md)
  - Operational runbooks, repo hygiene, docs structure rules, and local/hosted workflow support.
- [Security](./security/README.md)
  - Auth architecture, passkey rollout, secrets, and Supabase hardening.
- [Legacy Archive](./archive/legacy/README.md)
  - Historical-only notes that should not guide active implementation work.

## Current High-Signal Docs

- [Long-Term Overhaul TODO Plan](./development/long-term-overhaul-todo-plan.md)
- [Project Setup + Title Block Runtime Flow](./frontend/project-setup-title-block-runtime-flow.md)
- [Project Manager Feature Slice](./frontend/project-manager-feature-slice.md)
- [Windows Workstation Bring-Up](./runtime-control/workstation-bringup.md)
- [Post-Overhaul Feature Backlog](./development/post-overhaul-feature-backlog.md)
- [Performance Baseline](./performance-baseline.md)
- [Deep Repo Hardening Backlog](./deep-repo-hardening-backlog.md)

## Working Notes

- [App Feature Ideas](./app feature ideas.md)
  - Working intake note for feature ideas and external workflow inspiration. This is not a canonical architecture spec.
- [App Feature Roadmap And Opinions](./app-feature-roadmap-opinions.md)
  - Opinionated triage of the idea note: what to build soon, what to delay, and what to skip.

## Documentation Rules

- Runtime-owned architecture docs belong under `frontend`, `backend`, `runtime-control`, or `cad`.
- `development` is for operational and support docs, not canonical runtime architecture.
- Historical-only notes belong under `archive/legacy`.
- See [Documentation Structure and Move Rules](./development/documentation-structure.md) for the permanent move/delete/archive policy.
