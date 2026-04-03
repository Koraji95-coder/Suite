# Playwright Auth Bootstrap

Use this when automation needs access to protected `/app/*` routes without
manual login.

## What it does

- Creates a temporary Supabase user (email-confirmed).
- Generates and verifies a magic-link token server-side.
- Writes Playwright storage state with `suite-auth` localStorage session.
- Seeds a display name so protected routes do not stop on the first-login name prompt.

Default output:

- `output/playwright/auth-state.json`
- `output/playwright/auth-state.meta.json`

## Prerequisites

Set these env vars (or keep them in `.env`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (or `VITE_SUPABASE_ANON_KEY`)

## Usage

```bash
npm run auth:playwright:bootstrap
```

By default this now writes auth state for:

- Playwright's configured base URL origin (`http://localhost:4173` / `http://127.0.0.1:4173` unless overridden)
- Common Vite dev origins (`http://localhost:5173` / `http://127.0.0.1:5173`)

Optional origin override:

```bash
node scripts/bootstrap-playwright-auth-state.mjs --origin http://127.0.0.1:4173
```

Optional display-name override:

```bash
node scripts/bootstrap-playwright-auth-state.mjs --display-name "Suite E2E"
```

Multiple origins:

```bash
node scripts/bootstrap-playwright-auth-state.mjs \
  --origin http://localhost:5173 \
  --origin http://127.0.0.1:5173
```

## Use With Playwright CLI

```bash
npx --yes --package @playwright/cli playwright-cli open http://localhost:5173/
npx --yes --package @playwright/cli playwright-cli state-load output/playwright/auth-state.json
npx --yes --package @playwright/cli playwright-cli goto http://localhost:5173/app/apps/autodraft-studio
```

## Use With Repo Tests

```bash
npm run auth:playwright:bootstrap
npx playwright test tests/e2e/authenticated-shell.spec.ts
```

Dashboard timing pass:

```bash
npm run auth:playwright:bootstrap
npm run test:e2e:dashboard:perf
```

## Notes

- If your frontend origin is `127.0.0.1`, include that exact origin in bootstrap.
- If backend URL envs point to a different host than the frontend origin, browser
  CORS may block AutoDraft API calls. Keep frontend/backend hosts aligned for UI
  demo runs.
