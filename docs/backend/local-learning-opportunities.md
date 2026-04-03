# Local Learning Opportunities

This note captures concrete machine-learning opportunities for Suite after the current runtime/ownership overhaul is stable.

## Scope

These ideas are meant for:

- assistive scoring
- ranking
- confidence estimation
- review prioritization
- anomaly detection

These ideas are **not** approval to replace deterministic CAD geometry behavior, route issuance, or core business-rule enforcement with ML.

## Current Local Learning Domains

The active local learning domains remain:

- `autodraft_markup`
- `autodraft_replacement`
- `transmittal_titleblock`

Those domains are still local-only and should stay isolated from unrelated systems such as AutoWire route data.

## Concrete Opportunities

### `transmittal_titleblock`

Use scikit-learn first for confidence scoring on extracted title-block rows before render/review.

Candidate features:

- OCR confidence
- embedded-text availability
- regex match quality for drawing number and revision
- filename-to-title-block agreement
- field completeness
- revision-register consistency

Likely outputs:

- confidence score per row
- review priority ordering
- suggested "accept as-is" vs "needs review" thresholding

### `autodraft_markup`

Use scikit-learn or PyTorch to rank or classify markup intent when deterministic rules are ambiguous.

Examples:

- classify markup as delete/add/note/replace/follow-up
- score likely action class from OCR text, markup color, page context, and nearby geometry hints
- prioritize unresolved marks for operator review

Recommended order:

1. Start with scikit-learn on engineered text/structure features.
2. Move to PyTorch only if image crops or richer sequence/context modeling become necessary.

### `autodraft_replacement`

Use scikit-learn to rank likely replacement targets from prior operator-accepted actions.

Candidate features:

- distance between candidate objects
- overlap/pointer hit flags
- token similarity
- layer/class compatibility
- nearby markup clustering
- past accept/reject feedback

Likely outputs:

- top-N candidate ranking
- calibrated confidence
- review-first suggestions when deterministic matching is weak

### Watchdog anomaly detection

Use lightweight anomaly detection for workstation/runtime patterns.

Examples:

- collectors that drift from normal heartbeat/event timing
- unusual project-rule sync churn
- repeated local companion action failures by workstation
- route/page flows that start regressing after deployments

Possible starting point:

- Isolation Forest or similar scikit-learn anomaly scoring on telemetry features

### Title-block image or crop classification

PyTorch becomes useful if Suite later needs to reason over title-block image crops in addition to text.

Examples:

- classify whether a crop contains a valid title block
- detect whether a block is likely stale/misaligned/missing expected fields
- combine OCR tokens with visual crop features for stronger review ranking

This should remain review-assistive, not an automatic source of truth.

## Recommended Stack Order

### Start with scikit-learn when:

- features are mostly tabular or text-derived
- training sets are still small
- fast local training/inference matters more than model complexity
- explainability is useful during rollout

### Reach for PyTorch when:

- image crops become important
- multi-modal signals matter
- sequence/context modeling clearly outperforms simpler baselines
- you have enough reviewed data to justify the added complexity

## Guardrails

- keep ML advisory for these domains unless an explicit promotion decision is made
- keep deterministic extraction/business behavior as the primary path
- keep learning data and model artifacts local-only unless the product direction changes explicitly
- do not let ML silently override promoted local model output or deterministic rules

## Follow-Up After Overhaul

Revisit this document after the current overhaul lands and choose the first pilot.

The strongest likely first pilot is:

- `transmittal_titleblock` confidence scoring with scikit-learn

The strongest likely second pilot is:

- `autodraft_replacement` candidate ranking refinement
