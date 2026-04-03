# AutoWire Legacy Artifacts Archive

Historical-only note. This document should not be used as the implementation guide for active AutoWire work.

Date: 2026-03-10

This note archives the legacy prototype files that previously lived under
`src/components/apps/autowire/`.

## Removed Legacy Files

- `src/components/apps/autowire/conduitroute-app.jsx`
- `src/components/apps/autowire/terminal-strip-router.jsx`
- `src/components/apps/autowire/conduitroute-ui.html`
- `src/components/apps/autowire/routing_engine.py`
- `src/components/apps/autowire/acad_connector.py`
- `src/components/apps/autowire/CONDUITROUTE-README.md`

## Why These Were Removed

- They were not imported or executed by the active Suite app runtime.
- They duplicated concepts now implemented in the typed, maintained paths:
  - `src/components/apps/conduit-route/*`
  - `backend/route_groups/api_autocad.py`
  - `backend/route_groups/api_autodraft.py`
  - `dotnet/autodraft-api-contract/*`
- Keeping both prototype and active implementations created drift risk and
  made deep-scan ownership/reliability work noisier.

## Valuable Concepts Preserved

- Obstacle layer preset unification is now maintained in:
  - `src/components/apps/conduit-route/autowirePresets.ts`
- Route quality checks and backcheck exports are maintained in:
  - `src/components/apps/conduit-route/ConduitRouteApp.tsx`
  - `src/components/apps/conduit-route/conduitRouteService.ts`
  - `backend/route_groups/api_autocad.py` (`/api/conduit-route/backcheck`)
- AutoDraft CAD-aware backcheck and execution safety are maintained in:
  - `backend/route_groups/api_autodraft.py`
  - `dotnet/autodraft-api-contract/Services/MockAutoDraftBackchecker.cs`

## Guardrail

New AutoWire improvements should be implemented only in the active typed
module stack (`conduit-route` frontend + backend route groups + .NET contract),
not by reintroducing parallel prototype UI/engine artifacts.
