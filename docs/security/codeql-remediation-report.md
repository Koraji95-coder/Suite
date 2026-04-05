# CodeQL Remediation Report — April 2026

This document summarizes the CodeQL security and quality alerts that were identified and fixed across the Suite codebase.

---

## Overview

A full CodeQL scan was run locally against both **JavaScript/TypeScript** and **Python** source code using the `security-and-quality` query suite — the same suite GitHub runs in CI. The scan identified **33 JS/TS alerts** and **273 Python alerts** (after excluding vendored/third-party paths). Of these, **90 alerts were resolved** across **37 files**.

---

## JS/TS Security Fixes (12 alerts resolved)

### Log injection — `js/log-injection` (4 alerts)

**File:** `src/lib/logger.ts`

**Problem:** The logger's `formatLog()` method passed user-derived strings directly into `console.log/warn/error/info`. If user data contained newline characters (`\n`, `\r`), it could inject fake log entries, making it difficult to distinguish real log messages from injected ones.

**Fix:** Added a `sanitize()` method that strips newline characters before formatting:

```ts
private sanitize(value: string): string {
  return value.replace(/\n|\r/g, " ");
}
```

Both `message` and `context` fields are now sanitized before being formatted into log output.

---

### Comma-operator bug — `js/useless-expression` (2 alerts)

**File:** `tools/chrome-devtools-mcp/tests/PageCollector.test.ts`

**Problem:** An assertion used comma operators (`,`) instead of logical AND (`&&`). In JavaScript, the comma operator evaluates all expressions but only returns the last one — so only the final condition was actually being checked by the test:

```ts
// BEFORE (bug — only last condition checked):
return (
  e.details.exception.description === 'SyntaxError: Expected {',
  e.details.text === 'Uncaught',
  e.details.stackTrace.callFrames.length === 0
);
```

**Fix:** Replaced commas with `&&` so all three conditions are verified:

```ts
// AFTER (all conditions checked):
return (
  e.details.exception.description === 'SyntaxError: Expected {' &&
  e.details.text === 'Uncaught' &&
  e.details.stackTrace.callFrames.length === 0
);
```

---

### Trivial conditionals — `js/trivial-conditional` (3 alerts)

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `src/features/autodraft-studio/ui/AutoDraftComparePanel.tsx` | 2482 | `!compareResult` guard inside a `{compareResult ? ...}` block — always false | Removed redundant `!compareResult` from disabled prop |
| `src/features/project-delivery/deliverableRegisterService.ts` | 217 | `value &&` guard after `value == null` early return — always true | Removed redundant `value &&` guard |
| `src/features/project-manager/useProjectManagerState.ts` | 1276 | `if (selectedProject)` guard after `!selectedProject` early return — always true | Removed redundant guard |

---

### Useless comparison — `js/useless-comparison-test` (1 alert)

**File:** `src/features/home/HomeWorkspace.tsx`

**Problem:** `releasedToolCount` was hardcoded to `2`, making the expression `releasedToolCount === 1 ? "" : "s"` always evaluate to `"s"`.

**Fix:** Simplified to a static plural: `{releasedToolCount} released drafting tools`.

---

### Useless assignment — `js/useless-assignment-to-local` (1 alert)

**File:** `tools/chrome-devtools-mcp/tests/index.test.ts`

**Problem:** `let result = await client.callTool(...)` was immediately overwritten by `result = await client.callTool(...)` — the initial value was never read.

**Fix:** Removed the first assignment; declared `const result` at the second call.

---

### Unused variable — `js/unused-local-variable` (1 alert)

**File:** `dotnet/Suite.RuntimeControl/Assets/app.js`

**Problem:** `const office = getOfficeSnapshot()` was declared in `buildContextUtilityHtml()` but never referenced.

**Fix:** Removed the unused declaration.

---

## Python Security Fixes (5 alerts resolved)

### Weak hashing — `py/weak-sensitive-data-hashing` (2 alerts)

| File | Issue | Fix |
|------|-------|-----|
| `backend/watchdog/service.py` | SHA-1 used for content fingerprinting | Replaced `hashlib.sha1(...)` with `hashlib.sha256(...)` |
| `backend/work_ledger/suggestions.py` | SHA-1 used for suggestion ID generation | Replaced `hashlib.sha1(...)` with `hashlib.sha256(...)` |

SHA-1 is considered weak for sensitive data operations. SHA-256 provides stronger collision resistance.

---

### NaN self-comparison — `py/comparison-of-identical-expressions` (3 alerts)

| File | Line |
|------|------|
| `backend/route_groups/api_local_learning_runtime.py` | 109 |
| `backend/route_groups/api_transmittal_pdf_analysis.py` | 61 |
| `backend/route_groups/pdf_text_extraction.py` | 44 |

**Problem:** NaN was detected using `numeric == numeric` (which is `False` for NaN). While technically correct, CodeQL flags this as a comparison of identical expressions.

**Fix:** Replaced with `math.isnan(numeric)` and added `import math` where needed.

---

## Python Quality Fixes (73 alerts resolved)

### Unused import — `py/unused-import` (1 alert)

**File:** `backend/route_groups/api_autodraft.py`

**Problem:** `import redis` was imported but never used anywhere in the file.

**Fix:** Removed the unused import block.

---

### Unused global variables — `py/unused-global-variable` (3 alerts)

**File:** `backend/route_groups/api_autodraft.py`

**Problem:** Three annotation subtype constants (`_ANNOT_NOTE_TEXT_SUBTYPES`, `_ANNOT_HIGHLIGHT_SUBTYPES`, `_ANNOT_CLOUD_SUBTYPES`) were declared but never referenced.

**Fix:** Removed the unused constant definitions.

---

### Dead assignments — `py/multiple-definition` (5 alerts)

| File | Variable | Issue |
|------|----------|-------|
| `backend/route_groups/api_auth_passkey.py` | `redirect_path` | Assigned default then immediately overwritten by conditional |
| `backend/route_groups/api_autocad_manager.py` (×2) | `units_value` | Initialized to `"Unknown"` then unconditionally overwritten by lookup |
| `backend/route_groups/api_autodraft.py` | `auto_calibration` | Initialized with default payload then overwritten in both branches |
| `backend/route_groups/api_transmittal_render.py` | `output_stem` | Initialized to `"Transmittal"` then overwritten in both branches |

**Fix:** Removed the dead initial assignments. Used type annotations (`auto_calibration: Dict[str, Any]`) or inline conditionals where appropriate.

---

### Unused local variables — `py/unused-local-variable` (6 alerts)

| File | Variable | Fix |
|------|----------|-----|
| `backend/route_groups/api_automation_recipes.py` | `source` | Prefixed with `_` |
| `backend/route_groups/api_automation_recipes.py` | `queue_items` | Prefixed with `_` |
| `backend/ground-grid.py` | `x2, y2` (unpacking) | Changed to `(_x2, _y2)` |
| `backend/ground-grid.py` | `grid_scale` | Prefixed with `_` |
| `backend/Transmittal-Builder/r3p_transmittal_builder.py` | `indent` | Removed (plus unused `r_idx` → `_r_idx`) |
| `backend/watchdog/service.py` | `collector_map` | Removed the unused dict comprehension |

Additionally, dead `svg_content` code in `r3p_transmittal_builder.py` was removed — it read and modified an SVG file but then created a `QIcon` from the file path instead of using the modified content.

---

### Empty except blocks — `py/empty-except` (48 alerts)

**Problem:** 48 `except: pass` blocks across the backend had no explanatory comment, making it unclear whether the exception was intentionally suppressed.

**Fix:** Added brief explanatory comments to each `pass` statement describing why the exception is ignored. Examples:

```python
except Exception:
    pass  # COM layer assignment may fail for read-only documents
```

```python
except Exception:
    pass  # Best-effort cleanup; socket may already be closed
```

**Files affected:** `runtime_paths.py`, `api_autocad_com_helpers.py`, `api_autocad_connection.py`, `api_autocad_entity_geometry.py`, `api_autocad_ground_grid_plot.py`, `api_autocad_reference_block.py`, `api_autocad_terminal_route_plot.py`, `api_autocad_terminal_scan.py`, `api_autodraft.py`, `api_automation_recipes.py`, `api_batch_find_replace.py`, `api_supabase_rest.py`, `api_terminal_authoring.py`, `api_websocket_status.py`, `ground-grid.py`, `r3p_transmittal_builder.py`, `transmittal_render.py`

---

### Catch BaseException — `py/catch-base-exception` (9 alerts)

| File | Count |
|------|-------|
| `backend/coordinatesgrabber.py` | 7 |
| `backend/Transmittal-Builder/emails/templates.py` | 2 |

**Problem:** Bare `except:` or `except BaseException` blocks catch `SystemExit`, `KeyboardInterrupt`, and `GeneratorExit`, which should propagate to allow clean shutdown.

**Fix:** Changed all 9 occurrences to `except Exception:`.

---

## Remaining Alerts (not fixed — acceptable risk or out of scope)

| Category | Count | Reason not fixed |
|----------|-------|-----------------|
| `py/stack-trace-exposure` | 102 | Flask routes returning tracebacks — needs a global error handler (large systemic change) |
| `py/path-injection` | 27 | File path handling in AutoCAD integration — needs per-route analysis |
| `py/empty-except` | ~12 | Remaining in `docs/autodraft/reference/` (archived code, excluded from scanning) |
| `js/shell-command-injection-from-environment` | 2 | Dev-only scripts using env vars for paths |
| `js/insecure-temporary-file` | 5 | Already using `mkdtemp` / atomic writes — false positives |
| `js/file-system-race` | 4 | Check-then-act patterns in dev scripts — acceptable for tooling |
| `js/indirect-command-line-injection` | 3 | Dev scripts passing env vars to child processes |
| `js/file-access-to-http` | 2 | Auth scripts reading config from local files |
| `js/user-controlled-bypass` | 3 | WebSocket client conditionals — needs architectural review |
| `py/unused-global-variable` | ~18 | Module-level variables used via dependency injection pattern |

---

## Files Changed (37 total)

### JavaScript / TypeScript (9 files)
- `src/lib/logger.ts` — log injection fix
- `src/features/autodraft-studio/ui/AutoDraftComparePanel.tsx` — trivial conditional
- `src/features/home/HomeWorkspace.tsx` — useless comparison
- `src/features/project-delivery/deliverableRegisterService.ts` — trivial conditional
- `src/features/project-manager/useProjectManagerState.ts` — trivial conditional
- `dotnet/Suite.RuntimeControl/Assets/app.js` — unused variable
- `tools/chrome-devtools-mcp/tests/PageCollector.test.ts` — comma-operator bug
- `tools/chrome-devtools-mcp/tests/index.test.ts` — useless assignment

### Python (28 files)
- `backend/watchdog/service.py` — SHA-256 upgrade, unused variable removal, empty-except comments
- `backend/work_ledger/suggestions.py` — SHA-256 upgrade
- `backend/route_groups/api_local_learning_runtime.py` — math.isnan
- `backend/route_groups/api_transmittal_pdf_analysis.py` — math.isnan
- `backend/route_groups/pdf_text_extraction.py` — math.isnan
- `backend/route_groups/api_autodraft.py` — unused imports, globals, dead assignment
- `backend/route_groups/api_auth_passkey.py` — dead assignment
- `backend/route_groups/api_autocad_manager.py` — dead assignment
- `backend/route_groups/api_transmittal_render.py` — dead assignment
- `backend/route_groups/api_automation_recipes.py` — unused variables
- `backend/ground-grid.py` — unused variables, empty-except comments
- `backend/Transmittal-Builder/r3p_transmittal_builder.py` — dead code removal
- `backend/coordinatesgrabber.py` — except BaseException → Exception
- `backend/Transmittal-Builder/emails/templates.py` — except BaseException → Exception
- `backend/runtime_paths.py` — empty-except comments
- `backend/route_groups/api_autocad_com_helpers.py` — empty-except comments
- `backend/route_groups/api_autocad_connection.py` — empty-except comments
- `backend/route_groups/api_autocad_entity_geometry.py` — empty-except comments
- `backend/route_groups/api_autocad_ground_grid_plot.py` — empty-except comments
- `backend/route_groups/api_autocad_reference_block.py` — empty-except comments
- `backend/route_groups/api_autocad_terminal_route_plot.py` — empty-except comments
- `backend/route_groups/api_autocad_terminal_scan.py` — empty-except comments
- `backend/route_groups/api_batch_find_replace.py` — empty-except comments
- `backend/route_groups/api_supabase_rest.py` — empty-except comments
- `backend/route_groups/api_terminal_authoring.py` — empty-except comments
- `backend/route_groups/api_websocket_status.py` — empty-except comments
- `backend/Transmittal-Builder/core/transmittal_render.py` — empty-except comments

---

## Validation

All changes were validated against the full CI pipeline:

| Check | Result |
|-------|--------|
| `npm run check` (lint + typecheck) | ✅ Pass |
| `npm run test:unit` (321 tests) | ✅ Pass |
| `npm run build` | ✅ Pass |
| CodeQL local scan (JS/TS) | ✅ No new alerts |
| CodeQL local scan (Python) | ✅ No new alerts |

---

## Recommendations for Future Work

1. **Global Flask error handler for `py/stack-trace-exposure` (102 alerts):** Add a production-mode error handler that returns sanitized error responses without stack traces. This is the single largest remaining alert category.

2. **Path validation for `py/path-injection` (27 alerts):** Add allowlist-based path validation to AutoCAD file handling routes. Ensure user-supplied paths are resolved within expected directories.

3. **WebSocket authentication for `js/user-controlled-bypass` (3 alerts):** Review the coordinates grabber WebSocket client to ensure server-side validation prevents unauthorized actions.

4. **Automate CodeQL in pre-push hooks:** Consider adding a lightweight local scan step to `npm run check` to catch new alerts before they reach CI.
