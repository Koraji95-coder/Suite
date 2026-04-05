# Suite Agent Notes

- Before pushing or opening a PR, run `npm run check:prepush`.
- When editing files under `backend/route_groups/`, run `npm run check:security:routes` at minimum.
- `check:security:routes` is the focused backend security slice:
  - `guard:backend-route-security` blocks route responses from echoing raw exception text in the remediated route groups.
  - `test:python:security` runs the focused pytest coverage for the current CodeQL remediation tranche.
- `check:prepush` also runs `guard:supabase-cli-invocation` to keep the Windows Supabase CLI path off `cmd.exe /c`.
- When you remediate additional CodeQL alerts in other route groups, extend both `scripts/guard-backend-route-security.mjs` and `test:python:security` instead of bypassing them.
