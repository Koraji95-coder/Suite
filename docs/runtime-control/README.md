# Runtime Control Docs

This section is the canonical home for workstation-local companion behavior, bring-up, transfer, and local action ownership.

## Code Roots

- `dotnet/Suite.RuntimeControl/*`
- workstation bootstrap and sync scripts under `scripts/*`

## Canonical Docs

- [Local Vs Container Ownership](./local-vs-container-ownership.md)
- [Windows Workstation Bring-Up](./workstation-bringup.md)
- [Workstation Transfer Runbook](./workstation-transfer-runbook.md)
- [MCP Workstation Matrix](./mcp-workstation-matrix.md)
- [Project Standards Native Review Flow](./project-standards-native-review.md)
- [Frontend Project Setup Runtime Flow](../frontend/project-setup-title-block-runtime-flow.md)

## Current Ownership Notes

- Runtime Control is the workstation-local companion layer, not just a bootstrap shell.
- Docker owns the reproducible runtime-core lane for frontend, backend, Redis, and the local Supabase slice. It does not replace machine-local ownership.
- Runtime Control owns machine-local control, workstation identity, startup tasks, Docker observability, support bundles, and local action handoff.
- Workstation switching is Git + bootstrap + workstation sync + mirror/restore. Docker improves parity and observability, but it is not the full portability story.
- Project setup local actions now terminate at Runtime Control localhost endpoints under `/api/workstation/project-setup/*`.
- Native project standards review now terminates at `/api/workstation/project-standards/run-review`.
- Folder picking is companion-owned. The old backend `/api/watchdog/pick-root` route is retired.

## Relationship To CAD

- Runtime Control owns the local HTTP boundary and workstation checks.
- CAD execution details live under [CAD](../cad/README.md).
- Project setup/title-block local CAD actions now dispatch only into the in-process `suite-cad-authoring` host.
- The named-pipe bridge is no longer part of the default Runtime Control path; keep it manual-only for explicit diagnostics against `SUITE_AUTOCAD_PIPE`.
