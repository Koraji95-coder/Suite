# Wiring Guide — Extracted Compare Panel Components

## File Placement

Place these files in a new subdirectory:

```
src/components/apps/autodraft/AutoDraftComparePanel/
├── compareHelpers.ts              ← NEW (this delivery)
├── CompareCanvasViewport.tsx      ← NEW (this delivery)
├── CompareCanvasViewport.module.css ← NEW (this delivery)
├── CompareCalibrationPanel.tsx    ← NEW (this delivery)
```

## Step 1: Wire compareHelpers.ts

In `AutoDraftComparePanel.tsx`, replace the inline function definitions
(lines ~139–366) with imports:

```typescript
import {
  isRecordValue,
  formatMarkupColorDiagnostic,
  clampPercent,
  clampZoom,
  buildRoiFromPointPair,
  toSafeIdToken,
  toTrimmedString,
  normalizeMarkupReviewCategory,
  normalizeMarkupReviewClass,
  normalizeMarkupReviewColor,
  getMarkupReviewMarkup,
  buildMarkupReviewDraftDefaults,
  summarizeMarkupTrainingResult,
  summarizeReplacementTrainingResult,
  summarizeDomainTrainingResult,
  describeLearningModel,
  describeLearningEvaluation,
  toFiniteNumber,
  formatLearningMetricTokens,
  mapCanvasClientPointToPdf,
  mapPdfPointToCanvasPercent,
  type PointProjection,
  type MarkupReviewDraft,
  MARKUP_REVIEW_CATEGORY_OPTIONS,
  MARKUP_REVIEW_CLASS_OPTIONS,
  MARKUP_REVIEW_COLOR_OPTIONS,
  PDF_PREVIEW_ZOOM_STEP,
} from "./AutoDraftComparePanel/compareHelpers";
```

Delete the corresponding function bodies from the monolith.
The rest of the file stays unchanged. Ship and test.

## Step 2: Wire CompareCanvasViewport

This is optional until you're ready to slim the monolith further.
To use it, replace the viewport JSX block in the monolith's render
(the `<div ref={previewViewportRef} ...>` section) with:

```tsx
import { CompareCanvasViewport } from "./AutoDraftComparePanel/CompareCanvasViewport";

// In the render:
<CompareCanvasViewport
  pdfDoc={pdfDoc}
  pageIndex={pageIndex}
  pdfPoints={pdfPoints}
  roiBounds={roiBounds}
  roiDrawMode={roiDrawMode}
  roiDrawStart={roiDrawStart}
  onPointCapture={handlePreviewPointCapture}
  onRoiComplete={(roi) => {
    setRoiBounds(roi);
    setRoiDrawMode(false);
    setRoiDrawStart(null);
  }}
  onRoiDrawStartCapture={setRoiDrawStart}
/>
```

This also lets you remove from the monolith:
- `canvasRef`, `previewViewportRef`, `viewportRef`, `previewDragRef`, `suppressNextCanvasClickRef`
- `zoom`, `pan`, `isPanning`, `canvasNaturalWidth`, `canvasNaturalHeight`, `renderError` state
- `fitPreviewToViewport`, `setZoomAroundViewportPoint`, `zoomIn`, `zoomOut`, `resetPreviewView`
- `onPreviewPointerDown/Move/Up`, `onPreviewWheelNative`, `suppressGridPageScrollNative`
- `projectedPdfPoints`, `projectedRoi`, `projectedRoiStart`, `canvasStageStyle` memos
- The PDF page render effect (~lines 1054–1106)
- The fit-to-viewport effect, wheel listener effect

That's roughly 300 lines removed from the monolith.

## Step 3: Wire CompareCalibrationPanel

Replace the calibration JSX section with:

```tsx
import {
  CompareCalibrationPanel,
  DEFAULT_CAD_POINTS,
  DEFAULT_REPLACEMENT_TUNING,
  type CadPointInput,
  type ReplacementTuningInput,
} from "./AutoDraftComparePanel/CompareCalibrationPanel";

// In the render:
<CompareCalibrationPanel
  prepareResult={prepareResult}
  pdfPoints={pdfPoints}
  cadPoints={cadPoints}
  calibrationMode={calibrationMode}
  manualOverride={manualOverride}
  replacementTuning={replacementTuning}
  onCadPointChange={updateCadPoint}
  onCalibrationModeChange={(mode) => {
    setCalibrationMode(mode);
    if (mode === "manual") setManualOverride(false);
  }}
  onManualOverrideChange={setManualOverride}
  onReplacementTuningChange={updateReplacementTuning}
  onResetTuning={() => setReplacementTuning(DEFAULT_REPLACEMENT_TUNING)}
/>
```

Remove the corresponding JSX and the `CadPointInput`, `ReplacementTuningInput`
types + `DEFAULT_*` constants from the monolith (they now live in the panel).

## Remaining Extractions (next passes)

After these three steps ship and tests pass, the monolith should be
~2400 lines (down from 3220). The next extractions follow the same pattern:

4. `CompareReviewQueue.tsx` — review item cards + candidate selection
5. `CompareMarkupReview.tsx` — markup classification review
6. `CompareFeedbackManager.tsx` — export/import/bundle
7. `CompareLearningPanel.tsx` — train/models/evaluations

Each one removes another 200-350 lines. The final orchestrator
target is ~200 lines.
