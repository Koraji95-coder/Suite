# AutoDraft Studio

Bluebeam markup recognition and CAD action planning through a .NET-ready API pipeline.

AutoDraft reads annotated PDF drawings (typically from Bluebeam Revu), classifies markup intent using a deterministic rule engine with ML fallback, calibrates PDF-to-CAD coordinate transforms, and generates executable action plans for a .NET CAD execution backend.

## Architecture

```
Bluebeam PDF
  ├── Content Stream     → vector extraction (segments, arcs)
  ├── /Annots Dictionary → markup extraction (clouds, arrows, text)
  ├── Rule Engine        → deterministic action mapping
  ├── ML Fallback        → unresolved/ambiguous markups
  ├── Agent Pre-Review   → Draftsmith + GridSage advisory hints
  └── Review Queue       → approve → execute via .NET API
```

Three tiers handle different responsibilities:

- **Frontend (TypeScript/React)** — Rule management, PDF preview with pan/zoom/calibration, review queue, feedback submission, learning model management. Entry point: `AutoDraftStudioApp.tsx`.
- **Backend (Python/Flask)** — PDF parsing, markup classification, calibration math, replacement scoring, backcheck validation, feedback persistence (SQLite), local ML training. Entry point: `api_autodraft.py`, mounted via `create_autodraft_blueprint()`.
- **.NET Execution API** — CAD-native operations. The Python backend proxies `/plan`, `/execute`, and `/backcheck` to this service when `AUTODRAFT_DOTNET_API_URL` is configured. Falls back to local Python logic when .NET is offline.

## Markup Convention

AutoDraft uses color and shape to determine intent:

| Color  | Shape  | Category | Action |
|--------|--------|----------|--------|
| Green  | Cloud  | DELETE   | Remove geometry inside cloud boundary |
| Red    | Cloud  | ADD      | Add new geometry drawn inside cloud |
| Blue   | Text   | NOTE     | Log annotation, no geometry change |
| Blue   | Arrow (×2) | SWAP | Swap connected elements |
| —      | Rectangle (bottom-right, wide) | TITLE_BLOCK | Extract metadata only |
| —      | Repeated small symbol | BLOCK_REF | Map to block library |
| Any    | Cloud with delta marker | REVISION_CLOUD | Compare against prior sheet |
| —      | Line with arrows + text | DIMENSION | Extract measurement value |

Rules are defined in `autodraftData.ts` (frontend seed) and `DEFAULT_RULES` in `api_autodraft.py` (backend). When the backend is online, rules are fetched from `/api/autodraft/rules`.

## Pipeline Steps

1. **Extract Layers** — Parse PDF content streams and `/Annots` dictionary separately.
2. **Classify Marks** — Apply deterministic rules first, ML classification as fallback.
3. **Resolve Context** — Spatial overlap/containment and pointer direction logic.
4. **Generate Actions** — Convert to atomic actions (delete/add/swap/note) with conflict checks.
5. **Review & Execute** — Preview diff, confirm destructive ops, submit to .NET backend.

## Compare & Calibrate Workflow

The Compare panel (`AutoDraftComparePanel.tsx`) handles the full PDF-to-CAD comparison flow:

1. Upload a Bluebeam-annotated PDF via `/api/autodraft/compare/prepare`.
2. The backend extracts annotations, detects Bluebeam metadata, runs OCR if needed.
3. Click the canvas to place calibration points, enter corresponding CAD coordinates.
4. Auto-calibration attempts anchor matching; falls back to manual two-point calibration.
5. Run compare via `/api/autodraft/compare` — produces action plan + backcheck + review queue.
6. Review ambiguous/unresolved replacements, submit feedback for learning.

## Agent Crew Review

After backcheck, the CAD crew review sends findings to two specialized agents:

- **Draftsmith** (`joshuaokolo/C3Dv0:latest`) — CAD drafting specialist. Reviews markup interpretation and execution safety.
- **GridSage** (`ALIENTELLIGENCE/electricalengineerv2:latest`) — Electrical engineering QA. Validates against power system constraints.

GridSage receives Draftsmith's review as additional context for cross-validation.

## Local Learning

The `api_local_learning_runtime.py` module trains lightweight scikit-learn classifiers from operator feedback:

- **autodraft_markup** — Text + structured feature classifier for markup category (DELETE/ADD/NOTE/etc). Uses TF-IDF pipeline.
- **autodraft_replacement** — Numeric feature classifier for replacement candidate selection. Uses gradient boosting on distance, pointer_hit, overlap, pair_hit_count, etc.

Training data is stored in `learning.sqlite3` and exported as JSONL (`autodraft_markup.jsonl`, `autodraft_replacement.jsonl`). Models are cached in memory with thread-safe locking.

## Environment Variables

Key variables (see `.env.example` for full list):

| Variable | Purpose |
|----------|---------|
| `VITE_COORDINATES_BACKEND_URL` | Python Flask API server (default: `http://localhost:5000`) |
| `VITE_API_KEY` | API key for backend auth (change in production) |
| `AUTODRAFT_DOTNET_API_URL` | .NET execution API (default: `http://127.0.0.1:5275`) |
| `AUTODRAFT_COMPARE_AGENT_PRE_REVIEW_ENABLED` | Enable agent advisory during compare |
| `AUTODRAFT_COMPARE_AGENT_PRE_REVIEW_PROFILE` | Agent profile for pre-review (default: `draftsmith`) |

## API Endpoints

All endpoints require `X-API-Key` header and are rate-limited.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/autodraft/health` | Backend + .NET connectivity status |
| GET | `/api/autodraft/rules` | List active classification rules |
| POST | `/api/autodraft/plan` | Classify markups → action plan |
| POST | `/api/autodraft/execute` | Execute actions via .NET (dry-run supported) |
| POST | `/api/autodraft/backcheck` | Validate actions against CAD state |
| POST | `/api/autodraft/compare/prepare` | Upload PDF, extract annotations |
| POST | `/api/autodraft/compare` | Full compare: calibrate + plan + backcheck |
| POST | `/api/autodraft/compare/feedback` | Submit operator review feedback |
| GET | `/api/autodraft/compare/feedback/export` | Export feedback as JSON |
| POST | `/api/autodraft/compare/feedback/import` | Import feedback (merge/replace) |
| POST | `/api/autodraft/compare/reviewed-run/export` | Export reviewed run bundle |
| POST | `/api/autodraft/learning/train` | Train local ML models from feedback |
| GET | `/api/autodraft/learning/models` | List trained models |
| GET | `/api/autodraft/learning/evaluations` | List model evaluations |

## File Map

```
Frontend
├── AutoDraftStudioApp.tsx          — Main app shell, tabs, demo panel
├── AutoDraftStudioApp.module.css   — Shared styles
├── AutoDraftComparePanel.tsx       — Compare/calibrate UI (3220 lines — refactor target)
├── autodraftData.ts                — Types, rule library, pipeline/training constants
├── autodraftService.ts             — API client with defensive normalizers
├── autodraftService_test.ts        — Service layer tests
├── AutoDraftComparePanel_test.tsx  — Compare panel tests
└── engine/
    └── pdfToCadGeometry.ts         — Arc detection, dead-end line extension

Backend
├── api_autodraft.py                — Flask blueprint, all endpoints (8170 lines — refactor target)
├── api_local_learning_runtime.py   — scikit-learn model training/prediction
├── api_autocad_error_helpers.py    — Error payload builders
├── pdf_text_extraction.py          — PDF text extraction (embedded + OCR)
└── data/
    ├── learning.sqlite3            — Training examples + model metadata
    ├── autodraft_markup.jsonl      — Markup classification training data
    └── autodraft_replacement.jsonl — Replacement selection training data
```

## Development

```bash
# Start backend
cd backend && python -m flask run --port 5000

# Start frontend
npm run dev

# Run tests
npm run test
```

Ensure `VITE_API_KEY` matches `API_KEY` in your backend environment.

## Known Limitations

- Compare panel is a single 3220-line component (refactor planned).
- Backend `api_autodraft.py` is 8170 lines (module extraction planned).
- Training data is small (12 markup / 37 replacement examples) — models will overfit until more feedback is collected.
- SQLite feedback storage serializes writes under `threading.Lock()` — swap to PostgreSQL for concurrent workloads.
- PDF processing is single-page per prepare call.
