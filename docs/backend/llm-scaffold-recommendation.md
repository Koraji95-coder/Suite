# LLM Scaffold Recommendation: Build vs Pre-Built

## Question

> Is it better to scaffold an extremely intelligent LLM using PyTorch and scikit-learn
> (with a reference book that has code examples and terminology) or is it better to find
> a pre-built one and not worry about the book?

## Recommendation

**Scaffold from the existing scikit-learn infrastructure and add PyTorch incrementally.** Do not adopt a pre-built LLM for Suite's local learning domains.

The book is valuable — use it to deepen understanding of model internals, feature engineering, and evaluation, then apply that knowledge to extend the existing local learning runtime (`api_local_learning_runtime.py`).

## Rationale

### Why scaffolding fits Suite better than a pre-built LLM

| Factor | Scaffold (scikit-learn + PyTorch) | Pre-built LLM |
|--------|-----------------------------------|----------------|
| **Privacy** | All data and models stay on the workstation | Most pre-built LLMs require cloud inference or large local downloads |
| **Determinism** | Reproducible outputs tied to versioned artifacts | LLMs are non-deterministic by default; same input can produce different output |
| **Explainability** | Confusion matrices, feature importance, and F1 scores are already tracked | LLM reasoning is opaque; hard to audit for CAD review workflows |
| **Latency** | Millisecond inference from cached sklearn/PyTorch models | LLMs add seconds per inference even locally; unacceptable for interactive CAD scoring |
| **Training data** | Works well with small, domain-specific datasets (6–50 examples) | LLMs need thousands of examples to fine-tune reliably |
| **Dependency footprint** | scikit-learn is already installed; PyTorch adds ~2 GB but is well-bounded | Pre-built LLMs often require transformers, tokenizers, and multi-GB model weights |
| **Alignment with codebase** | Extends the existing `LocalLearningRuntime` class, versioning, and promotion pipeline | Requires a new parallel infrastructure with different contracts |

### Why the book matters

A reference book with code examples and terminology provides:

1. **Foundation for feature engineering** — understanding TF-IDF, gradient boosting internals, and evaluation metrics directly improves the quality of Suite's existing models.
2. **Debugging confidence** — when a model underperforms, book knowledge helps diagnose whether the issue is data quality, feature representation, or model capacity.
3. **PyTorch readiness** — when image crops or multimodal signals emerge (see Phase 2 below), book knowledge about tensors, backpropagation, and neural architectures makes the transition practical rather than trial-and-error.
4. **Vocabulary alignment** — shared terminology (precision, recall, F1, cross-validation, regularization) makes collaboration and documentation clearer.

### When a pre-built LLM might make sense (not now)

A pre-built LLM would only be appropriate if Suite needed:

- Free-form natural language generation (not a current requirement)
- General knowledge reasoning over arbitrary text (out of scope — Office owns chat/orchestration)
- Zero-shot classification with no labeled data (Suite already has a feedback loop producing labeled examples)

None of these apply to Suite's current or planned learning domains.

## Scaffold Plan

### Phase 1: Strengthen scikit-learn (current)

The existing infrastructure already handles three domains well. Focus improvements here:

1. **Expand training data** through the feedback loop — more operator corrections means better models.
2. **Add cross-validation** to `train_domain()` for more robust metric estimates on small datasets.
3. **Add feature importance tracking** for replacement models (HistGradientBoosting supports `feature_importances_`).
4. **Consider Isolation Forest** for watchdog anomaly detection (per `local-learning-opportunities.md`).

No new dependencies needed. Use book knowledge to improve feature engineering and evaluation.

### Phase 2: Add PyTorch for image/multimodal domains

When title-block image crops or richer context modeling become necessary:

1. **Add `torch` and `torchvision`** to `backend/requirements-api.in`.
2. **Create a new bundle builder** (e.g., `_build_image_classifier_bundle()`) alongside existing text and replacement builders.
3. **Extend `LocalLearningRuntime`** with a PyTorch model loading path that uses the same versioning, promotion, and caching contracts.
4. **Keep the same prediction interface** — `LocalModelPrediction(label, confidence, model_version, ...)` stays unchanged.

Concrete PyTorch use cases from the existing design docs:

- Classify whether a crop contains a valid title block
- Detect stale/misaligned title-block fields from visual features
- Combine OCR tokens with visual crop features for stronger review ranking

### Phase 3: Multi-modal fusion (future)

If both text features and image features prove valuable for the same domain:

1. **Fuse scikit-learn text features with PyTorch image embeddings** in a combined model.
2. **Use PyTorch as the outer model** with scikit-learn features as additional inputs.
3. **Maintain the advisory-only guardrail** — ML scores assist review, never replace deterministic rules.

## Integration with Existing Infrastructure

The scaffold approach preserves all existing contracts:

```
Existing pipeline (unchanged):
  User feedback → record_examples() → train_domain() → promote model → predict()

New PyTorch models plug into the same pipeline:
  User feedback → record_examples() → train_domain() → _build_image_bundle() → promote → predict()
```

Key integration points:

- **Same SQLite schema** — `learning_examples`, `learning_models`, `learning_evaluations`
- **Same versioning** — timestamp-based model versions with joblib/torch serialization
- **Same promotion logic** — `_should_promote_model()` compares F1, then accuracy
- **Same cache** — `_MODEL_CACHE` stores loaded model bundles regardless of framework

## Summary

| Approach | Verdict |
|----------|---------|
| Scaffold with scikit-learn + PyTorch | **Recommended** — extends existing infrastructure, preserves privacy, fits the book's educational value |
| Pre-built LLM | **Not recommended** — violates local-only design, adds unnecessary complexity, poor fit for assistive scoring |
| Book as reference | **Valuable** — deepens understanding for both current scikit-learn work and future PyTorch additions |

The existing `LocalLearningRuntime` is production-grade infrastructure. Build on it rather than replacing it.
