# Performance Insights

Updated: 2026-04-04

This document now tracks active frontend performance follow-ups only. Items that were fixed move to [Performance Fix Log](./Performance%20Fix%20Log.md).

## Profiling Hygiene

- Use `npm run browser:dev:clean` before capturing a trace you want to act on. That opens a clean browser profile with extensions disabled.
- Treat Jam, React Developer Tools, Honorlock, and other extension frames such as `sw.js`, `content-dom-snapshot.js`, and `installHook.js` as noise unless the same issue reproduces in the clean profile.
- When Console output is noisy, use the app-owned channels instead of raw DevTools output:
  - `window.__suiteLogs.get()`
  - `window.__suiteDiagnostics.get()`

## Active Follow-ups

### Repository-wide

- Re-run a clean browser profile after the latest font and route-loading changes so the current baseline reflects the real app instead of extension noise.
- Legacy JavaScript is still worth evaluating after the baseline is refreshed. Any build-target change needs to be a deliberate browser-support decision, not a blind optimization.
- Keep watching large lazy chunks in build output. The biggest remaining candidates are feature-heavy bundles such as `exceljs`, `AutoDraftComparePanel`, and `GridPreview3D`.

### Projects

- The "Browse to find a folder" flow completes, but it still feels slow enough to warrant a clean trace and timing around the picker/ticket roundtrip before changing code.

### Drawing List Manager

- The title block profile save path can still surface a `PUT` CORS failure when requests bypass the dev proxy. Current lead: `src/features/project-setup/backendService.ts` defaults to `http://localhost:5000` instead of using the same-origin `/api` path when no override is supplied.

## Tracked Elsewhere

- Runtime Control button behavior and the "local Supabase is partially online" state are runtime-control issues, not frontend performance work.
- Docker image vulnerability notes are being tracked outside this document.