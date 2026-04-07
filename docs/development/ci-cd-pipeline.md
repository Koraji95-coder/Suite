# CI/CD Pipeline and Automation Workflow

This document covers the GitHub Actions CI pipeline, local validation workflow, testing strategy, and deployment process for Suite.

## Overview

Suite uses GitHub Actions for continuous integration. The pipeline runs on every push and pull request to `main`. There is no automated production deployment step in CI — production is promoted manually after the pipeline passes.

## Pipeline Triggers

```yaml
on:
  push:
    branches: ["main"]
  pull_request:
    branches: ["main"]
```

The pipeline runs for direct pushes to `main` and for all pull requests targeting `main`.

## Pipeline Jobs

The CI workflow (`.github/workflows/ci.yml`) defines four parallel jobs, each running on `ubuntu-latest` with Node 24.

### 1. Lint & Typecheck (`check`)

```bash
npm ci
npm run check
```

`npm run check` is the composite validation command. It runs the following steps in order:

| Step | Command | Purpose |
|---|---|---|
| Docs manifest | `docs:manifest:ensure` | Regenerate or verify the developer docs manifest |
| Architecture model | `arch:ensure` | Regenerate or verify the architecture snapshot |
| Env parity | `env:check` | Verify `.env` keys match `.env.example` |
| ESLint guard | `guard:eslint` | Block use of banned patterns (ESLint config enforcement) |
| Appearance guard | `guard:appearance` | Block appearance/CSS debt regressions |
| Tailwind guard | `guard:tailwind` | Block Tailwind usage (CSS Modules only) |
| Workshop split guard | `guard:workshop-split` | Enforce workshop/feature split boundaries |
| Biome lint | `biome lint src backend dotnet scripts` | Lint all source directories |
| Typecheck | `typecheck` | TypeScript strict type check (`tsc --noEmit`) |

If docs or architecture artifacts are stale, `docs:manifest:ensure` and `arch:ensure` regenerate them automatically rather than failing. Use `docs:manifest:verify` and `arch:verify` for explicit fail-on-stale checks.

### 2. Unit Tests (`unit-tests`)

```bash
npm ci
npm run test:unit
```

Runs all Vitest unit tests. Tests are colocated with the code they cover (`*.test.ts` / `*.test.tsx` files next to implementation). All ~321 tests must pass. There are no allowed pre-existing failures.

### 3. Production Build (`build`)

```bash
npm ci
npm run build
```

Runs the frontend pipeline build (`scripts/run-frontend-pipeline.mjs build`). This validates that the production Vite build compiles without errors.

### 4. Python Smoke Tests (`python-tests`)

```bash
python -m pip install -r backend/requirements-api.lock.txt
python -m pytest \
  backend/tests/test_api_route_groups.py \
  backend/tests/test_api_work_ledger.py
```

Runs focused backend smoke tests against the Flask route layer. The Python version is read from `.python-version` at the repo root.

## Local Validation Workflow

Run this sequence in order before opening a PR or pushing to `main`:

```bash
npm ci                      # Install dependencies
npm run check               # Lint, typecheck, guards, env parity, docs/arch artifacts
npm run test:unit           # Vitest unit tests
npm run build               # Production build
```

For changes to backend route groups, also run:

```bash
npm run check:security:routes
```

This runs:
- `guard:backend-route-security` — blocks raw exception text from being echoed in route responses
- `test:python:security` — runs the full pytest security coverage across 12 backend test files

### Pre-push Composite

`check:prepush` wraps everything needed before pushing:

```bash
npm run check:prepush
# Equivalent to:
# npm run check && npm run check:security:routes && npm run guard:supabase-cli-invocation
```

`guard:supabase-cli-invocation` ensures the Windows Supabase CLI path never appears as a raw `cmd.exe /c` invocation in scripts.

## Testing Strategy

| Layer | Tool | Command | Scope |
|---|---|---|---|
| Frontend unit | Vitest + Testing Library | `npm run test:unit` | All `*.test.ts` / `*.test.tsx` in `src/` and `scripts/` |
| Backend unit | pytest | `python -m pytest backend/tests/` | All `backend/tests/test_*.py` |
| Backend security | pytest (focused) | `npm run test:python:security` | 12 security-relevant route test files |
| End-to-end | Playwright | `npm run test:e2e` | Browser-driven flows (requires auth bootstrap) |
| E2E auth bootstrap | Node script | `npm run auth:playwright:bootstrap` | Prepares Playwright auth state |
| Dashboard perf | Playwright | `npm run test:e2e:dashboard:perf` | Performance smoke test |

### Test Authoring Rules

- **Frontend tests** live colocated with the code they test (`*.test.ts` / `*.test.tsx` next to implementation).
- **Backend tests** live in `backend/tests/` as `test_api_*.py` files.
- Never use real names, company names, or machine paths in test fixtures. See the PII replacement table in `CODEX.md`.
- Test fixture paths must be repo-relative starting from `output/`, not absolute paths.

## Security Checks in CI

The `check` command includes several guard scripts that run in CI:

| Guard | Script | What It Blocks |
|---|---|---|
| `guard:eslint` | `scripts/guard-eslint.mjs` | Banned lint patterns |
| `guard:appearance` | `scripts/guard-appearance-debt.mjs` | Appearance/CSS regressions |
| `guard:tailwind` | `scripts/guard-no-tailwind.mjs` | Tailwind CSS usage |
| `guard:workshop-split` | `scripts/guard-workshop-split.mjs` | Feature boundary violations |
| `guard:backend-route-security` | `scripts/guard-backend-route-security.mjs` | Raw exception text in route responses |
| `guard:supabase-cli-invocation` | `scripts/guard-supabase-cli-invocation.mjs` | Windows CLI path injection in scripts |

Additionally, Dependabot is configured (`.github/dependabot.yml`) to keep npm, pip, Docker, NuGet, and GitHub Actions dependencies updated.

## Generated Artifacts in CI

Two generated artifacts are validated (and auto-regenerated if stale) on every CI run:

- **Developer docs manifest** — `scripts/ensure-suite-docs-manifest.mjs`
- **Architecture model** — `scripts/ensure-architecture-model.mjs`

These regenerate automatically during `npm run check`. If a PR changes docs or architecture and the manifest/snapshot needs an update, the CI run will still pass because these scripts regenerate rather than fail. The committed artifact must be kept in sync manually before pushing (`npm run docs:manifest:ensure && npm run arch:ensure`).

## Deployment Process

There is no automated deployment job in CI. Production is promoted manually after the pipeline passes:

1. The CI pipeline passes on `main`.
2. A frontend preview can be validated via the Vercel integration (see [`docs/development/vercel-frontend-preview.md`](./vercel-frontend-preview.md)).
3. Supabase schema changes are pushed with `npm run supabase:remote:push` (with `preflight` and `push:dry` first).
4. Runtime workstation deployments go through Runtime Control using `npm run workstation:bootstrap` or the Windows sign-in task.

### Supabase Schema Deployment

```bash
npm run supabase:remote:preflight    # Validate remote state before migration
npm run supabase:remote:push:dry     # Dry-run to preview changes
npm run supabase:remote:push         # Apply schema migrations to remote
```

See [`docs/development/supabase-local-hosted-workflow.md`](./supabase-local-hosted-workflow.md) for the full local/hosted Supabase workflow.

## Dependency Management

- **npm**: Dependabot opens PRs for npm updates. Pin versions carefully; run `npm run deps:check` to review available updates.
- **Python**: Locks come from `pip-compile` via `npm run deps:python:lock`, never `pip freeze`.
- **NuGet**: Dependabot covers `/dotnet` packages.
- **Docker**: Dependabot monitors base images.
- **GitHub Actions**: Dependabot pins action versions.

## Adding a New CI Check

To add a new guard to the pipeline:

1. Write the guard script under `scripts/guard-<name>.mjs` (ESM, no CommonJS).
2. Wire it into the relevant composite command in `package.json` (`check`, `check:prepush`, or `check:security:routes`).
3. Add a test or document the guard behavior in `backend/tests/` or in this file.
4. The guard will automatically run in CI on the next push.

## Related Docs

- [Supabase Local/Hosted Workflow](./supabase-local-hosted-workflow.md)
- [Vercel Frontend Preview](./vercel-frontend-preview.md)
- [Playwright Auth Bootstrap](./playwright-auth-bootstrap.md)
- [Code Scanning & Security Quality Guide](../security/code-scanning-guide.md)
- [Environment and Secrets](../security/environment-and-secrets.md)
