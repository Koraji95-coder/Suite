# AutoDraftComparePanel Refactoring Guide

The current `AutoDraftComparePanel.tsx` is 3,220 lines in a single component.
This document defines the decomposition into 7 focused modules.

## Target Structure

```
AutoDraftComparePanel/
├── index.tsx                      — Re-export (barrel)
├── AutoDraftComparePanel.tsx      — Orchestrator (~200 lines)
├── AutoDraftComparePanel.module.css — Own styles (extract from shared module)
├── useCompareWorkflow.ts          — Shared state hook (~300 lines)
├── CompareCanvasViewport.tsx      — PDF render, pan/zoom, point/ROI (~400 lines)
├── CompareCalibrationPanel.tsx    — Calibration inputs, tuning sliders (~250 lines)
├── CompareReviewQueue.tsx         — Replacement review items (~350 lines)
├── CompareMarkupReview.tsx        — Markup classification review (~300 lines)
├── CompareFeedbackManager.tsx     — Export/import/bundle (~250 lines)
├── CompareLearningPanel.tsx       — Train, models, evaluations (~200 lines)
└── compareHelpers.ts              — Pure functions extracted from component (~200 lines)
```

## Shared State: useCompareWorkflow

This custom hook replaces the 30+ useState calls currently in the monolith.
All sub-components receive slices of this state via props — no context needed
since they're all direct children of the orchestrator.

```typescript
// useCompareWorkflow.ts

import { useCallback, useReducer } from "react";
import {
  type AutoDraftCompareEngine,
  type AutoDraftToleranceProfile,
  type AutoDraftCalibrationMode,
  type AutoDraftAgentReviewMode,
  type AutoDraftComparePoint,
  type AutoDraftCompareRoi,
  type AutoDraftComparePrepareResponse,
  type AutoDraftCompareResponse,
  type AutoDraftReplacementTuning,
  type AutoDraftLearningModel,
  type AutoDraftLearningEvaluation,
  autoDraftService,
} from "../autodraftService";

// ── Workflow phases (state machine) ──────────────────────
type ComparePhase =
  | "idle"          // No PDF uploaded
  | "preparing"     // Upload in progress
  | "prepared"      // PDF parsed, ready for config
  | "comparing"     // Compare request in flight
  | "compared"      // Results available
  | "submitting"    // Feedback submission in flight
  | "error";        // Recoverable error

// ── State shape ──────────────────────────────────────────
interface CompareWorkflowState {
  phase: ComparePhase;
  error: string | null;

  // PDF & prepare
  pdfFile: File | null;
  pageIndex: number;
  prepareResult: AutoDraftComparePrepareResponse | null;

  // Canvas
  zoom: number;
  pan: { x: number; y: number };
  pdfPoints: AutoDraftComparePoint[];
  roi: AutoDraftCompareRoi | null;

  // Config
  engine: AutoDraftCompareEngine;
  toleranceProfile: AutoDraftToleranceProfile;
  calibrationMode: AutoDraftCalibrationMode;
  agentReviewMode: AutoDraftAgentReviewMode;
  cadPoints: Array<{ x: string; y: string }>;
  replacementTuning: {
    unresolvedConfidenceThreshold: string;
    ambiguityMarginThreshold: string;
    searchRadiusMultiplier: string;
  };

  // Results
  compareResult: AutoDraftCompareResponse | null;

  // Review drafts (keyed by action_id)
  reviewSelections: Record<string, string>;  // action_id → selected entity_id
  reviewNotes: Record<string, string>;       // action_id → note text
  markupReviewDrafts: Record<string, {
    category: string;
    markupClass: string;
    color: string;
    text: string;
  }>;

  // Learning
  learningModel: AutoDraftLearningModel | null;
  learningEvaluation: AutoDraftLearningEvaluation | null;
  learningLoading: boolean;

  // Loading substates
  loadingPrepare: boolean;
  loadingCompare: boolean;
  loadingFeedback: boolean;
}

// ── Actions ──────────────────────────────────────────────
type CompareAction =
  | { type: "SET_PDF"; file: File; pageIndex: number }
  | { type: "PREPARE_START" }
  | { type: "PREPARE_SUCCESS"; result: AutoDraftComparePrepareResponse }
  | { type: "PREPARE_FAIL"; error: string }
  | { type: "COMPARE_START" }
  | { type: "COMPARE_SUCCESS"; result: AutoDraftCompareResponse }
  | { type: "COMPARE_FAIL"; error: string }
  | { type: "SET_ENGINE"; engine: AutoDraftCompareEngine }
  | { type: "SET_TOLERANCE"; profile: AutoDraftToleranceProfile }
  | { type: "SET_CALIBRATION_MODE"; mode: AutoDraftCalibrationMode }
  | { type: "ADD_PDF_POINT"; point: AutoDraftComparePoint }
  | { type: "CLEAR_PDF_POINTS" }
  | { type: "SET_ROI"; roi: AutoDraftCompareRoi | null }
  | { type: "SET_CAD_POINT"; index: number; x: string; y: string }
  | { type: "SET_ZOOM"; zoom: number }
  | { type: "SET_PAN"; pan: { x: number; y: number } }
  | { type: "SET_REVIEW_SELECTION"; actionId: string; entityId: string }
  | { type: "SET_REVIEW_NOTE"; actionId: string; note: string }
  | { type: "SET_MARKUP_DRAFT"; actionId: string; draft: CompareWorkflowState["markupReviewDrafts"][string] }
  | { type: "FEEDBACK_START" }
  | { type: "FEEDBACK_SUCCESS" }
  | { type: "FEEDBACK_FAIL"; error: string }
  | { type: "SET_LEARNING"; model: AutoDraftLearningModel | null; evaluation: AutoDraftLearningEvaluation | null }
  | { type: "RESET" };

// ── Reducer ──────────────────────────────────────────────
// (implement standard reducer pattern — each case returns new state)

// ── Hook export ──────────────────────────────────────────
export function useCompareWorkflow() {
  const [state, dispatch] = useReducer(compareReducer, initialState);

  const uploadPdf = useCallback(async (file: File, pageIndex: number) => {
    dispatch({ type: "PREPARE_START" });
    try {
      const result = await autoDraftService.prepareCompare(file, pageIndex);
      dispatch({ type: "PREPARE_SUCCESS", result });
    } catch (err) {
      dispatch({
        type: "PREPARE_FAIL",
        error: err instanceof Error ? err.message : "Prepare failed.",
      });
    }
  }, []);

  const runCompare = useCallback(async () => {
    // Build args from state, dispatch COMPARE_START/SUCCESS/FAIL
  }, [state.prepareResult, state.engine, /* etc */]);

  const submitFeedback = useCallback(async () => {
    // Build feedback items from reviewSelections/reviewNotes, dispatch
  }, [state.compareResult, state.reviewSelections]);

  return { state, dispatch, uploadPdf, runCompare, submitFeedback };
}
```

## Component Boundaries

### AutoDraftComparePanel.tsx (orchestrator)

```typescript
export function AutoDraftComparePanel() {
  const { state, dispatch, uploadPdf, runCompare, submitFeedback } =
    useCompareWorkflow();

  return (
    <div className={styles.comparePanel}>
      {/* Config controls: engine, tolerance, calibration mode */}
      <CompareControls state={state} dispatch={dispatch} onUpload={uploadPdf} />

      <div className={styles.comparePreviewWrap}>
        {/* Left: canvas */}
        <CompareCanvasViewport
          prepareResult={state.prepareResult}
          pdfPoints={state.pdfPoints}
          roi={state.roi}
          zoom={state.zoom}
          pan={state.pan}
          dispatch={dispatch}
        />

        {/* Right: calibration + tuning */}
        <CompareCalibrationPanel
          prepareResult={state.prepareResult}
          cadPoints={state.cadPoints}
          replacementTuning={state.replacementTuning}
          dispatch={dispatch}
        />
      </div>

      {/* Compare button + status */}
      <CompareActions
        phase={state.phase}
        onCompare={runCompare}
        loading={state.loadingCompare}
      />

      {/* Results */}
      {state.compareResult && (
        <>
          <CompareReviewQueue
            reviewQueue={state.compareResult.review_queue}
            actions={state.compareResult.plan.actions}
            selections={state.reviewSelections}
            notes={state.reviewNotes}
            dispatch={dispatch}
          />

          <CompareMarkupReview
            markupReviewQueue={state.compareResult.markup_review_queue}
            actions={state.compareResult.plan.actions}
            drafts={state.markupReviewDrafts}
            dispatch={dispatch}
          />

          <CompareFeedbackManager
            compareResult={state.compareResult}
            prepareResult={state.prepareResult}
            onSubmit={submitFeedback}
            loading={state.loadingFeedback}
          />

          <CompareLearningPanel
            model={state.learningModel}
            evaluation={state.learningEvaluation}
            loading={state.learningLoading}
          />
        </>
      )}
    </div>
  );
}
```

### CompareCanvasViewport.tsx

Extracts from the current monolith:
- PDF.js document loading and page rendering
- Canvas pan (pointer drag) and zoom (wheel)
- Point placement (click → dispatch ADD_PDF_POINT)
- ROI rectangle drawing (drag → dispatch SET_ROI)
- Point markers and ROI overlay rendering
- The `useRef` for canvas, the drag state, the zoom clamping

Key props:
```typescript
interface CompareCanvasViewportProps {
  prepareResult: AutoDraftComparePrepareResponse | null;
  pdfPoints: AutoDraftComparePoint[];
  roi: AutoDraftCompareRoi | null;
  zoom: number;
  pan: { x: number; y: number };
  dispatch: React.Dispatch<CompareAction>;
}
```

### CompareCalibrationPanel.tsx

Extracts:
- CAD point coordinate inputs (x, y for each calibration point)
- Auto-calibration status display
- Replacement tuning sliders (confidence threshold, ambiguity margin, search radius)
- Calibration seed display (scale hint, rotation hint)

### CompareReviewQueue.tsx

Extracts:
- Review item cards with candidate radio selection
- Agent hint display (candidate boosts, intent hint, rationale)
- Shadow advisor display
- Per-item note textarea
- Status badges (resolved/ambiguous/unresolved)

### CompareMarkupReview.tsx

Extracts:
- Markup classification review cards
- Category/class/color dropdowns
- OCR text correction input
- Recognition metadata display
- "Train markup model" button

### CompareFeedbackManager.tsx

Extracts:
- Submit feedback button + status
- Export feedback JSON
- Import feedback JSON (file picker + merge/replace)
- Export reviewed run bundle
- Feedback metrics display

### CompareLearningPanel.tsx

Extracts:
- Train models button
- Active model display (version, metrics, created date)
- Latest evaluation display (accuracy, f1, sample count)
- Training result summary

## compareHelpers.ts

Pure functions that don't depend on React, extracted from the monolith:

```typescript
// Already exist in the monolith as inline functions:
export function isRecordValue(value: unknown): value is Record<string, unknown>;
export function formatMarkupColorDiagnostic(markup: Record<string, unknown>): string | null;
export function clampPercent(value: number): number;
export function clampZoom(value: number): number;
export function buildRoiFromPointPair(start, end): AutoDraftCompareRoi;
export function toSafeIdToken(value: string): string;
export function toTrimmedString(value: unknown): string;
export function normalizeMarkupReviewCategory(value: unknown): string;
export function normalizeMarkupReviewClass(value: unknown): string;
export function normalizeMarkupReviewColor(value: unknown): string;
export function getMarkupReviewMarkup(item, action): Record<string, unknown> | null;
export function buildMarkupReviewDraftDefaults(args): MarkupReviewDraft;
export function summarizeMarkupTrainingResult(results): { color; message };
export function summarizeDomainTrainingResult(results, args): { color; message };
export function toFiniteNumber(value: unknown): number | null;
export function formatLearningMetricTokens(metrics): string[];
```

## CSS Extraction

Create `AutoDraftComparePanel.module.css` by moving all `.compare*` classes
from `AutoDraftStudioApp.module.css` into the new file. The studio app module
keeps only its own classes. Update the import in the new orchestrator.

## Migration Steps

1. Create `compareHelpers.ts` — extract pure functions, update imports in monolith. Ship.
2. Create `useCompareWorkflow.ts` — start with the reducer skeleton, wire into monolith. Ship.
3. Extract `CompareCanvasViewport.tsx` — this is the most self-contained piece. Ship.
4. Extract `CompareCalibrationPanel.tsx`. Ship.
5. Extract `CompareReviewQueue.tsx` + `CompareMarkupReview.tsx`. Ship.
6. Extract `CompareFeedbackManager.tsx` + `CompareLearningPanel.tsx`. Ship.
7. The remaining orchestrator should be ~200 lines. Extract CSS. Ship.

Each step is independently shippable and testable. The existing test file
(`AutoDraftComparePanel_test.tsx`) should pass after each step since it
mocks the service layer and tests via rendered output.
