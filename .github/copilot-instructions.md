# Suite - Copilot Instructions

## Project overview

Suite is an internal operations platform for electrical engineering work.

- **Frontend:** React 19 + TypeScript + Vite (ESM only)
- **Backend:** Flask API (Python 3.14)
- **CAD integration:** .NET SDK 8+, AutoCAD Electrical plugins, COM/ActiveX bridge
- **Database:** Supabase (local dev + hosted production)
- **Runtime services:** Managed workstation lane uses Docker Compose (`frontend`, `backend`, `redis`) plus local Supabase

## Runtime lanes

- **Managed lane:** `npm run workstation:bootstrap` or Runtime Control owns lifecycle and restart.
- **Developer lane:** `npm run dev:full` is terminal-driven and should not be mixed with the managed lane.
- **Supabase:** local Supabase is CLI-managed with `npm run supabase:start|stop|status`.

## Code style

- **Linter / formatter:** Biome - never ESLint or Prettier.
- **Indentation:** Tabs.
- **Quotes:** Double quotes in JS/TS.
- **Imports:** ESM (`import`/`export`). CommonJS is banned.
- **TypeScript:** `noExplicitAny` is an error. Use `const`/`let` - `var` is banned.
- **CSS:** CSS Modules + global CSS. **No Tailwind CSS.**

## Key commands

| Task | Command |
| --- | --- |
| Full validation | `npm run check` |
| Lint only | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm run test:unit` |
| Build | `npm run build` |
| Lint + fix | `npm run check:fix` |
| Managed runtime bootstrap | `npm run workstation:bootstrap` |
| Managed runtime control panel | `npm run workstation:control-panel` |
| Dependency visibility | `npm run deps:check` |

## File layout

| Area | Path |
| --- | --- |
| Routes | `src/routes/*` |
| Feature modules | `src/features/*` |
| Shared UI | `src/components/system/*` |
| Backend API | `backend/` |
| Supabase migrations | `supabase/migrations/` |
| Scripts & tooling | `scripts/` |
| MCP server | `tools/suite-repo-mcp/server.mjs` |

## Guardrails

- No agent/chat UI in Suite - Office owns that layer.
- AutoCAD error envelope contract must be preserved: `{ success, code, message, requestId, meta }`.
- Auth flow changes require explicit approval.
- Watchdog collector startup must be verified before relying on telemetry data.
- Python locks come from `pip-compile`, not `pip freeze`.
- Runtime ownership boundaries between the managed lane and `dev:full` must be preserved.
- Generated artifacts should be verified, not hand-edited blindly.

## PII and data hygiene (CRITICAL)

**Never commit real personal names, company names, client project names, or machine-specific identifiers.** This has caused repeated cleanup work. See `CODEX.md` for the full replacement table and audit command.

Key rules:
- Use `Dev` for usernames, `Company` for company names, `MyProject` for project names, `PROJ-00001` for project numbers, and `DEV-HOME` or `DEV-WORK` for workstation IDs.
- **Test files are the biggest risk** — they contain fixture data often copied from real projects. Always check `*.test.ts`, `*.test.tsx`, and `backend/tests/test_*.py`.
- Run the PII audit grep from `CODEX.md` before every commit.
- When regenerating manifests or generated files, verify the output doesn't re-introduce PII from source docs.

## How to validate a change

Run this sequence in order before opening a PR:

1. `npm ci` — install dependencies
2. `npm run check` — lint + typecheck + guards + env parity
3. `npm run test:unit` — Vitest unit tests
4. `npm run build` — production build
5. If editing `backend/route_groups/`, also run `npm run check:security:routes`
6. Before any push: `npm run check:prepush`
7. If `npm run check` fails on docs or architecture verification, run `npm run docs:manifest:ensure` and `npm run arch:ensure` to regenerate stale artifacts, then re-run `npm run check`

## How to add a new feature

1. Create the feature module under `src/features/<feature-name>/`
2. Add a route entry under `src/routes/`
3. Write unit tests alongside the feature (colocated `*.test.ts` files)
4. Use CSS Modules for styling (never Tailwind)
5. Run the full validation sequence above

## How to add a new backend endpoint

1. Add the route in the appropriate `backend/route_groups/` file
2. Add pytest coverage in `backend/tests/`
3. Run `npm run check:security:routes` to validate security
4. Update `scripts/guard-backend-route-security.mjs` if adding a new route group

## How tests work

- **Frontend:** Vitest + Testing Library, run with `npm run test:unit`
- **Backend:** pytest, run with `python -m pytest backend/tests/`
- **E2E:** Playwright, run with `npm run test:e2e`
- Test files are the #1 source of PII leaks — always use generic data (see PII section above)

## Common mistakes Copilot should avoid

- Don't use absolute Windows paths in test fixtures — use relative paths from `output/`
- Don't add ESLint, Prettier, or Tailwind — this repo uses Biome and CSS Modules exclusively
- Don't mix the managed lane (`workstation:bootstrap`) with the dev lane (`dev:full`)
- Don't hand-edit generated manifests — regenerate via `npm run docs:manifest:ensure` or `npm run arch:ensure` and verify the output

