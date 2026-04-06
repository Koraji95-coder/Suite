# Suite Agent Notes

- Before pushing or opening a PR, run `npm run check:prepush`.
- When editing files under `backend/route_groups/`, run `npm run check:security:routes` at minimum.
- `check:security:routes` is the focused backend security slice:
  - `guard:backend-route-security` blocks route responses from echoing raw exception text in the remediated route groups.
  - `test:python:security` runs the focused pytest coverage for the current CodeQL remediation tranche.
- `check:prepush` also runs `guard:supabase-cli-invocation` to keep the Windows Supabase CLI path off `cmd.exe /c`.
- When you remediate additional CodeQL alerts in other route groups, extend both `scripts/guard-backend-route-security.mjs` and `test:python:security` instead of bypassing them.

## Before every commit

- Run `npm run check:prepush` — this covers lint, typecheck, guards, and the Supabase CLI path check.
- Run the PII audit grep from `CODEX.md` and confirm zero results before committing any file.

## Build and test sequence

Run in order:

1. `npm ci`
2. `npm run check`
3. `npm run test:unit`
4. `npm run build`

If `npm run check` fails on docs or architecture artifacts, run `npm run docs:manifest:ensure` and `npm run arch:ensure`, then re-run `npm run check`.

## When editing backend routes

- Add the route in the appropriate `backend/route_groups/` file.
- Add pytest coverage in `backend/tests/`.
- Run `npm run check:security:routes` after any route changes.
- All routes must return the error envelope: `{ success, code, message, requestId, meta }`.
- Never echo raw exception text in route responses.
- If adding a new route group, extend `scripts/guard-backend-route-security.mjs` and the `test:python:security` pytest scope.

## When editing frontend features

- Feature code goes in `src/features/<name>/`.
- Route entries go in `src/routes/`.
- Shared UI components go in `src/components/system/`.
- Use CSS Modules for all styling — never Tailwind.
- Colocate unit tests as `*.test.ts` / `*.test.tsx` files next to the implementation.
- ESM imports only — CommonJS is banned.
- `noExplicitAny` is an error — always type explicitly.

## Python backend

- Dependency locks come from `pip-compile`, never `pip freeze`.
- Run tests with `python -m pytest backend/tests/`.
- Python version is pinned in `.python-version` at the repo root — use it.

## Generated artifacts

- Never hand-edit generated manifests or architecture snapshots.
- Regenerate with `npm run docs:manifest:ensure` and `npm run arch:ensure`, then verify the output.

## Critical PII hygiene

See `CODEX.md` for the full replacement table and audit grep command.

**Test fixtures are the biggest risk** — always use these generic values:

| Real value type | Use instead |
| --- | --- |
| Usernames | `Dev` |
| Company names | `Company` |
| Project names | `MyProject` |
| Project numbers | `PROJ-00001` |
| Workstation IDs | `DEV-HOME` or `DEV-WORK` |

Run the PII audit grep from `CODEX.md` before committing any test file change.
