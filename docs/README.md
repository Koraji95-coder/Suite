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
- [CI/CD Pipeline and Automation Workflow](./development/ci-cd-pipeline.md)
- [Code Scanning & Security Quality Guide](./security/code-scanning-guide.md)
- [Docker Image Vulnerability Remediation](./security/docker-image-vulnerability-remediation.md)

## Project Structure

The repository is organized as follows:

```
Suite/
├── src/                        # Frontend source (React 19 + TypeScript + Vite)
│   ├── routes/                 # Route entry points, redirects, and shell composition
│   ├── features/               # Active product and workflow feature slices
│   ├── components/system/      # Shared UI component library
│   ├── services/               # Browser-side adapters and caches
│   └── lib/                    # Shared utility modules (auth, crypto, etc.)
├── backend/                    # Flask API (Python)
│   ├── route_groups/           # Flask route group modules
│   ├── domains/                # Domain logic (project setup, standards, etc.)
│   ├── tests/                  # Backend pytest test suite
│   └── api_server.py           # Flask application entry point
├── dotnet/                     # .NET SDK 8+ companion apps
│   ├── Suite.RuntimeControl/   # Workstation-local companion app
│   ├── suite-cad-authoring/    # In-process AutoCAD Electrical actions
│   └── autodraft-api-contract/ # AutoDraft API contract support
├── scripts/                    # ESM build, guard, and tooling scripts
├── supabase/                   # Supabase schema migrations and local config
├── docs/                       # Repository documentation (you are here)
├── tools/                      # Internal tooling (MCP server, diagnostics)
├── tests/                      # End-to-end Playwright tests
├── output/                     # Generated fixtures and staged artifacts (repo-relative)
├── docker/                     # Docker Compose and container config
├── .github/                    # GitHub Actions workflows and Dependabot config
├── package.json                # npm scripts and frontend dependencies
└── CODEX.md                    # Agent guidance — read before writing any code
```

Key layout rules:

- Feature code goes in `src/features/<name>/`. Do not put workflow logic in route files.
- Shared UI components belong in `src/components/system/`, not scattered across features.
- Backend route handlers live in `backend/route_groups/`. Domain logic lives in `backend/domains/`.
- Scripts under `scripts/` use ESM only (`import`/`export`). CommonJS is banned.
- Generated artifacts (docs manifest, architecture snapshot) live under `src/routes/*/generated/` and are regenerated via `npm run docs:manifest:ensure` and `npm run arch:ensure`. Never hand-edit them.

## Contributing

### Before You Start

1. Read [`CODEX.md`](../CODEX.md) — it covers PII hygiene, code quality rules, and recurring agent mistakes that have required cleanup.
2. Understand the [Documentation Structure and Move Rules](./development/documentation-structure.md) before adding or moving any docs.

### Code Style

- **Formatter / linter:** Biome only. Never ESLint or Prettier.
- **Indentation:** Tabs.
- **Quotes:** Double quotes in JS/TS.
- **Imports:** ESM (`import`/`export`). CommonJS is banned.
- **TypeScript:** `noExplicitAny` is an error. Use `const`/`let` — `var` is banned.
- **CSS:** CSS Modules + global CSS. No Tailwind.

### Validation Sequence

Run this in order before opening a PR:

```bash
npm ci                          # Install dependencies
npm run check                   # Lint, typecheck, guards, env parity, docs/arch artifacts
npm run test:unit               # Vitest unit tests
npm run build                   # Production build
npm run check:prepush           # Final pre-push composite (includes security guards)
```

For changes to backend route groups, also run:

```bash
npm run check:security:routes
```

See [CI/CD Pipeline and Automation Workflow](./development/ci-cd-pipeline.md) for the full pipeline reference.

### Branching and Pull Requests

- Branch from `main` for all changes.
- Keep PRs focused — one feature or fix per PR.
- All CI jobs (lint/typecheck, unit tests, production build, Python smoke tests) must pass before merging.
- Never push directly to `main`; open a PR and request review.

### Adding a New Feature (Frontend)

1. Create the feature module under `src/features/<feature-name>/`.
2. Add a route entry under `src/routes/`.
3. Write colocated unit tests (`*.test.ts` / `*.test.tsx` next to implementation).
4. Use CSS Modules for all styling.
5. Run the full validation sequence above.

### Adding a New Backend Endpoint

1. Add the route handler in the appropriate `backend/route_groups/` file.
2. Add pytest coverage in `backend/tests/`.
3. Run `npm run check:security:routes` to validate security.
4. All routes must return the error envelope: `{ success, code, message, requestId, meta }`.
5. Never echo raw exception text in route responses.

### PII Hygiene (Critical)

Never commit real personal names, company names, client project names, or machine-specific paths. Use generic replacements:

| Real value type | Use instead |
|---|---|
| Usernames / display names | `Dev`, `Dev User` |
| Company names | `Company` |
| Client project names | `MyProject` |
| Project numbers | `PROJ-00001` |
| Workstation IDs | `DEV-HOME` or `DEV-WORK` |
| Email addresses | `dev@example.com` |

Run the PII audit grep from `CODEX.md` before every commit. **Test fixtures are the highest-risk files.**

### Documentation Changes

- Runtime-owned architecture docs belong under `frontend`, `backend`, `runtime-control`, or `cad`.
- Operational and support docs belong under `development`.
- Security docs belong under `security`.
- Historical-only notes belong under `archive/legacy`.
- Never leave "moved" stubs in active sections — update all links in the same tranche.

## Documentation Rules

- Runtime-owned architecture docs belong under `frontend`, `backend`, `runtime-control`, or `cad`.
- `development` is for operational and support docs, not canonical runtime architecture.
- Historical-only notes belong under `archive/legacy`.
- See [Documentation Structure and Move Rules](./development/documentation-structure.md) for the permanent move/delete/archive policy.
