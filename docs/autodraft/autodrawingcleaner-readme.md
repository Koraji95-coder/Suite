# AutoDraft Studio

Bluebeam markup recognition and CAD action planning through a deterministic, .NET-ready pipeline.

AutoDraft reads annotated PDF drawings, classifies markup intent with rules first and local ML fallback second, calibrates PDF-to-CAD transforms, and produces reviewable action plans for a .NET CAD execution backend.

## Architecture

```text
Bluebeam PDF
  -> content stream extraction
  -> annotation extraction
  -> deterministic rule engine
  -> local ML fallback for unresolved cases
  -> review queue
  -> .NET execution API
```

Three tiers handle the work:

- Frontend (`src/features/autodraft-studio/ui/*`): preview, calibration, review queue, and feedback UX.
- Backend (`backend/route_groups/api_autodraft.py`): parsing, classification, calibration math, replacement scoring, backcheck validation, feedback persistence, and local ML training.
- .NET execution API (`dotnet/autodraft-api-contract`): CAD-native execution path when available.

## Markup Convention

AutoDraft uses color and shape to determine intent:

| Color | Shape | Category | Action |
|-------|-------|----------|--------|
| Green | Cloud | DELETE | Remove geometry inside the cloud boundary |
| Red | Cloud | ADD | Add new geometry drawn inside the cloud |
| Blue | Text | NOTE | Log annotation, no geometry change |
| Blue | Arrow (x2) | SWAP | Swap connected elements |
| n/a | Rectangle (bottom-right, wide) | TITLE_BLOCK | Extract metadata only |
| n/a | Repeated small symbol | BLOCK_REF | Map to block library |
| Any | Cloud with delta marker | REVISION_CLOUD | Compare against prior sheet |
| n/a | Line with arrows plus text | DIMENSION | Extract measurement value |

Rules are defined in the frontend seed data and backend defaults. When the backend is online, rules are fetched from `/api/autodraft/rules`.

## Compare And Calibrate Workflow

1. Upload a Bluebeam-annotated PDF through `/api/autodraft/compare/prepare`.
2. Extract annotations and supporting text or OCR signals.
3. Place or confirm calibration anchors.
4. Run `/api/autodraft/compare` to produce deterministic compare findings and backcheck output.
5. Review unresolved or low-confidence items.
6. Submit feedback for local learning and promote approved actions into later execution steps.

Suite no longer runs agent or broker-driven pre-review in this workflow.

## Local Learning

The local-learning runtime trains lightweight models from operator feedback:

- `autodraft_markup`: text plus structured features for markup category classification.
- `autodraft_replacement`: numeric features for replacement candidate scoring.

Training data stays local in SQLite and JSONL exports. Future scikit-learn or PyTorch work should be treated as a new local-model path, not a continuation of the removed Suite agent stack.

## Environment Variables

Key variables:

| Variable | Purpose |
|----------|---------|
| `VITE_COORDINATES_BACKEND_URL` | Python Flask API server (default: `http://localhost:5000`) |
| `VITE_API_KEY` | Frontend API key expected by the backend |
| `AUTODRAFT_DOTNET_API_URL` | .NET execution API (default: `http://127.0.0.1:5275`) |

## API Endpoints

All endpoints require `X-API-Key` and are rate-limited.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/autodraft/health` | Backend plus .NET connectivity status |
| GET | `/api/autodraft/rules` | Active classification rules |
| POST | `/api/autodraft/plan` | Classify markups into an action plan |
| POST | `/api/autodraft/execute` | Execute actions via .NET (dry-run supported) |
| POST | `/api/autodraft/backcheck` | Validate actions against CAD state |
| POST | `/api/autodraft/compare/prepare` | Upload PDF and extract annotations |
| POST | `/api/autodraft/compare` | Compare, calibrate, and backcheck |
| POST | `/api/autodraft/compare/feedback` | Submit operator review feedback |
| GET | `/api/autodraft/compare/feedback/export` | Export feedback as JSON |
| POST | `/api/autodraft/compare/feedback/import` | Import feedback |
| POST | `/api/autodraft/compare/reviewed-run/export` | Export reviewed run bundle |
| POST | `/api/autodraft/learning/train` | Train local ML models |
| GET | `/api/autodraft/learning/models` | List trained models |
| GET | `/api/autodraft/learning/evaluations` | List model evaluations |

## Development

```bash
cd backend && python -m flask run --port 5000
npm run dev
npm run test
```

Ensure `VITE_API_KEY` matches `API_KEY` in the backend environment.

## Known Limitations

- Compare remains a large surface and still needs more internal extraction.
- `api_autodraft.py` still owns too much responsibility.
- Local training data is still small enough to overfit.
- Feedback storage is SQLite-backed and serialized under a process lock.
