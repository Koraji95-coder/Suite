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
- [ ] Run manual acceptance in AutoDraft Studio UI and verify rule cards/demo output.
- [ ] Run manual API acceptance for Python fallback planner with 4 cloud scenarios:
  - green + neutral text => `DELETE` / `proposed`
  - red + neutral text => `ADD` / `proposed`
  - green + `add ...` => `UNCLASSIFIED` / `review`
  - red + `delete ...` => `UNCLASSIFIED` / `review`
- [ ] Run manual API acceptance for .NET planner with the same 4 scenarios.
- [ ] Decide whether to keep escaped icon literals in UI (`\u{...}`) or switch back to direct Unicode glyphs.
- [ ] Add .NET AutoDraft test project to CI command list.
- [ ] Run broader backend test suite after unrelated pre-existing failures are handled.

## Validation Completed
- `npm run typecheck`
- `npx vite build`
- `python -m pytest backend/tests/test_api_route_groups.py -k autodraft -q`
- `python -m pytest backend/tests/test_api_autodraft_seed_parity.py -q`
- `dotnet build dotnet/autodraft-api-contract/AutoDraft.ApiContract.csproj -v minimal /p:OutputPath=C:\Temp\autodraft-build-out\ /p:IntermediateOutputPath=C:\Temp\autodraft-obj-out\`
- `dotnet test dotnet/autodraft-api-contract.Tests/AutoDraft.ApiContract.Tests.csproj -v minimal`

## Key Files
- `src/components/apps/autodraft-studio/autodraftData.ts`
- `src/components/apps/autodraft-studio/AutoDraftStudioApp.tsx`
- `backend/route_groups/api_autodraft.py`
- `backend/tests/test_api_route_groups.py`
- `backend/tests/test_api_autodraft_seed_parity.py`
- `docs/autodraft/rule_seed_spec.json`
- `dotnet/autodraft-api-contract/Services/RuleBasedAutoDraftPlanner.cs`
- `dotnet/autodraft-api-contract.Tests/RuleBasedAutoDraftPlannerTests.cs`
