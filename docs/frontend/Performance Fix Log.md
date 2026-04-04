# Performance Fix Log

This is the running log for frontend performance and diagnostics fixes. Append future dates here instead of creating one-off notes.

## 2026-04-04

- Replaced the global Google Fonts dependency with self-hosted Fontsource assets for `Plus Jakarta Sans` and `IBM Plex Mono`, removing the render-blocking `/css2` request from the app shell.
- Added `npm run browser:dev:clean` so clean performance traces can run without Jam, React Developer Tools, Honorlock, or other extension noise polluting DevTools.
- Split `Landing`, `Home`, `Draft`, and `Review` into separate lazy route chunks instead of keeping them in the main app bundle.
- Added route-family warmup and login-time preload for the shell and home route to reduce first-hit navigation cost after sign-in.
- Added dev-only console helpers:
  - `window.__suiteLogs.get()`
  - `window.__suiteDiagnostics.get()`
- Added Jam metadata snapshots so shared Jams include small, useful app context without dumping full app state.
- Fixed the Standards Checker reference catalog request so it sends auth and no longer throws the frontend `401` seen on `/api/autocad/reference/standards`.
- Added `name` attributes to Standards Checker and Drawing List Manager form controls that were triggering the DevTools "form field should have an id or name attribute" warnings.
