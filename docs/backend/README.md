# Backend Docs

This section is the canonical home for hosted-core Python API and service ownership.

## Code Roots

- `backend/domains/*`
- `backend/route_groups/*`
- `backend/api_server.py`

## Canonical Docs

- [Project Setup + Title Block Runtime Flow](../frontend/project-architecture.md#project-setup-and-title-block-runtime-flow)
- [Project Standards Profile](./project-standards-profile.md)
- [Route Groups Index](../../backend/route_groups/README.md)
- [Backend API Server Pointer](../../backend/API_SERVER_README.md)
- [Local Learning Opportunities](./local-learning-opportunities.md)

## Current Ownership Notes

- Hosted core owns project setup profile persistence, signed local-action tickets, preview/planning, and local-action result receipts.
- `backend/domains/project_setup/*` and `api_project_setup.py` are now the authoritative backend slice for project setup.
- `backend/domains/project_standards/*` and `api_project_standards.py` are now the authoritative backend slice for project-scoped standards defaults, local-review ticket issuance, latest-review storage, and latest-review hydration.
- Local bridge and AutoCAD transport notes no longer live in `docs/backend`; they moved to [CAD](../cad/README.md).

## Transitional Pieces

- `api_title_block_sync.py` has been removed from the active backend route-group set.
- `/api/watchdog/pick-root` is retired; project setup root selection now belongs to the Runtime Control companion route under `/api/workstation/project-setup/pick-root`.
- Project setup and title-block browser contracts remain under `/api/project-setup/*`, while machine-local scan/open/create/apply work is ticketed into Runtime Control and the in-process CAD host.
