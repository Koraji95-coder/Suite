# Suite Docs Index

This is the canonical entry point for repository documentation. People and tooling should start here, then move into the owning section README before drilling into individual notes.

## Runtime Sections

- [Frontend](./frontend/README.md)
  - Browser flows, app-owned architecture, and UI/runtime ownership notes.
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

- [Project Architecture](./frontend/project-architecture.md)
- [Workflow Architecture](./frontend/workflow-architecture.md)
- [Windows Workstation Bring-Up](./runtime-control/workstation-bringup.md)
- [MCP Workstation Matrix](./runtime-control/mcp-workstation-matrix.md)
- [Performance Insights](<./frontend/Performance Insights.md>)
- [Code Scanning & Security Quality Guide](./security/code-scanning-guide.md)
- [Docker Image Vulnerability Remediation](./security/docker-image-vulnerability-remediation.md)

## Documentation Rules

- Runtime-owned architecture docs belong under `frontend`, `backend`, `runtime-control`, or `cad`.
- `development` is for operational and support docs, not canonical runtime architecture.
- Historical-only notes belong under `archive/legacy`.
- See [Documentation Structure and Move Rules](./development/documentation-structure.md) for the permanent move/delete/archive policy.
