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

## Supported Startup Lanes

- `npm run dev:full` is the native coding lane for active frontend/backend work. Frontend and backend stay local, the shared runtime-core Redis service can auto-start in Docker, and local Supabase remains explicit.
- `npm run workstation:bootstrap` is the managed workstation lane used by Runtime Control and the sign-in task. It starts local Supabase through the Supabase CLI and then the runtime-core Docker services for frontend, backend, and Redis.
- If you are in the managed lane, use Runtime Control to restart frontend/backend or reset the stack. Do not layer native `dev:full` processes on top.
- `npm run runtime:core:up` only manages the runtime-core Docker services. It does not start local Supabase by itself.
- Do not run both lanes at the same time on the same workstation.

When you are in `npm run dev:full`, restart services from the terminal instead of Runtime Control.

## Current Ownership Notes

- Runtime Control is the workstation-local companion layer, not just a bootstrap shell.
- Docker owns the reproducible runtime-core lane for frontend, backend, and Redis. Local Supabase is still Docker-managed, but it is started separately through the Supabase CLI during managed workstation bootstrap.
- The managed frontend intentionally uses a prepared preview build instead of the live Vite HMR dev server so the workstation lane stays lighter.
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
