# Performance Baseline (Local Dev)

Date captured: March 10, 2026

- LCP: 9.42s (poor)
- INP: 264ms (needs improvement)
- CLS: 0.00 (good)

Notes:
- These values were captured from local development tooling and are directional.
- Optimization work is deferred to a dedicated performance pass with production-like profiling.

## Browser Timing Workflow

- Bootstrap auth state for protected routes with `npm run auth:playwright:bootstrap`.
- Run `npm run test:e2e:dashboard:perf` for the current Home/front-door timing pass.
- The Playwright run prints and attaches `dashboard-performance.json`.
- Home/front-door stage timings are recorded in `window.__suiteDashboardPerf` by `src/features/project-overview/dashboardPerf.ts`.
