# Stack-Trace Exposure Remediation

> **CodeQL rule:** `py/stack-trace-exposure`
>
> Raw Python exception text (`str(exc)`, `autocad_exception_message(exc)`) must
> never appear in HTTP response bodies. It leaks internal paths, class names, and
> library versions to callers.

## Strategy

| Pattern | Fix |
|---|---|
| `str(exc)` in a `jsonify()` / `_error()` HTTP response | Replace with a static, user-safe message |
| `autocad_exception_message(exc)` in an HTTP response | Replace with a static message |
| `str(exc)` used only for **logging** or **internal control flow** | Leave unchanged (not an exposure) |

All original exception details remain available server-side via
`logger.exception()` calls that were already present.

A global `@app.errorhandler(Exception)` was added to `api_server.py` as a
safety net for any unhandled exceptions that bypass route-level try/except
blocks.

## Files remediated — batch 1

| File | Instances fixed | Notes |
|---|---|---|
| `api_server.py` | +1 (global handler) | `@app.errorhandler(Exception)` fallback |
| `api_dashboard.py` | 1 | `error=str(exc)` in job state |
| `api_drawing_program.py` | 2 | `_error(str(exc), ...)` + f-string with `{exc}` |
| `api_local_learning_runtime.py` | 1 | `"message": str(exc)` in training result |
| `api_project_setup.py` | 2 | `str(exc)` + `autocad_exception_message(exc)` |
| `api_autocad_terminal_scan.py` | 1 | `"message": str(exc)` in validation error |
| `api_transmittal.py` | 1 | `"error": str(exc)` in document analysis |
| `api_transmittal_render.py` | 1 | `"message": str(exc)` in render error |
| `api_backup.py` | 7 | 3 × ValueError 400 + 4 × Exception 500 |
| `api_terminal_authoring.py` | 4 | 2 × ValueError 400 + 2 × Exception 500 |

**Total batch 1:** 20 exposure instances fixed + 1 global handler.

## Files remaining — future batches

| File | Approx. instances | Notes |
|---|---|---|
| `api_watchdog.py` | 32 | Largest single file |
| `api_batch_find_replace.py` | 14 | |
| `api_work_ledger.py` | 12 | |
| `api_automation_recipes.py` | 10 | |
| `api_autocad.py` | 32 | 10 `str(exc)` + 22 `autocad_exception_message` |
| `api_autocad_manager.py` | 6 | `autocad_exception_message` in error payloads |
| `api_autocad_terminal_route_plot.py` | 6 | `str(exc)` in warnings arrays |
| `api_autodraft.py` | 5 | |
| `api_autocad_reference_catalog.py` | 4 | 2 `str(exc)` + 2 `autocad_exception_message` |
| `watchdog/autocad_state_collector.py` | 4 | |
| `watchdog/filesystem_collector.py` | 4 | |

**Estimated remaining:** ~129 instances across 11 files.

## Non-exposure uses (kept as-is)

| File | Line | Reason |
|---|---|---|
| `api_supabase_auth.py` | 83 | String comparison (`"read timed out" in str(exc)`) — not returned to client |
| `api_autocad_error_helpers.py` | 15 | Utility function `exception_message()` — produces text for callers |
| `api_autocad_manager.py` | 215 | Used inside `logger.exception()` — server-side logging only |
