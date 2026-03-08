# Playwright Auth Bootstrap

Use this when automation needs access to protected `/app/*` routes without
manual login.

## What it does

- Creates a temporary Supabase user (email-confirmed).
- Generates and verifies a magic-link token server-side.
- Writes Playwright storage state with `suite-auth` localStorage session.

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

Optional origin override:

```bash
node scripts/bootstrap-playwright-auth-state.mjs --origin http://127.0.0.1:4173
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

## Notes

- If your frontend origin is `127.0.0.1`, include that exact origin in bootstrap.
- If backend URL envs point to a different host than the frontend origin, browser
  CORS may block AutoDraft API calls. Keep frontend/backend hosts aligned for UI
  demo runs.
