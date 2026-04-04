# AutoDraft Color Semantics TODO

Date: 2026-03-06

## Current State
- Implemented `green => DELETE` and `red => ADD` across:
  - Frontend seed/demo rules
  - Python fallback planner (`/api/autodraft/plan`)
  - .NET contract planner
- Implemented conflict policy:
  - `green + text containing "add"` => manual review
  - `red + text containing "delete"` => manual review
- Added shared seed spec and parity tests.

## Remaining TODO
- [x] Run manual acceptance in AutoDraft Studio UI and verify rule cards/demo output.
- [x] Run manual API acceptance for Python fallback planner with 4 cloud scenarios.
  - green + neutral text => `DELETE` / `proposed`
  - red + neutral text => `ADD` / `proposed`
  - green + `add ...` => `UNCLASSIFIED` / `review`
  - red + `delete ...` => `UNCLASSIFIED` / `review`
- [x] Run manual API acceptance for .NET planner with the same 4 scenarios.
- [x] Decide whether to keep escaped icon literals in UI (`\u{...}`) or switch back to direct Unicode glyphs. Decision: keep escaped literals for ASCII-safe source and cross-shell/editor stability.
- [x] Add .NET AutoDraft test project to CI command list.
- [x] Run broader backend test suite after unrelated pre-existing failures are handled.

## Run Notes (2026-03-06)
- AutoDraft Studio UI acceptance completed via authenticated Playwright session:
  - Route access verified at `/app/developer/labs/autodraft-studio`.
  - Rule Library tab verified with swapped mappings and icons:
    - `🟢 DELETE` with action `Remove all geometry inside the cloud boundary`
    - `🔴 ADD` with action `Add geometry drawn inside red cloud to model`
  - Expanded rule cards verified examples:
    - DELETE examples include `Green cloud around area`, `Green X through element`
    - ADD examples include `Red cloud with new linework`, `Red arrow to insertion`
  - Demo run output verified:
    - `Source: python-local-rules`
    - `4 actions, 4 classified, 0 manual review.`
- Python fallback planner manual acceptance run completed with all 4 expected outcomes via `/api/autodraft/plan` test-client calls.
- .NET planner manual API acceptance run completed with all 4 expected outcomes via `POST /api/autodraft/plan`.
- Local runtime note:
  - Projects now target `net8.0`; no `DOTNET_ROLL_FORWARD=Major` workaround is required for AutoDraft contract execution.
  - Installed runtimes detected locally (at the time of validation): `8.0.21`, `8.0.24`, `10.0.3`.
- Added Command Center preset:
  - `dotnet test dotnet/autodraft-api-contract.Tests/AutoDraft.ApiContract.Tests.csproj -v minimal`
- Broader backend sweep:
  - `PYTHONPATH=. python -m unittest discover backend/tests`
  - Result: `Ran 323 tests ... OK`

## Validation Completed
- `npm run typecheck`
- `npx vite build`
- `python -m pytest backend/tests/test_api_route_groups.py -k autodraft -q`
- `python -m pytest backend/tests/test_api_autodraft_seed_parity.py -q`
- `dotnet build dotnet/autodraft-api-contract/AutoDraft.ApiContract.csproj -v minimal /p:OutputPath=C:\Temp\autodraft-build-out\ /p:IntermediateOutputPath=C:\Temp\autodraft-obj-out\`
- `dotnet test dotnet/autodraft-api-contract.Tests/AutoDraft.ApiContract.Tests.csproj -v minimal`

## Key Files
- `src/features/autodraft-studio/ui/autodraftData.ts`
- `src/features/autodraft-studio/ui/AutoDraftStudioApp.tsx`
- `backend/route_groups/api_autodraft.py`
- `backend/tests/test_api_route_groups.py`
- `backend/tests/test_api_autodraft_seed_parity.py`
- `docs/autodraft/rule_seed_spec.json`
- `dotnet/autodraft-api-contract/Services/RuleBasedAutoDraftPlanner.cs`
- `dotnet/autodraft-api-contract.Tests/RuleBasedAutoDraftPlannerTests.cs`
