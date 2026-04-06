# Suite Docs Index

This is the canonical entry point for repository documentation. People and tooling should start here, then move into the owning section README before drilling into individual notes.

## Runtime Sections

- [Frontend](./frontend/README.md)
  - Browser flows, app-owned architecture, and UI/runtime ownership notes.
- [Backend](./backend/README.md)
  - Hosted-core Python APIs, route groups, and service/domain ownership.
- [Runtime Control](./runtime-control/README.md)
  - Workstation-local companion, bring-up, transfer, MCP workstation stamping, and local action ownership.
- [CAD](./cad/README.md)
  - AutoCAD execution, `suite-cad-authoring` ownership, Drawing Cleanup, and bridge diagnostic references.

## Domain Sections

- [AutoDraft](./autodraft/README.md)
  - Architecture, execute cutover, rules, and reference materials.

## Support Sections

- [Development](./development/README.md)
  - Operational runbooks, repo hygiene, docs structure rules, and local/hosted workflow support.
- [Security](./security/README.md)
  - Auth architecture, passkey rollout, secrets, and Supabase hardening.
- [Legacy Archive](./archive/legacy/README.md)
  - Historical-only notes that should not guide active implementation work.

## Current High-Signal Docs

- [Project Architecture](./frontend/project-architecture.md)
- [Workflow Architecture](./frontend/workflow-architecture.md)
- [Windows Workstation Bring-Up](./runtime-control/workstation-bringup.md)
- [MCP Workstation Matrix](./runtime-control/mcp-workstation-matrix.md)
- [Performance Insights](<./frontend/Performance Insights.md>)
- [Code Scanning & Security Quality Guide](./security/code-scanning-guide.md)
- [Docker Image Vulnerability Remediation](./security/docker-image-vulnerability-remediation.md)

## Project Structure

Key directories at a glance:

| Path | Purpose |
|---|---|
| `src/routes/*` | Route entry points, redirects, audience gating, and shell composition |
| `src/features/*` | Active product and workflow feature modules |
| `src/components/system/*` | Shared UI components and base controls |
| `src/services/*` | Browser-owned adapters and caches |
| `src/lib/*` | Shared utilities (ID generation, secure random, etc.) |
| `backend/` | Flask API server, route groups, and domain services |
| `backend/route_groups/` | Individual API surface files |
| `backend/domains/` | Domain-specific backend services |
| `backend/tests/` | Python pytest test suite |
| `dotnet/Suite.RuntimeControl/` | Workstation-local companion app |
| `dotnet/suite-cad-authoring/` | In-process AutoCAD Electrical action host |
| `dotnet/autodraft-api-contract/` | AutoDraft contract support |
| `supabase/migrations/` | Database schema migrations |
| `scripts/` | Tooling, guard scripts, and code-generation helpers |
| `tools/` | MCP server and dev tooling |
| `output/` | Generated artifacts (regression fixtures, manifests) |
| `docs/` | This documentation tree |

## Quick Start

See the [root README](../README.md) for full prerequisites and install steps. The short version:

### Prerequisites

- Node.js + npm
- Python 3.9+ (version pinned in `.python-version`)
- .NET SDK 8+
- Windows workstation for live AutoCAD flows

### Install

```bash
npm install
python -m pip install -r backend/requirements-api.lock.txt
dotnet restore dotnet/Suite.RuntimeControl/Suite.RuntimeControl.csproj
```

### Environment

```bash
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux
npm run env:sync
```

Minimum required variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_KEY`, `API_KEY`.

### Startup

Use one lane at a time — do not mix them on the same machine:

| Lane | Command | When to use |
|---|---|---|
| Native dev | `npm run dev:full` | Active frontend/backend coding |
| Managed workstation | `npm run workstation:bootstrap` | Managed runtime, same path as Runtime Control |

### Validate

```bash
npm run check         # lint + typecheck + guards
npm run test:unit     # Vitest unit tests
npm run build         # production build
```

## Contributing

### Code Style

- **Linter / formatter:** Biome only — never ESLint or Prettier.
- **Indentation:** Tabs.
- **Quotes:** Double quotes in JS/TS.
- **Imports:** ESM (`import`/`export`). CommonJS is banned.
- **TypeScript:** `noExplicitAny` is an error. Use `const`/`let` — `var` is banned.
- **CSS:** CSS Modules + global CSS. No Tailwind.
- **Randomness:** Use `localId()` from `src/lib/localId.ts` for IDs. Never `Math.random()`.
- **No agent/chat UI** in Suite — Office owns that layer.

### Testing

- Frontend tests use Vitest + Testing Library. Run with `npm run test:unit`.
- Backend tests use pytest. Run with `python -m pytest backend/tests/`.
- Colocate unit tests as `*.test.ts` / `*.test.tsx` files alongside implementation code.
- When adding backend routes, add pytest coverage and run `npm run check:security:routes`.

### PII Hygiene (Critical)

**Never commit real names, company names, client project names, or machine identifiers.** Use these generic values in all files — especially test fixtures:

| Type | Use instead |
|---|---|
| Username | `Dev` |
| Company name | `Company` |
| Project name | `MyProject` |
| Project number | `PROJ-00001` |
| Workstation ID | `DEV-HOME` or `DEV-WORK` |
| Email | `dev@example.com` |

Run the PII audit from [CODEX.md](../CODEX.md) before every commit.

### Backend Routes

- All routes must return the error envelope: `{ success, code, message, requestId, meta }`.
- Never echo raw exception text in responses.
- After route changes, run `npm run check:security:routes`.

### Before Every PR

1. `npm run check` — lint + typecheck + guards
2. `npm run test:unit` — unit tests
3. `npm run build` — production build
4. Run the PII audit grep from [CODEX.md](../CODEX.md)
5. Run `npm run check:prepush`

See [CODEX.md](../CODEX.md) for the full agent and contributor guidance.

## Documentation Rules

- Runtime-owned architecture docs belong under `frontend`, `backend`, `runtime-control`, or `cad`.
- `development` is for operational and support docs, not canonical runtime architecture.
- Historical-only notes belong under `archive/legacy`.
- See [Documentation Structure and Move Rules](./development/documentation-structure.md) for the permanent move/delete/archive policy.
