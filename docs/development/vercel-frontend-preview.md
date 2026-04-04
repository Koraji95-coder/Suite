# Vercel Frontend Preview

This repo can use Vercel for a frontend-only preview deployment.

Suggested Vercel project slug:

- `suite-ui-preview`

What this preview is for:

- UI walkthroughs
- route/layout review
- frontend sharing during private development

What this preview is not:

- a replacement for the local Python backend
- a replacement for Runtime Control
- a full hosted copy of the workstation/CAD runtime

## Config

The repo now includes a root `vercel.json` with:

- `npm ci` for install
- `npm run build` for build
- `dist` as the output directory
- a catch-all rewrite to `index.html` for SPA routes

## Expected Limits

Many Suite features still assume local or separately hosted backend/runtime services.
That means a Vercel preview can render the frontend and route chrome, but actions that depend on:

- `VITE_BACKEND_URL`
- `VITE_COORDINATES_BACKEND_URL`
- Runtime Control companion endpoints
- local CAD / workstation services

will not behave like the managed workstation lane unless you deliberately provide hosted equivalents.

## Recommended Env Vars

For a basic private preview, set these in the Vercel project:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH_REDIRECT_URL`
- `VITE_AUTH_ALLOWED_ORIGINS`

Optional:

- `VITE_TURNSTILE_SITE_KEY`
- `VITE_JAM_METADATA_ENABLED=false`

Only set backend-related vars if you intentionally have a hosted backend for the preview.

## Suggested Workflow

1. Create a new Vercel project that points at this repository root.
2. Use `suite-ui-preview` as the project slug if it is available.
3. Add the frontend auth env vars in Vercel.
4. Treat preview URLs as UI review links, not full runtime validation.
