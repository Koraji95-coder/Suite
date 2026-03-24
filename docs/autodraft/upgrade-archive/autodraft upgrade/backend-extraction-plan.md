# Backend Module Extraction Plan

## Current state: api_autodraft.py — 8,170 lines, one file

## Target structure

```
backend/autodraft/
├── __init__.py                      ← empty
├── blueprint.py                     ← create_autodraft_blueprint() + route handlers (~800 lines)
├── classification.py                ← rule matching, semantic inference, recognition (~600 lines)
├── calibration.py                   ← similarity transform, auto-calibration (~400 lines)
├── replacement.py                   ← candidate scoring, tuning, selection model (~500 lines)
├── backcheck.py                     ← local backcheck builder (~300 lines)
├── feedback.py                      ← SQLite feedback CRUD, import/export (~400 lines)
├── pdf_extraction.py                ← annotation parsing, color extraction, markup enrichment (~800 lines)
├── normalizers.py                   ← shared _normalize_text, _safe_float, _normalize_bounds, etc. (~200 lines)
├── constants.py                     ← regex patterns, color maps, intent tokens, thresholds (~150 lines)
└── agent_review.py                  ← shadow advisor, agent pre-review orchestration (~300 lines)
```

## Extraction order (each step independently shippable)

### Step 1: constants.py + normalizers.py
Extract all module-level constants (regex patterns, color maps, threshold values)
and pure normalizer functions. These have zero dependencies on Flask or SQLite.

Functions to move to normalizers.py:
- _normalize_text, _normalize_display_text, _safe_float, _normalize_bounds
- _normalize_boolean, _normalize_compare_engine, _normalize_tolerance_profile
- _normalize_calibration_mode, _normalize_agent_review_mode
- _normalize_compare_roi, _normalize_point_pair_list, _normalize_compare_markups
- _normalize_replacement_tuning, _clamp_value, _bounds_center_payload

Constants to move to constants.py:
- All regex patterns (_PDF_DA_RGB_PATTERN, _ADD_INTENT_PATTERN, etc.)
- Color maps (_CLOUD_COLOR_TO_CATEGORY, _DEFAULT_COLOR_TO_CATEGORY, etc.)
- Threshold values (_LOCAL_MODEL_RECOGNITION_MIN_CONFIDENCE, etc.)
- Status sets (_REPLACEMENT_WARN_STATUSES, _COMPARE_SUPPORTED_ENGINES, etc.)
- DEFAULT_RULES list

### Step 2: classification.py
Move rule matching and semantic inference logic.

Functions:
- _rule_matches, _cloud_intent_conflicts, _resolve_low_signal_rule_override
- _infer_semantic_category, _build_semantic_action_item
- _enrich_markups_for_local_plan, _pair_blue_note_markups
- _build_markup_recognition, _apply_local_model_recognition
- _build_local_plan, _recompute_plan_summary

### Step 3: calibration.py
Move coordinate transform math.

Functions:
- _build_similarity_transform, _auto_calibrate_transform
- _build_auto_calibration_payload
- _transform_pdf_point_to_cad, _transform_roi_to_cad

### Step 4: replacement.py
Move candidate scoring logic.

Functions:
- _score_replacement_candidate, _apply_replacement_model_adjustment
- _resolve_replacement_status, _build_replacement_candidates
- _apply_agent_boost_to_candidates

### Step 5: backcheck.py
Move backcheck builder.

Functions:
- _build_local_backcheck, _collect_live_cad_context, _merge_cad_context
- _cad_context_is_available

### Step 6: pdf_extraction.py
Move PDF annotation parsing.

Functions:
- _extract_pdf_compare_markups, _extract_annotation_text_candidates
- _collect_markup_semantic_text, _infer_page_position_zone, _infer_bounds_aspect
- Color extraction functions (_parse_da_color, _resolve_annotation_color, etc.)

### Step 7: feedback.py
Move SQLite feedback persistence.

Functions:
- _compare_feedback_db_path, _ensure_feedback_schema
- _store_feedback_event, _export_feedback_events, _import_feedback_events
- _build_feedback_metrics

### Step 8: agent_review.py
Move agent pre-review and shadow advisor orchestration.

Functions:
- _build_agent_pre_review_cases, _run_agent_pre_review
- _build_shadow_advisor_cases, _run_shadow_advisor
- Token cache management

### Step 9: blueprint.py
The route handlers stay here, importing from all other modules.
Each handler becomes thin — validate input, call module function, format response.

## Import pattern after extraction

```python
# blueprint.py
from .constants import DEFAULT_RULES, _COMPARE_SUPPORTED_ENGINES
from .normalizers import _normalize_text, _normalize_bounds
from .classification import _build_local_plan
from .calibration import _build_similarity_transform, _auto_calibrate_transform
from .replacement import _build_replacement_candidates
from .backcheck import _build_local_backcheck
from .feedback import _store_feedback_event, _export_feedback_events
from .pdf_extraction import _extract_pdf_compare_markups
from .agent_review import _run_agent_pre_review, _run_shadow_advisor
```

## Testing strategy

Each extracted module gets its own test file. The pure functions
(normalizers, constants, classification, calibration) are testable
without Flask context. The feedback module needs a temp SQLite path.
The blueprint routes need the existing Flask test client setup.
