# AutoDraft Studio — Full Code Review & Enhancement Plan (v2)

## Files Reviewed

| File | Lines | Role |
|------|-------|------|
| `api_autodraft.py` | 8,170 | Flask backend — all `/api/autodraft/*` endpoints |
| `autodraftService.ts` | 2,315 | Frontend API client, normalizers, types |
| `AutoDraftComparePanel.tsx` | 3,220 | Compare/calibrate UI |
| `AutoDraftStudioApp.tsx` | 918 | Main app shell, tabs, demo panel |
| `autodraftData.ts` | ~180 | Types, rule library, constants |
| `pdfToCadGeometry.ts` | ~350 | Arc detection, dead-end extension |
| `AutoDraftStudioApp.module.css` | ~400 | Shared CSS module |
| `AutoDraftComparePanel_test.tsx` | 1,723 | Compare panel tests |
| `autodraftService_test.ts` | 1,103 | Service layer tests |
| `agentService.ts` | 2,949 | Agent bridge service (Draftsmith/GridSage) |
| `fetchWithTimeout.ts` | ~190 | Fetch wrapper with timeout/abort/error typing |
| `logger.ts` | ~150 | Singleton logger with history ring buffer |
| `Button.tsx` + CSS | ~250 | Button primitive |
| `Panel.tsx` + CSS | ~200 | Panel/card primitive |
| `Stack.tsx` + CSS | ~230 | Flex layout primitive |
| `Text.tsx` + CSS | ~250 | Typography primitive |
| `Badge.tsx` + CSS | ~220 | Badge/status indicator primitive |

---

## Remaining Files Needed

These are the only gaps left. Everything below is imported but wasn't provided:

### Still Missing
- **`agentProfiles.ts`** — `AGENT_PROFILE_IDS`, `AgentProfileId`, `DEFAULT_AGENT_PROFILE`, `getAgentModelCandidates`. Needed to verify "draftsmith" and "gridsage" profiles are properly defined.
- **`agentPromptPacks.ts`** — `AgentPromptMode`, `buildPromptForProfile`. Controls what prompt wrapping happens for crew review.
- **`secureTokenStorage.ts`** — Token persistence layer for agent pairing.
- **`api_autocad_error_helpers.py`** — `build_error_payload`, `derive_request_id`. Used by every error response.
- **`api_local_learning_runtime.py`** — `get_local_learning_runtime`. Controls the local ML model for markup classification.
- **`pdf_text_extraction.py`** — OCR and text extraction from PDF pages. Critical for compare/prepare.
- **`@/lib/utils.ts`** — The `cn()` classname merge utility used by all primitives.

### Nice to Have
- **`userSettings.ts`** — `loadSetting`, `saveSetting`, `deleteSetting` for agent pairing persistence.
- **`.NET Execution API`** — The C# service that receives proxied `/api/autodraft/execute` calls.

---

## Bugs Found

### Bug 1 — CRITICAL: Compare Panel renders outside tab system
**File:** `AutoDraftStudioApp.tsx`, line 662
**Severity:** High — UX confusion
**Issue:** `<AutoDraftComparePanel />` is rendered after the tab content blocks but is NOT gated by any `activeTab` condition. It always renders regardless of which tab is selected. There's also no "compare" tab in the TABS array.
**Fix:**
```tsx
// Add to TABS array:
{ id: "compare", label: "Compare", icon: "⬡" }

// Gate the component:
{activeTab === "compare" && <AutoDraftComparePanel />}
```

### Bug 2 — CRITICAL: .NET proxy doesn't forward auth headers
**File:** `api_autodraft.py`, `_proxy_json()` lines 338-370
**Severity:** High — Security/functionality
**Issue:** When proxying to the .NET API, no authentication headers are forwarded. The `requests.request()` call sends raw JSON without any API key or bearer token. If the .NET API requires auth (which it should), all proxied requests will fail with 401.
**Fix:**
```python
def _proxy_json(*, base_url, method, path, timeout_seconds, payload=None, headers=None):
    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
    request_headers = headers or {}
    # Forward the original API key or use a service token
    if request and request.headers.get("X-API-Key"):
        request_headers["X-API-Key"] = request.headers["X-API-Key"]
    response = requests.request(method=method.upper(), url=url, json=payload,
                                timeout=timeout_seconds, headers=request_headers)
```

### Bug 3 — Type mismatch in normalizeMarkupReviewItem
**File:** `autodraftService.ts`, line 1540
**Severity:** Low — TypeScript type safety
**Issue:** Returns `undefined` for `markup_id` when type declares `string | null`. The value passes through but breaks strict null checking.
**Fix:** `markup_id: typeof value.markup_id === "string" ? value.markup_id : null,`

### Bug 4 — extractAgentResponseText dumps raw JSON to user
**File:** `AutoDraftStudioApp.tsx`, line 103
**Severity:** Medium — UX
**Issue:** When the agent response object doesn't have any of the expected keys (`response`, `reply`, `output`, `message`), the function falls back to `JSON.stringify(data)`. This renders raw JSON in the crew review panel's `<pre>` block.
**Fix:** Return `"Agent returned a response in an unexpected format."` instead, or attempt to extract nested content more carefully.

### Bug 5 — toInt silently clamps negatives to 0
**File:** `autodraftService.ts`, line 558
**Severity:** Medium — Data correctness
**Issue:** `Math.max(0, Math.round(parsed))` means translation offsets, negative error codes, or any legitimate negative value from the backend becomes 0. The `calibration.translation` point uses `toPoint()` which avoids this, but any field using `toInt` (like `locked_layer_count`, `rotation_deg` via other paths) is affected.

### Bug 6 — Backend `_build_local_plan` summary counts semantic matches as "needs_review"
**File:** `api_autodraft.py`, lines 1116-1117
**Severity:** Medium — Misleading metrics
**Issue:** The summary's `classified` count only checks for `item["rule_id"]`, but semantically inferred actions (from `_infer_semantic_category`) have `rule_id = None` even though they are classified. They get counted as `needs_review` even when they have a valid category and decent confidence.
**Fix:** Also count actions where `category != "UNCLASSIFIED"` and `confidence > 0` as classified.

### Bug 7 — Missing error boundaries
**File:** `AutoDraftStudioApp.tsx`
**Severity:** Medium — Resilience
**Issue:** No React error boundaries wrap `AutoDraftComparePanel` or the demo panel. If PDF.js throws during rendering (corrupt PDF, missing worker, etc.), the entire page crashes. The 3,220-line Compare Panel is especially vulnerable.

### Bug 8 — isRuleCategory uses `in` on prototype chain
**File:** `autodraftService.ts`, line 530
**Severity:** Low — Defensive coding
**Issue:** `value.toUpperCase() in FALLBACK_RULE_BY_CATEGORY` — the `in` operator checks the prototype chain. If someone somehow passes `"constructor"` or `"toString"`, it would return true. Use `Object.hasOwn(FALLBACK_RULE_BY_CATEGORY, value.toUpperCase())` instead.

### Bug 9 — Logger singleton uses `import.meta.env.DEV` at construction time
**File:** `logger.ts`, line 31
**Severity:** Low — Testing
**Issue:** `this.isDevelopment = import.meta.env.DEV` is evaluated once at singleton creation. This makes it impossible to toggle log verbosity in tests or change behavior at runtime. The value is frozen for the lifetime of the module.

### Bug 10 — Backend bare `except Exception` swallows all errors in PDF stream seek
**File:** `api_autodraft.py`, lines 7038-7041
**Severity:** Low — Debugging difficulty
**Issue:** `try: uploaded_pdf.stream.seek(0) except Exception: pass` — this silently swallows errors including `PermissionError`, `OSError`, or memory issues. At minimum, log the exception.

---

## Architecture Issues

### Issue 1: AutoDraftComparePanel is 3,220 lines
This is the single biggest maintainability problem. One component handles: PDF upload and rendering, canvas pan/zoom/click, calibration point management, ROI selection, markup extraction, rule engine integration, replacement tuning, review queue rendering, feedback submission, learning model management, and bundle export.

**Recommended decomposition:**
- `CompareCanvasViewport` — PDF rendering, pan/zoom, point/ROI placement
- `CompareCalibrationPanel` — Calibration point inputs, seed display, tuning sliders
- `CompareReviewQueue` — Replacement review items, candidate radio selection
- `CompareMarkupReview` — Markup classification review, learning feedback
- `CompareFeedbackManager` — Export/import feedback, reviewed run bundles
- `CompareLearningPanel` — Train, list models, show evaluations
- `useCompareWorkflow` hook or context for shared state

### Issue 2: Shared CSS module coupling
`AutoDraftComparePanel.tsx` imports from `AutoDraftStudioApp.module.css`. This creates a dependency where changes to the studio app's styles can break the compare panel. The compare panel deserves its own CSS module.

### Issue 3: 16+ useState calls in main app
The demo panel manages plan/execute/backcheck/crew review state with independent `useState` hooks. Resetting downstream state (crew review when backcheck reruns) is manual and error-prone. A `useReducer` or state machine would model the workflow more accurately.

### Issue 4: Backend is 8,170 lines in one file
The `api_autodraft.py` file contains: PDF parsing, color extraction, markup classification, rule matching, calibration math (similarity transforms), replacement scoring, backcheck logic, feedback persistence (SQLite), learning model integration, agent pre-review orchestration, and all route handlers. This should be split into focused modules.

### Issue 5: Empty readme.md
Zero documentation for what is clearly a complex system with non-obvious domain logic (Bluebeam markup conventions, PDF annotation dictionaries, CAD coordinate systems).

---

## Backend–Frontend Contract Observations

The normalizers in `autodraftService.ts` are **extremely thorough** and defensive. Every field is type-checked, clamped, and defaulted. This is the right approach given:
- The backend returns raw `Dict[str, Any]` from Python with no schema validation
- The .NET proxy can return a different shape than the Python fallback
- The backend silently falls back between .NET → Python paths

However, there's a **contract drift risk**: the Python backend adds new fields (like `recognition`, `shadow_advisor`, `agent_pre_review`) that the .NET backend may not return. The normalizers handle this gracefully today, but a shared API schema (OpenAPI spec) would prevent future surprises.

---

## Security Observations

1. **API key in frontend bundle** — `VITE_API_KEY` is embedded in the client bundle. The `.env.example` calls this out ("DO NOT put sensitive secrets here") but the key is still transmitted in `X-API-Key` headers. For production, this should be replaced with session-based auth or a backend proxy that attaches the key server-side.

2. **No CSRF protection** on the Flask API. The `@require_api_key` decorator provides some protection, but if the API key leaks (it's in the frontend bundle), any origin can make requests.

3. **SQLite for feedback storage** — The feedback database uses SQLite with `threading.Lock()`. Under concurrent load, this will serialize all feedback writes. For production, migrate to PostgreSQL or use the existing Supabase instance.

4. **_proxy_json auth gap** — As noted in Bug 2 above, proxied requests to .NET don't include credentials.

---

## Enhancement Recommendations (Prioritized)

### P0 — Fix Now
1. Gate `AutoDraftComparePanel` behind a tab (Bug 1)
2. Forward auth headers in `_proxy_json` (Bug 2)
3. Add React error boundary around Compare Panel (Bug 7)
4. Fix summary classification count for semantic matches (Bug 6)

### P1 — Next Sprint
5. Split `AutoDraftComparePanel.tsx` into 5-6 focused sub-components
6. Create a separate CSS module for the compare panel
7. Add an OpenAPI schema for `/api/autodraft/*` endpoints
8. Replace 16+ `useState` calls with `useReducer` for demo panel workflow
9. Add unit tests for `pdfToCadGeometry.ts` (zero coverage today)
10. Write a README documenting the markup convention, pipeline, and setup

### P2 — Backlog
11. Replace SQLite feedback storage with PostgreSQL/Supabase
12. Add WebSocket/SSE for long-running compare operations
13. Add keyboard navigation for the canvas viewport (accessibility)
14. Implement undo/redo for calibration point placement
15. Add telemetry for compare latency and failure rates
16. Extract backend modules: `autodraft_classification.py`, `autodraft_calibration.py`, `autodraft_replacement.py`, `autodraft_feedback.py`
17. Add a "confidence heatmap" visualization for markup classifications
18. Support multi-page PDF processing (currently single-page per prepare call)
