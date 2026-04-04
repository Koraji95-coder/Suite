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
