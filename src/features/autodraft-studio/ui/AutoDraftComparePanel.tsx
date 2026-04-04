import {
  GlobalWorkerOptions,
  getDocument,
  type PageViewport,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/system/base/Badge";
import { Button } from "@/components/system/base/Button";
import { HStack, Stack } from "@/components/system/base/Stack";
import { Text } from "@/components/system/base/Text";
import { logger } from "@/lib/logger";
import {
  projectMarkupSnapshotService,
  type ProjectMarkupSnapshotRecord,
} from "@/services/projectMarkupSnapshotService";
import type {
  AutoDraftAutomationSnapshot,
  AutomationQueueItem,
} from "@/features/automation-studio";
import styles from "./AutoDraftStudioApp.module.css";
import {
  type AutoDraftCalibrationMode,
  type AutoDraftCompareEngine,
  type AutoDraftComparePoint,
  type AutoDraftComparePrepareResponse,
  type AutoDraftCompareRoi,
  type AutoDraftCompareResponse,
  type AutoDraftToleranceProfile,
  autoDraftService,
} from "./autodraftService";
import { AutoDraftCompareSetupSection } from "./AutoDraftCompareSetupSection";
import {
  type CadPointInput,
  DEFAULT_CAD_POINTS,
  DEFAULT_REPLACEMENT_TUNING,
  EMPTY_LEARNING_SUMMARY,
  type LearningSummaryState,
  type ReplacementTuningInput,
  buildRoiAroundPreparedMarkups,
  describeLearningEvaluation,
  describeLearningModel,
  parseCadPointInputs,
  parseReplacementTuningInput,
  summarizeMarkupTrainingResult,
  summarizeReplacementTrainingResult,
} from "./autoDraftCompareHelpers";
import {
  buildCompareExecutionPayload,
  validateComparePreflight,
  validatePreparePreflight,
} from "./autoDraftCompareExecutionController";
import {
  buildJsonDownloadPackage,
  parseCompareFeedbackImportPayload,
} from "./autoDraftCompareLearningAdapters";
import {
  buildMarkupReviewDraftDefaults,
  buildMarkupReviewSubmission,
  getMarkupReviewMarkup,
  isRecordValue,
  MARKUP_REVIEW_CATEGORY_OPTIONS,
  MARKUP_REVIEW_CLASS_OPTIONS,
  MARKUP_REVIEW_COLOR_OPTIONS,
  normalizeMarkupReviewCategory,
  normalizeMarkupReviewClass,
  normalizeMarkupReviewColor,
} from "./autoDraftCompareReviewController";
import {
  buildCompareActionById,
  buildMarkupReviewQueue,
  buildPrepareColorSourcesSummary,
  buildPrepareStatus,
  buildPrepareTextFallbackSummary,
  buildReviewQueue,
} from "./autoDraftCompareSelectors";
import {
  buildPanForZoomAroundPoint,
  buildRoiFromPointPair,
  clampZoom,
  mapCanvasClientPointToPdf,
  mapPdfPointToCanvasPercent,
  type PanOffset,
  type PointProjection,
} from "./autoDraftCompareViewportController";

if (!GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

type MarkupReviewDraft = {
  category: string;
  markupClass: string;
  color: string;
  text: string;
};

const DEFAULT_CALIBRATION_MODE: AutoDraftCalibrationMode = "auto";
type PreviewDragState = {
  startX: number;
  startY: number;
  startPan: PanOffset;
  hasMoved: boolean;
  maxDistance: number;
};

const PDF_PREVIEW_BASE_SCALE = 1.2;
const PDF_PREVIEW_ZOOM_STEP = 1.15;
const PREVIEW_PAN_THRESHOLD_PX = 6;

function formatMarkupColorDiagnostic(
  markup: Record<string, unknown>,
): string | null {
  const color =
    typeof markup.color === "string" && markup.color.trim().length > 0
      ? markup.color.trim()
      : "";
  const meta =
    typeof markup.meta === "object" &&
    markup.meta !== null &&
    !Array.isArray(markup.meta)
      ? (markup.meta as Record<string, unknown>)
      : null;
  const colorHex =
    meta &&
    typeof meta.color_hex === "string" &&
    meta.color_hex.trim().length > 0
      ? meta.color_hex.trim().toUpperCase()
      : "";
  const colorSource =
    meta &&
    typeof meta.color_source === "string" &&
    meta.color_source.trim().length > 0
      ? meta.color_source.trim().toUpperCase()
      : "";
  if (!color && !colorHex && !colorSource) return null;
  const tokens = [color || "unknown"];
  if (colorHex) tokens.push(colorHex);
  if (colorSource) tokens.push(`via ${colorSource}`);
  return tokens.join(" | ");
}

function toSafeIdToken(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
}

interface AutoDraftComparePanelProps {
  onAutomationSnapshotChange?: (snapshot: AutoDraftAutomationSnapshot) => void;
  projectId?: string | null;
  issueSetId?: string | null;
  selectedDrawingPaths?: string[];
}

export function AutoDraftComparePanel({
  onAutomationSnapshotChange,
  projectId = null,
  issueSetId = null,
  selectedDrawingPaths = [],
}: AutoDraftComparePanelProps = {}) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [prepareResult, setPrepareResult] =
    useState<AutoDraftComparePrepareResponse | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [loadingPrepare, setLoadingPrepare] = useState(false);
  const [compareResult, setCompareResult] =
    useState<AutoDraftCompareResponse | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [feedbackStateByActionId, setFeedbackStateByActionId] = useState<
    Record<string, "idle" | "saving" | "saved" | "error">
  >({});
  const [feedbackMessageByActionId, setFeedbackMessageByActionId] = useState<
    Record<string, string>
  >({});
  const [feedbackTransferState, setFeedbackTransferState] = useState<{
    color: "muted" | "warning" | "success";
    message: string;
  } | null>(null);
  const [markupTrainingState, setMarkupTrainingState] = useState<{
    color: "muted" | "warning" | "success";
    message: string;
  } | null>(null);
  const [replacementTrainingState, setReplacementTrainingState] = useState<{
    color: "muted" | "warning" | "success";
    message: string;
  } | null>(null);
  const [replacementLearningSummary, setReplacementLearningSummary] =
    useState<LearningSummaryState>(EMPTY_LEARNING_SUMMARY);
  const [reviewSelectionByActionId, setReviewSelectionByActionId] = useState<
    Record<string, string>
  >({});
  const [reviewNoteByActionId, setReviewNoteByActionId] = useState<
    Record<string, string>
  >({});
  const [markupReviewDraftByActionId, setMarkupReviewDraftByActionId] =
    useState<Record<string, MarkupReviewDraft>>({});
  const [pdfPoints, setPdfPoints] = useState<AutoDraftComparePoint[]>([]);
  const [cadPoints, setCadPoints] =
    useState<CadPointInput[]>(DEFAULT_CAD_POINTS);
  const [calibrationMode, setCalibrationMode] =
    useState<AutoDraftCalibrationMode>(DEFAULT_CALIBRATION_MODE);
  const [manualOverride, setManualOverride] = useState<boolean>(false);
  const [roiBounds, setRoiBounds] = useState<AutoDraftCompareRoi | null>(null);
  const [roiDrawMode, setRoiDrawMode] = useState<boolean>(false);
  const [roiDrawStart, setRoiDrawStart] =
    useState<AutoDraftComparePoint | null>(null);
  const [engine, setEngine] = useState<AutoDraftCompareEngine>("auto");
  const [tolerance, setTolerance] =
    useState<AutoDraftToleranceProfile>("medium");
  const [replacementTuning, setReplacementTuning] =
    useState<ReplacementTuningInput>(DEFAULT_REPLACEMENT_TUNING);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [canvasNaturalWidth, setCanvasNaturalWidth] = useState<number>(0);
  const [canvasNaturalHeight, setCanvasNaturalHeight] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<PanOffset>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [publishingSnapshot, setPublishingSnapshot] = useState(false);
  const [selectedDrawingPath, setSelectedDrawingPath] = useState<string>("");
  const [publishedSnapshot, setPublishedSnapshot] =
    useState<ProjectMarkupSnapshotRecord | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewGridRef = useRef<HTMLDivElement | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const feedbackImportInputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<PageViewport | null>(null);
  const previewDragRef = useRef<PreviewDragState | null>(null);
  const suppressNextCanvasClickRef = useRef(false);

  const pageCount = pdfDoc?.numPages ?? 0;
  const pageNumber = pageIndex + 1;
  const pageNumberLabel = useMemo(
    () => (pageCount > 0 ? `${pageNumber} / ${pageCount}` : "No PDF loaded"),
    [pageCount, pageNumber],
  );
  const invalidPageSelection = pageCount > 0 && pageIndex >= pageCount;
  const prepareDisabled =
    !pdfFile || loadingPrepare || loadingPdf || invalidPageSelection;
  const compareDisabled =
    loadingCompare || loadingPrepare || loadingPdf || !prepareResult;
  const requireManualCalibration = calibrationMode === "manual";
  const nextPointLabel = roiDrawMode
    ? roiDrawStart
      ? "ROI draw: click second corner to finish selection."
      : "ROI draw: click first corner on PDF preview."
    : !requireManualCalibration
      ? manualOverride
        ? "Auto-calibration is active. Manual points are optional and will only be used if auto-calibration fails."
        : "Auto-calibration is active. Manual points are optional."
      : pdfPoints.length === 0
        ? "Next point: click P1 on the PDF preview."
        : pdfPoints.length === 1
          ? "Next point: click P2 on the PDF preview."
          : "Two points captured. Next click rolls forward and replaces P1.";
  const latestPointIndex = pdfPoints.length > 0 ? pdfPoints.length - 1 : null;
  const zoomPercentLabel = `${Math.round(zoom * 100)}%`;
  const compareActionById = useMemo(
    () => buildCompareActionById(compareResult),
    [compareResult],
  );
  const reviewQueue = useMemo(
    () => buildReviewQueue(compareResult),
    [compareResult],
  );
  const markupReviewQueue = useMemo(
    () => buildMarkupReviewQueue(compareResult),
    [compareResult],
  );
  const prepareColorSourcesSummary = useMemo(
    () => buildPrepareColorSourcesSummary(prepareResult),
    [prepareResult],
  );
  const previewOperations = useMemo(
    () => compareResult?.preview_operations ?? [],
    [compareResult],
  );
  const commitReadyCount = useMemo(
    () =>
      previewOperations.filter((operation) => operation.approved !== false)
        .length,
    [previewOperations],
  );
  const commitBlockedCount = useMemo(() => {
    const totalPlanned = compareResult?.plan.actions.length ?? 0;
    return Math.max(0, totalPlanned - previewOperations.length);
  }, [compareResult?.plan.actions.length, previewOperations.length]);
  const prepareTextFallbackSummary = useMemo(
    () => buildPrepareTextFallbackSummary(prepareResult),
    [prepareResult],
  );
  const prepareStatus = useMemo(
    () =>
      buildPrepareStatus({
        loadingPdf,
        loadingPrepare,
        prepareError,
        prepareResult,
      }),
    [loadingPdf, loadingPrepare, prepareError, prepareResult],
  );
  const automationQueueItems = useMemo<AutomationQueueItem[]>(
    () => [
      ...markupReviewQueue.map((item) => {
        const action = compareActionById.get(item.action_id);
        const predictedCategory = String(
          item.predicted_category || action?.category || "",
        ).toLowerCase();
        let bindingKind: AutomationQueueItem["bindingKind"] = "drawing-row";
        if (
          predictedCategory.includes("title") ||
          String(item.message || "")
            .toLowerCase()
            .includes("title block")
        ) {
          bindingKind = "title-block";
        } else if (
          predictedCategory.includes("terminal") ||
          predictedCategory.includes("wire")
        ) {
          bindingKind = "terminal-wiring";
        } else if (predictedCategory.includes("schedule")) {
          bindingKind = "schedule-row";
        } else if (predictedCategory.includes("note")) {
          bindingKind = "note-only";
        }
        return {
          id: `autodraft-markup:${String(item.action_id || item.id)}`,
          source: "autodraft",
          status: "needs-review",
          bindingKind,
          label: String(item.message || "Markup review item"),
          detail: item.predicted_category
            ? `Predicted ${item.predicted_category} • confidence ${item.confidence.toFixed(2)}`
            : `Confidence ${item.confidence.toFixed(2)}`,
          suggestedTarget: action?.category || item.predicted_category || null,
          drawingNumber: null,
        } satisfies AutomationQueueItem;
      }),
      ...reviewQueue.map(
        (item) =>
          ({
            id: `autodraft-replacement:${String(item.action_id || item.id)}`,
            source: "autodraft",
            status: item.status === "resolved" ? "planned" : "needs-review",
            bindingKind: "drawing-row",
            label: String(item.message || "Replacement review item"),
            detail: `New text ${item.new_text || "unknown"} • confidence ${item.confidence.toFixed(2)}`,
            suggestedTarget: item.selected_entity_id || null,
            drawingNumber: null,
          }) satisfies AutomationQueueItem,
      ),
    ],
    [compareActionById, markupReviewQueue, reviewQueue],
  );

  useEffect(() => {
    const nextSelected =
      selectedDrawingPath && selectedDrawingPaths.includes(selectedDrawingPath)
        ? selectedDrawingPath
        : selectedDrawingPaths[0] || "";
    if (nextSelected !== selectedDrawingPath) {
      setSelectedDrawingPath(nextSelected);
    }
  }, [selectedDrawingPath, selectedDrawingPaths]);

  useEffect(() => {
    onAutomationSnapshotChange?.({
      sourceName: pdfFile?.name || null,
      requestId: compareResult?.requestId || null,
      markupSnapshotId: publishedSnapshot?.id ?? null,
      markupSnapshotIds: publishedSnapshot ? [publishedSnapshot.id] : [],
      drawingPath:
        publishedSnapshot?.drawingPath ?? (selectedDrawingPath || null),
      drawingName:
        publishedSnapshot?.drawingName ??
        (selectedDrawingPath
          ? selectedDrawingPath.split(/[\\/]/).pop() || selectedDrawingPath
          : null),
      contractVersion:
        publishedSnapshot?.contractVersion ?? "bluebeam-default.v1",
      preparedMarkupCount: prepareResult?.markups.length ?? 0,
      markupReviewCount: markupReviewQueue.length,
      replacementReviewCount: reviewQueue.length,
      commitReadyCount,
      commitBlockedCount,
      selectedActionIds:
        compareResult?.plan.actions.map((action) => action.id) ?? [],
      selectedOperationIds: previewOperations.map((operation) => operation.id),
      previewOperations,
      warnings: [
        ...(prepareResult?.warnings ?? []),
        ...(compareResult?.backcheck.warnings ?? []),
      ],
      reviewedRunBundle: publishedSnapshot?.reviewedBundleJson ?? null,
      publishedSnapshots: publishedSnapshot ? [publishedSnapshot] : [],
      warningCount:
        (prepareResult?.warnings.length ?? 0) +
        (compareResult?.backcheck.warnings.length ?? 0) +
        (compareError ? 1 : 0) +
        (prepareError ? 1 : 0),
      readyForPlan: Boolean(compareResult),
      summary: compareResult
        ? `${previewOperations.length} managed write operation${
            previewOperations.length === 1 ? "" : "s"
          } staged from ${pdfFile?.name || "the current compare run"}${
            publishedSnapshot
              ? ` and published to ${publishedSnapshot.drawingName || publishedSnapshot.drawingPath}.`
              : "."
          }`
        : prepareResult
          ? `${prepareResult.markups.length} markups prepared and ready for compare.`
          : "Load a marked PDF and run prepare to build markup intents.",
      queueItems: automationQueueItems,
    });
  }, [
    automationQueueItems,
    commitBlockedCount,
    commitReadyCount,
    compareError,
    compareResult,
    markupReviewQueue.length,
    onAutomationSnapshotChange,
    pdfFile?.name,
    previewOperations,
    prepareError,
    prepareResult,
    publishedSnapshot,
    reviewQueue.length,
    selectedDrawingPath,
  ]);

  const fitPreviewToViewport = useCallback(() => {
    const viewportElement = previewViewportRef.current;
    if (
      !viewportElement ||
      canvasNaturalWidth <= 0 ||
      canvasNaturalHeight <= 0
    ) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const viewportRect = viewportElement.getBoundingClientRect();
    const scaleByWidth = viewportRect.width / canvasNaturalWidth;
    const scaleByHeight = viewportRect.height / canvasNaturalHeight;
    const nextZoom = clampZoom(Math.min(scaleByWidth, scaleByHeight, 1));
    const stageWidth = canvasNaturalWidth * nextZoom;
    const stageHeight = canvasNaturalHeight * nextZoom;
    setZoom(nextZoom);
    setPan({
      x: (viewportRect.width - stageWidth) / 2,
      y: (viewportRect.height - stageHeight) / 2,
    });
  }, [canvasNaturalHeight, canvasNaturalWidth]);

  const setZoomAroundViewportPoint = useCallback(
    (nextZoomRaw: number, anchor: { x: number; y: number } | null) => {
      const viewportElement = previewViewportRef.current;
      if (!viewportElement || !Number.isFinite(zoom) || zoom <= 0) {
        setZoom(clampZoom(nextZoomRaw));
        return;
      }

      const resolved = buildPanForZoomAroundPoint({
        currentZoom: zoom,
        nextZoomRaw,
        pan,
        anchor,
        viewportSize: {
          width: viewportElement.clientWidth,
          height: viewportElement.clientHeight,
        },
      });
      if (!resolved) return;
      setPan(resolved.nextPan);
      setZoom(resolved.nextZoom);
    },
    [pan, zoom],
  );

  const zoomIn = useCallback(() => {
    setZoomAroundViewportPoint(zoom * PDF_PREVIEW_ZOOM_STEP, null);
  }, [setZoomAroundViewportPoint, zoom]);

  const zoomOut = useCallback(() => {
    setZoomAroundViewportPoint(zoom / PDF_PREVIEW_ZOOM_STEP, null);
  }, [setZoomAroundViewportPoint, zoom]);

  const resetPreviewView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const onPreviewPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      previewDragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startPan: { ...pan },
        hasMoved: false,
        maxDistance: 0,
      };
    },
    [pan],
  );

  const onPreviewPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = previewDragRef.current;
      if (!dragState) return;
      if ((event.buttons & 1) !== 1) return;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      const distance = Math.hypot(dx, dy);
      dragState.maxDistance = Math.max(dragState.maxDistance, distance);
      if (distance >= PREVIEW_PAN_THRESHOLD_PX) {
        dragState.hasMoved = true;
        setIsPanning(true);
        setPan({
          x: dragState.startPan.x + dx,
          y: dragState.startPan.y + dy,
        });
      }
    },
    [],
  );

  const appendPdfPoint = useCallback((nextPoint: AutoDraftComparePoint) => {
    setPdfPoints((prev) => {
      if (prev.length === 0) return [nextPoint];
      if (prev.length === 1) return [prev[0], nextPoint];
      return [prev[1], nextPoint];
    });
  }, []);

  const handlePreviewPointCapture = useCallback(
    (nextPoint: AutoDraftComparePoint) => {
      if (roiDrawMode) {
        if (!roiDrawStart) {
          setRoiDrawStart(nextPoint);
          return;
        }
        setRoiBounds(buildRoiFromPointPair(roiDrawStart, nextPoint));
        setRoiDrawStart(null);
        setRoiDrawMode(false);
        return;
      }
      appendPdfPoint(nextPoint);
    },
    [appendPdfPoint, roiDrawMode, roiDrawStart],
  );

  const onPreviewPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = previewDragRef.current;
      if (!dragState) return;
      if (dragState.hasMoved) {
        suppressNextCanvasClickRef.current = true;
      } else {
        const viewport = viewportRef.current;
        const canvas = canvasRef.current;
        if (viewport && canvas) {
          const rect = canvas.getBoundingClientRect();
          if (
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom
          ) {
            const nextPoint = mapCanvasClientPointToPdf({
              clientX: event.clientX,
              clientY: event.clientY,
              rect,
              canvasWidth: canvas.width,
              canvasHeight: canvas.height,
              viewport,
            });
            if (nextPoint) {
              handlePreviewPointCapture(nextPoint);
              suppressNextCanvasClickRef.current = true;
              if (import.meta.env.DEV) {
                logger.debug(
                  "Captured PDF calibration point (pointer-up)",
                  "AutoDraftComparePanel",
                  { point: nextPoint },
                );
              }
            } else if (import.meta.env.DEV) {
              logger.warn(
                "Pointer-up inside canvas but PDF point mapping returned null",
                "AutoDraftComparePanel",
                {
                  canvasRect: {
                    width: rect.width,
                    height: rect.height,
                  },
                  canvas: {
                    width: canvas.width,
                    height: canvas.height,
                  },
                },
              );
            }
          }
        }
      }
      previewDragRef.current = null;
      setIsPanning(false);
    },
    [handlePreviewPointCapture],
  );

  const onPreviewWheelNative = useCallback(
    (event: WheelEvent) => {
      const viewportElement = previewViewportRef.current;
      if (!viewportElement) return;
      if (event.cancelable) {
        event.preventDefault();
      }
      const viewportRect = viewportElement.getBoundingClientRect();
      const anchor = {
        x: event.clientX - viewportRect.left,
        y: event.clientY - viewportRect.top,
      };
      const multiplier =
        event.deltaY < 0 ? PDF_PREVIEW_ZOOM_STEP : 1 / PDF_PREVIEW_ZOOM_STEP;
      setZoomAroundViewportPoint(zoom * multiplier, anchor);
    },
    [setZoomAroundViewportPoint, zoom],
  );

  const suppressGridPageScrollNative = useCallback((event: WheelEvent) => {
    if (event.cancelable) {
      event.preventDefault();
    }
  }, []);

  const projectedPdfPoints = useMemo(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) {
      return [] as Array<{ index: number; projection: PointProjection }>;
    }
    return pdfPoints
      .map((point, index) => {
        const projection = mapPdfPointToCanvasPercent({
          pdfPoint: point,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          viewport,
        });
        if (!projection) return null;
        return {
          index,
          projection,
        };
      })
      .filter(
        (entry): entry is { index: number; projection: PointProjection } =>
          Boolean(entry),
      );
  }, [pdfPoints]);

  const projectedRoi = useMemo(() => {
    if (!roiBounds) return null;
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return null;
    const topLeft = mapPdfPointToCanvasPercent({
      pdfPoint: { x: roiBounds.x, y: roiBounds.y + roiBounds.height },
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      viewport,
    });
    const bottomRight = mapPdfPointToCanvasPercent({
      pdfPoint: { x: roiBounds.x + roiBounds.width, y: roiBounds.y },
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      viewport,
    });
    if (!topLeft || !bottomRight) return null;
    const left = Math.min(topLeft.leftPercent, bottomRight.leftPercent);
    const top = Math.min(topLeft.topPercent, bottomRight.topPercent);
    const width = Math.abs(bottomRight.leftPercent - topLeft.leftPercent);
    const height = Math.abs(bottomRight.topPercent - topLeft.topPercent);
    return { left, top, width, height };
  }, [roiBounds]);

  const projectedRoiStart = useMemo(() => {
    if (!roiDrawStart) return null;
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return null;
    return mapPdfPointToCanvasPercent({
      pdfPoint: roiDrawStart,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      viewport,
    });
  }, [roiDrawStart]);

  const canvasStageStyle = useMemo<CSSProperties | undefined>(
    () =>
      canvasNaturalWidth > 0 && canvasNaturalHeight > 0
        ? {
            width: `${canvasNaturalWidth}px`,
            height: `${canvasNaturalHeight}px`,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "top left",
          }
        : undefined,
    [canvasNaturalHeight, canvasNaturalWidth, pan.x, pan.y, zoom],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    logger.info("Configured PDF.js worker", "AutoDraftComparePanel", {
      workerSrc: GlobalWorkerOptions.workerSrc || null,
    });
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onWindowError = (event: ErrorEvent) => {
      const source = String(event.filename || "");
      const message = String(event.message || "");
      const isRelevant =
        source.includes("pdf.worker") ||
        source.includes("react-dom_client") ||
        message.includes("pdf.worker") ||
        message.includes("react-dom_client");
      if (!isRelevant) return;
      logger.error("Window error captured", "AutoDraftComparePanel", {
        source,
        message,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason ?? "");
      const reasonLower = reason.toLowerCase();
      if (
        !reasonLower.includes("pdf.worker") &&
        !reasonLower.includes("react-dom_client")
      ) {
        return;
      }
      logger.error(
        "Unhandled rejection captured",
        "AutoDraftComparePanel",
        event.reason,
      );
    };
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    if (!pdfFile) {
      setPdfDoc(null);
      setCanvasNaturalWidth(0);
      setCanvasNaturalHeight(0);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setRoiBounds(null);
      setRoiDrawMode(false);
      setRoiDrawStart(null);
      previewDragRef.current = null;
      viewportRef.current = null;
      return;
    }
    let cancelled = false;
    setLoadingPdf(true);
    setRenderError(null);
    setPrepareResult(null);
    setPrepareError(null);
    setCompareResult(null);
    setCompareError(null);
    setPdfPoints([]);
    setRoiBounds(null);
    setRoiDrawMode(false);
    setRoiDrawStart(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    previewDragRef.current = null;

    void (async () => {
      try {
        const bytes = await pdfFile.arrayBuffer();
        if (import.meta.env.DEV) {
          logger.debug("Loading PDF for compare", "AutoDraftComparePanel", {
            fileName: pdfFile.name,
            fileBytes: pdfFile.size,
            workerSrc: GlobalWorkerOptions.workerSrc || null,
          });
        }
        const loadingTask = getDocument({ data: bytes });
        loadingTask.onProgress = (progressData: {
          loaded: number;
          total?: number;
        }) => {
          if (!import.meta.env.DEV) return;
          logger.debug("PDF loading progress", "AutoDraftComparePanel", {
            loaded: progressData.loaded,
            total: progressData.total ?? null,
          });
        };
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setPageIndex((current) => (current >= doc.numPages ? 0 : current));
      } catch (error) {
        if (cancelled) return;
        setPdfDoc(null);
        logger.error(
          "Failed to load PDF preview",
          "AutoDraftComparePanel",
          error,
        );
        setRenderError(
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to load PDF preview.",
        );
      } finally {
        if (!cancelled) {
          setLoadingPdf(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfFile]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || !pdfDoc || pageIndex < 0 || pageIndex >= pdfDoc.numPages) {
      return;
    }

    void (async () => {
      try {
        setRenderError(null);
        const page = await pdfDoc.getPage(pageIndex + 1);
        if (cancelled) return;
        const deviceScale = Math.max(window.devicePixelRatio || 1, 1);
        const displayViewport = page.getViewport({
          scale: PDF_PREVIEW_BASE_SCALE,
        });
        const renderViewport = page.getViewport({
          scale: PDF_PREVIEW_BASE_SCALE * deviceScale,
        });
        viewportRef.current = renderViewport;
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        canvas.style.width = `${Math.ceil(displayViewport.width)}px`;
        canvas.style.height = "auto";
        setCanvasNaturalWidth(Math.ceil(displayViewport.width));
        setCanvasNaturalHeight(Math.ceil(displayViewport.height));
        await page.render({
          canvas,
          canvasContext: context,
          viewport: renderViewport,
        }).promise;
      } catch (error) {
        if (!cancelled) {
          logger.error(
            "Failed to render PDF preview",
            "AutoDraftComparePanel",
            error,
          );
          setRenderError(
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Failed to render PDF preview.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageIndex]);

  useEffect(() => {
    if (canvasNaturalWidth <= 0 || canvasNaturalHeight <= 0) return;
    fitPreviewToViewport();
  }, [canvasNaturalHeight, canvasNaturalWidth, fitPreviewToViewport]);

  useEffect(() => {
    const viewportElement = previewViewportRef.current;
    if (!viewportElement) return;
    viewportElement.addEventListener("wheel", onPreviewWheelNative, {
      passive: false,
    });
    return () => {
      viewportElement.removeEventListener("wheel", onPreviewWheelNative);
    };
  }, [onPreviewWheelNative]);

  useEffect(() => {
    const gridElement = previewGridRef.current;
    if (!gridElement) return;
    gridElement.addEventListener("wheel", suppressGridPageScrollNative, {
      passive: false,
    });
    return () => {
      gridElement.removeEventListener("wheel", suppressGridPageScrollNative);
    };
  }, [suppressGridPageScrollNative]);

  const updateCadPoint = useCallback(
    (index: number, field: keyof CadPointInput, value: string) => {
      setCadPoints((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    [],
  );

  const updateReplacementTuning = useCallback(
    (field: keyof ReplacementTuningInput, value: string) => {
      setReplacementTuning((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    [],
  );

  const parseReplacementTuning = useCallback(
    () => parseReplacementTuningInput(replacementTuning),
    [replacementTuning],
  );

  const parseCadPoints = useCallback((): AutoDraftComparePoint[] | null => {
    return parseCadPointInputs(cadPoints);
  }, [cadPoints]);

  const onCalibrationModeChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextMode =
        event.target.value === "manual"
          ? ("manual" as AutoDraftCalibrationMode)
          : ("auto" as AutoDraftCalibrationMode);
      setCalibrationMode(nextMode);
      if (nextMode === "manual") {
        setManualOverride(false);
      }
    },
    [],
  );

  const onPdfFileChange = useCallback((file: File | null) => {
    setPdfFile(file);
  }, []);

  const onPageNumberInputChange = useCallback(
    (rawValue: string) => {
      const nextPageNumber = Math.max(1, Math.round(Number(rawValue) || 1));
      if (pageCount > 0) {
        const nextPageIndex = Math.min(nextPageNumber, pageCount) - 1;
        setPageIndex((current) => {
          if (current === nextPageIndex) return current;
          setPdfPoints([]);
          return nextPageIndex;
        });
        return;
      }
      const nextPageIndex = nextPageNumber - 1;
      setPageIndex((current) => {
        if (current === nextPageIndex) return current;
        setPdfPoints([]);
        return nextPageIndex;
      });
    },
    [pageCount],
  );

  const onEngineChange = useCallback((value: AutoDraftCompareEngine) => {
    setEngine(value);
  }, []);

  const onToleranceChange = useCallback((value: AutoDraftToleranceProfile) => {
    setTolerance(value);
  }, []);

  const onManualOverrideChange = useCallback((checked: boolean) => {
    setManualOverride(checked);
  }, []);

  const onResetReplacementTuning = useCallback(() => {
    setReplacementTuning(DEFAULT_REPLACEMENT_TUNING);
  }, []);

  const clearRoi = useCallback(() => {
    setRoiBounds(null);
    setRoiDrawMode(false);
    setRoiDrawStart(null);
  }, []);

  const focusRoiAroundPreparedMarkups = useCallback(() => {
    const nextRoi = buildRoiAroundPreparedMarkups(prepareResult);
    if (!nextRoi) return;
    setRoiDrawMode(false);
    setRoiDrawStart(null);
    setRoiBounds(nextRoi);
  }, [prepareResult]);

  const onCanvasClick = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      if (suppressNextCanvasClickRef.current) {
        suppressNextCanvasClickRef.current = false;
        return;
      }
      const viewport = viewportRef.current;
      if (!viewport) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const nextPoint = mapCanvasClientPointToPdf({
        clientX: event.clientX,
        clientY: event.clientY,
        rect,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        viewport,
      });
      if (!nextPoint) return;
      handlePreviewPointCapture(nextPoint);
      if (import.meta.env.DEV) {
        logger.debug(
          "Captured PDF calibration point (canvas click)",
          "AutoDraftComparePanel",
          {
            point: nextPoint,
          },
        );
      }
    },
    [handlePreviewPointCapture],
  );

  const runPrepare = useCallback(async () => {
    const preflightError = validatePreparePreflight({
      hasPdfFile: Boolean(pdfFile),
      pageCount,
      pageIndex,
    });
    if (preflightError) {
      setPrepareError(preflightError);
      return;
    }
    const selectedPdfFile = pdfFile;
    if (!selectedPdfFile) {
      setPrepareError("Choose a PDF file first.");
      return;
    }
    setLoadingPrepare(true);
    setPrepareError(null);
    setCompareResult(null);
    setCompareError(null);
    setFeedbackStateByActionId({});
    setFeedbackMessageByActionId({});
    setReviewSelectionByActionId({});
    setReviewNoteByActionId({});
    setMarkupReviewDraftByActionId({});
    setFeedbackTransferState(null);
    try {
      const nextResult = await autoDraftService.prepareCompare(
        selectedPdfFile,
        pageIndex,
      );
      setPrepareResult(nextResult);
    } catch (error) {
      setPrepareResult(null);
      setPrepareError(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Compare prepare request failed.",
      );
    } finally {
      setLoadingPrepare(false);
    }
  }, [pdfFile, pageCount, pageIndex]);

  const runCompare = useCallback(async () => {
    const preflight = validateComparePreflight({
      prepareResult,
      pdfPoints,
      calibrationMode,
      manualOverride,
      parseCadPoints,
      parseReplacementTuning,
    });
    if (!preflight.ok) {
      setCompareError(preflight.error || "Compare request failed preflight.");
      return;
    }

    setLoadingCompare(true);
    setCompareError(null);
    setFeedbackStateByActionId({});
    setFeedbackMessageByActionId({});
    setReviewSelectionByActionId({});
    setReviewNoteByActionId({});
    setMarkupReviewDraftByActionId({});
    setFeedbackTransferState(null);
    try {
      const readyPrepareResult = prepareResult;
      if (!readyPrepareResult) {
        setCompareError("Run prepare first.");
        return;
      }
      const result = await autoDraftService.runCompare(
        buildCompareExecutionPayload({
          engine,
          tolerance,
          calibrationMode,
          manualOverride,
          prepareResult: readyPrepareResult,
          pdfPoints,
          cadPoints: preflight.cadPoints,
          roiBounds,
          replacementTuning: preflight.replacementTuning as Record<
            string,
            unknown
          >,
        }),
      );
      setCompareResult(result);
    } catch (error) {
      setCompareResult(null);
      setCompareError(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Compare request failed.",
      );
    } finally {
      setLoadingCompare(false);
    }
  }, [
    prepareResult,
    pdfPoints,
    parseCadPoints,
    parseReplacementTuning,
    engine,
    tolerance,
    calibrationMode,
    manualOverride,
    roiBounds,
  ]);

  const setReviewSelection = useCallback(
    (actionId: string, entityId: string) => {
      setReviewSelectionByActionId((prev) => ({
        ...prev,
        [actionId]: entityId,
      }));
    },
    [],
  );

  const setReviewNote = useCallback((actionId: string, note: string) => {
    setReviewNoteByActionId((prev) => ({
      ...prev,
      [actionId]: note,
    }));
  }, []);

  const setMarkupReviewDraft = useCallback(
    (actionId: string, patch: Partial<MarkupReviewDraft>) => {
      setMarkupReviewDraftByActionId((prev) => ({
        ...prev,
        [actionId]: {
          category: prev[actionId]?.category ?? "",
          markupClass: prev[actionId]?.markupClass ?? "",
          color: prev[actionId]?.color ?? "",
          text: prev[actionId]?.text ?? "",
          ...patch,
        },
      }));
    },
    [],
  );

  const submitReviewFeedback = useCallback(
    async (
      item: AutoDraftCompareResponse["review_queue"][number],
      mode: "approve" | "unresolved",
    ) => {
      if (!compareResult) return;
      const actionId = String(item.action_id || "").trim();
      if (!actionId) return;

      const selectedEntityId =
        reviewSelectionByActionId[actionId] ||
        item.selected_entity_id ||
        "" ||
        item.candidates[0]?.entity_id ||
        "";
      const selectedCandidate =
        item.candidates.find((entry) => entry.entity_id === selectedEntityId) ||
        item.candidates[0];
      const selectedOldText =
        selectedCandidate?.text || item.selected_old_text || "";
      const existingEntityId = String(item.selected_entity_id || "").trim();

      const reviewStatus =
        mode === "unresolved"
          ? "unresolved"
          : selectedEntityId && selectedEntityId !== existingEntityId
            ? "corrected"
            : "approved";

      setFeedbackStateByActionId((prev) => ({ ...prev, [actionId]: "saving" }));
      setFeedbackMessageByActionId((prev) => ({ ...prev, [actionId]: "" }));

      try {
        await autoDraftService.submitCompareFeedback({
          requestId: compareResult.requestId,
          items: [
            {
              request_id: item.request_id || compareResult.requestId,
              action_id: actionId,
              review_status: reviewStatus,
              new_text: item.new_text,
              selected_old_text: mode === "unresolved" ? "" : selectedOldText,
              selected_entity_id: mode === "unresolved" ? "" : selectedEntityId,
              confidence:
                typeof selectedCandidate?.score === "number"
                  ? selectedCandidate.score
                  : item.confidence,
              note: reviewNoteByActionId[actionId] || "",
              candidates: item.candidates,
              selected_candidate:
                mode === "unresolved" || !selectedCandidate
                  ? undefined
                  : selectedCandidate,
            },
          ],
        });

        setFeedbackStateByActionId((prev) => ({
          ...prev,
          [actionId]: "saved",
        }));
        setFeedbackMessageByActionId((prev) => ({
          ...prev,
          [actionId]:
            reviewStatus === "corrected"
              ? "Correction saved."
              : reviewStatus === "approved"
                ? "Review approved and saved."
                : "Marked unresolved and saved.",
        }));
      } catch (error) {
        setFeedbackStateByActionId((prev) => ({
          ...prev,
          [actionId]: "error",
        }));
        setFeedbackMessageByActionId((prev) => ({
          ...prev,
          [actionId]:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Failed to save review feedback.",
        }));
      }
    },
    [compareResult, reviewNoteByActionId, reviewSelectionByActionId],
  );

  const submitMarkupReviewFeedback = useCallback(
    async (
      item: AutoDraftCompareResponse["markup_review_queue"][number],
      mode: "approve" | "unresolved",
    ) => {
      if (!compareResult) return;
      const rawActionId = String(item.action_id || "").trim();
      if (!rawActionId) return;
      const action = compareActionById.get(rawActionId);
      const submission = buildMarkupReviewSubmission({
        item,
        action,
        compareRequestId: compareResult.requestId,
        storedDraft: markupReviewDraftByActionId[rawActionId],
        note: reviewNoteByActionId[rawActionId] || "",
        mode,
      });
      if (!submission) return;
      const actionId = submission.actionId;

      setFeedbackStateByActionId((prev) => ({ ...prev, [actionId]: "saving" }));
      setFeedbackMessageByActionId((prev) => ({ ...prev, [actionId]: "" }));

      try {
        await autoDraftService.submitCompareFeedback({
          requestId: compareResult.requestId,
          items: [submission.payload],
        });

        setFeedbackStateByActionId((prev) => ({
          ...prev,
          [actionId]: "saved",
        }));
        setFeedbackMessageByActionId((prev) => ({
          ...prev,
          [actionId]: submission.successMessage,
        }));
      } catch (error) {
        setFeedbackStateByActionId((prev) => ({
          ...prev,
          [actionId]: "error",
        }));
        setFeedbackMessageByActionId((prev) => ({
          ...prev,
          [actionId]:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Failed to save markup review feedback.",
        }));
      }
    },
    [
      compareActionById,
      compareResult,
      markupReviewDraftByActionId,
      reviewNoteByActionId,
    ],
  );

  const trainMarkupModel = useCallback(async () => {
    try {
      setMarkupTrainingState({
        color: "muted",
        message: "Training local markup model...",
      });
      const payload = await autoDraftService.trainLearningModels({
        domain: "autodraft_markup",
      });
      setMarkupTrainingState(summarizeMarkupTrainingResult(payload.results));
    } catch (error) {
      setMarkupTrainingState({
        color: "warning",
        message:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to train local markup model.",
      });
    }
  }, []);

  const refreshReplacementLearningStatus = useCallback(async () => {
    setReplacementLearningSummary((prev) => ({
      ...prev,
      loading: true,
      error: null,
    }));
    try {
      const [modelsRaw, evaluationsRaw] = await Promise.all([
        autoDraftService.listLearningModels("autodraft_replacement"),
        autoDraftService.listLearningEvaluations({
          domain: "autodraft_replacement",
          limit: 1,
        }),
      ]);
      const models = Array.isArray(modelsRaw) ? modelsRaw : [];
      const evaluations = Array.isArray(evaluationsRaw) ? evaluationsRaw : [];
      setReplacementLearningSummary({
        loading: false,
        error: null,
        model: models.find((entry) => entry.active) || models[0] || null,
        evaluation: evaluations[0] || null,
      });
    } catch (error) {
      setReplacementLearningSummary({
        loading: false,
        model: null,
        evaluation: null,
        error:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to load replacement learning status.",
      });
    }
  }, []);

  const trainReplacementModel = useCallback(async () => {
    try {
      setReplacementTrainingState({
        color: "muted",
        message: "Training local replacement model...",
      });
      const payload = await autoDraftService.trainLearningModels({
        domain: "autodraft_replacement",
      });
      setReplacementTrainingState(
        summarizeReplacementTrainingResult(payload.results),
      );
      await refreshReplacementLearningStatus();
    } catch (error) {
      setReplacementTrainingState({
        color: "warning",
        message:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to train local replacement model.",
      });
    }
  }, [refreshReplacementLearningStatus]);

  const exportFeedbackMemory = useCallback(async () => {
    try {
      setFeedbackTransferState({
        color: "muted",
        message: "Exporting compare feedback memory...",
      });
      const payload = await autoDraftService.exportCompareFeedback();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const pack = buildJsonDownloadPackage(
        payload,
        `autodraft-compare-feedback-${stamp}.json`,
      );
      const blob = new Blob([pack.text], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = pack.filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setFeedbackTransferState({
        color: "success",
        message: `Exported feedback memory (${payload.events.length} event${payload.events.length === 1 ? "" : "s"}).`,
      });
    } catch (error) {
      setFeedbackTransferState({
        color: "warning",
        message:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to export compare feedback memory.",
      });
    }
  }, []);

  const exportReviewedRun = useCallback(async () => {
    if (!prepareResult || !compareResult) return;
    try {
      setFeedbackTransferState({
        color: "muted",
        message: "Exporting reviewed run bundle...",
      });
      const bundle = await autoDraftService.exportReviewedRunBundle({
        prepare: prepareResult,
        compare: compareResult,
        label: pdfFile?.name || compareResult.requestId,
      });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const pack = buildJsonDownloadPackage(
        bundle,
        `autodraft-reviewed-run-${stamp}.json`,
      );
      const blob = new Blob([pack.text], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = pack.filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setFeedbackTransferState({
        color: "success",
        message: `Exported reviewed run bundle (${bundle.feedback.eventCount} feedback item${bundle.feedback.eventCount === 1 ? "" : "s"}).`,
      });
    } catch (error) {
      setFeedbackTransferState({
        color: "warning",
        message:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to export reviewed run bundle.",
      });
    }
  }, [compareResult, pdfFile, prepareResult]);

  const publishReviewedRun = useCallback(async () => {
    if (
      !projectId ||
      !prepareResult ||
      !compareResult ||
      !selectedDrawingPath
    ) {
      setFeedbackTransferState({
        color: "warning",
        message:
          "Publishing requires a project, a selected drawing binding, and a completed compare run.",
      });
      return;
    }
    try {
      setPublishingSnapshot(true);
      setFeedbackTransferState({
        color: "muted",
        message: "Publishing reviewed Bluebeam bundle to the project...",
      });
      const bundle = await autoDraftService.exportReviewedRunBundle({
        prepare: prepareResult,
        compare: compareResult,
        label: pdfFile?.name || compareResult.requestId,
      });
      const drawingName =
        selectedDrawingPath.split(/[\\/]/).pop() || selectedDrawingPath;
      const boundOperations = previewOperations.map((operation) => ({
        ...operation,
        drawingPath: selectedDrawingPath,
        drawingName,
        relativePath: selectedDrawingPath,
        managedKey: operation.managedKey
          ? {
              ...operation.managedKey,
              drawingPath: selectedDrawingPath,
            }
          : operation.managedKey,
      }));
      const comparePayload = {
        ...(compareResult as unknown as Record<string, unknown>),
        preview_operations: boundOperations,
      };
      const saveResult = await projectMarkupSnapshotService.saveSnapshot({
        projectId,
        issueSetId,
        drawingPath: selectedDrawingPath,
        drawingName,
        sourcePdfName: pdfFile?.name || "Marked drawing.pdf",
        pageIndex: prepareResult.page.index,
        contractVersion: "bluebeam-default.v1",
        preparePayload: prepareResult as unknown as Record<string, unknown>,
        comparePayload,
        selectedActionIds: compareResult.plan.actions.map(
          (action) => action.id,
        ),
        selectedOperationIds: boundOperations.map((operation) => operation.id),
        reviewedBundleJson: bundle,
        revisionContext: {},
        warnings: [
          ...(prepareResult.warnings ?? []),
          ...(compareResult.backcheck.warnings ?? []),
        ],
      });
      if (saveResult.error) {
        throw saveResult.error;
      }
      setPublishedSnapshot(saveResult.data);
      setFeedbackTransferState({
        color: "success",
        message: `Published ${drawingName} page ${prepareResult.page.index + 1} to project markup snapshots.`,
      });
    } catch (error) {
      setFeedbackTransferState({
        color: "warning",
        message:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to publish the reviewed run bundle.",
      });
    } finally {
      setPublishingSnapshot(false);
    }
  }, [
    compareResult,
    issueSetId,
    pdfFile?.name,
    prepareResult,
    previewOperations,
    projectId,
    selectedDrawingPath,
  ]);

  const triggerFeedbackImport = useCallback(() => {
    feedbackImportInputRef.current?.click();
  }, []);

  const onFeedbackImportChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";
      if (!file) return;
      try {
        setFeedbackTransferState({
          color: "muted",
          message: `Importing ${file.name}...`,
        });
        const text = await file.text();
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const importPayload = parseCompareFeedbackImportPayload(parsed);
        const result = await autoDraftService.importCompareFeedback({
          mode: "merge",
          ...importPayload,
        });
        const imported = result.imported;
        setFeedbackTransferState({
          color: "success",
          message: imported
            ? `Imported feedback memory: ${imported.events} events, ${imported.pairs} pairs, ${imported.metrics} metrics.`
            : "Imported feedback memory.",
        });
      } catch (error) {
        setFeedbackTransferState({
          color: "warning",
          message:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Failed to import compare feedback memory.",
        });
      }
    },
    [],
  );

  const exportCompare = useCallback(() => {
    if (!compareResult) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const pack = buildJsonDownloadPackage(
      compareResult,
      `autodraft-compare-${stamp}.json`,
    );
    const blob = new Blob([pack.text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = pack.filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [compareResult]);

  const exportPrepare = useCallback(() => {
    if (!prepareResult) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const pack = buildJsonDownloadPackage(
      prepareResult,
      `autodraft-prepare-${stamp}.json`,
    );
    const blob = new Blob([pack.text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = pack.filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [prepareResult]);

  useEffect(() => {
    if (!compareResult) {
      setReplacementLearningSummary(EMPTY_LEARNING_SUMMARY);
      return;
    }
    void refreshReplacementLearningStatus();
  }, [compareResult, refreshReplacementLearningStatus]);

  return (
    <div className={styles.comparePanel}>
      <HStack gap={2} align="center" justify="between">
        <Text size="sm" weight="semibold">
          Bluebeam Compare (QA-only)
        </Text>
        <Button
          variant="outline"
          size="sm"
          onClick={runCompare}
          disabled={compareDisabled}
          loading={loadingCompare}
        >
          Run compare
        </Button>
      </HStack>

      <AutoDraftCompareSetupSection
        pageCount={pageCount}
        pageNumber={pageNumber}
        engine={engine}
        tolerance={tolerance}
        calibrationMode={calibrationMode}
        manualOverride={manualOverride}
        loadingPrepare={loadingPrepare}
        loadingPdf={loadingPdf}
        prepareDisabled={prepareDisabled}
        replacementTuning={replacementTuning}
        prepareStatus={prepareStatus}
        prepareWarnings={prepareResult?.warnings || []}
        onPdfFileChange={onPdfFileChange}
        onPageNumberInputChange={onPageNumberInputChange}
        onEngineChange={onEngineChange}
        onToleranceChange={onToleranceChange}
        onCalibrationModeChange={onCalibrationModeChange}
        onManualOverrideChange={onManualOverrideChange}
        onRunPrepare={runPrepare}
        onReplacementTuningChange={updateReplacementTuning}
        onResetReplacementTuning={onResetReplacementTuning}
      />

      <div
        ref={previewGridRef}
        className={styles.comparePreviewWrap}
        data-testid="autodraft-compare-preview-grid"
      >
        <div>
          <HStack gap={2} align="center" justify="between" wrap>
            <Text size="xs" color="muted">
              PDF preview ({pageNumberLabel}).{" "}
              {requireManualCalibration
                ? "Manual mode: click two points to calibrate."
                : manualOverride
                  ? "Auto mode: points optional, manual fallback armed, ROI refinement available."
                  : "Auto mode: points optional, ROI refinement available."}
            </Text>
            <HStack gap={1} align="center" wrap>
              <Button
                variant={roiDrawMode ? "primary" : "ghost"}
                size="sm"
                onClick={() => {
                  setRoiDrawMode((prev) => !prev);
                  setRoiDrawStart(null);
                }}
                disabled={canvasNaturalWidth <= 0 || canvasNaturalHeight <= 0}
              >
                {roiDrawMode ? "Cancel ROI draw" : "Draw ROI"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={focusRoiAroundPreparedMarkups}
                disabled={!prepareResult || prepareResult.markups.length === 0}
              >
                Focus markups
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearRoi}
                disabled={!roiBounds && !roiDrawStart}
              >
                Clear ROI
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={fitPreviewToViewport}
                disabled={canvasNaturalWidth <= 0 || canvasNaturalHeight <= 0}
              >
                Fit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={zoomOut}
                disabled={canvasNaturalWidth <= 0 || canvasNaturalHeight <= 0}
              >
                -
              </Button>
              <Badge variant="soft" color="primary">
                {zoomPercentLabel}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={zoomIn}
                disabled={canvasNaturalWidth <= 0 || canvasNaturalHeight <= 0}
              >
                +
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  resetPreviewView();
                  clearRoi();
                }}
                disabled={canvasNaturalWidth <= 0 || canvasNaturalHeight <= 0}
              >
                Reset
              </Button>
            </HStack>
          </HStack>
          <Text size="xs" color="muted" className={styles.compareCanvasHint}>
            {nextPointLabel} Drag to pan. Scroll wheel to zoom.
          </Text>
          <div
            ref={previewViewportRef}
            className={`${styles.compareCanvasViewport} ${isPanning ? styles.compareCanvasViewportDragging : ""}`}
            data-testid="autodraft-compare-preview-viewport"
            onPointerDown={onPreviewPointerDown}
            onPointerMove={onPreviewPointerMove}
            onPointerUp={onPreviewPointerUp}
            onPointerCancel={onPreviewPointerUp}
          >
            <div className={styles.compareCanvasStage} style={canvasStageStyle}>
              <canvas
                ref={canvasRef}
                className={styles.compareCanvas}
                data-testid="autodraft-compare-preview-canvas"
                onClick={onCanvasClick}
              />
              <div className={styles.compareCanvasMarkerLayer}>
                {projectedRoi ? (
                  <span
                    className={styles.compareRoiOverlay}
                    style={{
                      left: `${projectedRoi.left}%`,
                      top: `${projectedRoi.top}%`,
                      width: `${projectedRoi.width}%`,
                      height: `${projectedRoi.height}%`,
                    }}
                  />
                ) : null}
                {projectedRoiStart ? (
                  <span
                    className={`${styles.comparePointMarker} ${styles.comparePointMarkerLatest}`}
                    style={{
                      left: `${projectedRoiStart.leftPercent}%`,
                      top: `${projectedRoiStart.topPercent}%`,
                    }}
                  >
                    R1
                  </span>
                ) : null}
                {projectedPdfPoints.map((entry) => (
                  <span
                    key={`pdf-marker-${entry.index}`}
                    data-testid={`autodraft-compare-pdf-marker-${entry.index}`}
                    className={`${styles.comparePointMarker} ${entry.index === latestPointIndex ? styles.comparePointMarkerLatest : ""}`}
                    style={{
                      left: `${entry.projection.leftPercent}%`,
                      top: `${entry.projection.topPercent}%`,
                    }}
                  >
                    P{entry.index + 1}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {renderError ? (
            <Text size="xs" color="warning">
              {renderError}
            </Text>
          ) : null}
        </div>
        <div className={styles.compareCalibrate}>
          <Text size="xs" color="muted">
            PDF calibration points
          </Text>
          <Text size="xs" color="muted">
            Calibration mode: {calibrationMode}
            {manualOverride ? " (manual fallback armed)" : ""}
          </Text>
          {roiBounds ? (
            <Text size="xs" color="muted">
              ROI: x {roiBounds.x.toFixed(1)}, y {roiBounds.y.toFixed(1)}, w{" "}
              {roiBounds.width.toFixed(1)}, h {roiBounds.height.toFixed(1)}
            </Text>
          ) : (
            <Text size="xs" color="muted">
              ROI not set. Draw ROI to refine matching or use Focus markups.
            </Text>
          )}
          {pdfPoints.length === 0 ? (
            <Text size="xs" color="muted">
              No PDF points captured yet.
            </Text>
          ) : (
            <Stack gap={1}>
              {pdfPoints.map((entry, index) => (
                <Text key={`pdf-point-${index}`} size="xs" color="muted">
                  P{index + 1}: ({entry.x.toFixed(2)}, {entry.y.toFixed(2)})
                </Text>
              ))}
            </Stack>
          )}
          <Button variant="ghost" size="sm" onClick={() => setPdfPoints([])}>
            Clear PDF points
          </Button>
          <Text size="xs" color="muted">
            CAD points (manual XY)
          </Text>
          {cadPoints.map((entry, index) => (
            <div key={`cad-point-${index}`} className={styles.compareCadRow}>
              <label
                htmlFor={`autodraft-compare-cad-p${index + 1}-x`}
                className={styles.compareFieldInline}
              >
                <span>P{index + 1} X</span>
                <input
                  id={`autodraft-compare-cad-p${index + 1}-x`}
                  name={`autodraftCompareCadP${index + 1}X`}
                  type="number"
                  value={entry.x}
                  onChange={(event) =>
                    updateCadPoint(index, "x", event.target.value)
                  }
                />
              </label>
              <label
                htmlFor={`autodraft-compare-cad-p${index + 1}-y`}
                className={styles.compareFieldInline}
              >
                <span>P{index + 1} Y</span>
                <input
                  id={`autodraft-compare-cad-p${index + 1}-y`}
                  name={`autodraftCompareCadP${index + 1}Y`}
                  type="number"
                  value={entry.y}
                  onChange={(event) =>
                    updateCadPoint(index, "y", event.target.value)
                  }
                />
              </label>
            </div>
          ))}
        </div>
      </div>

      {prepareResult ? (
        <div className={styles.compareSummary}>
          <HStack gap={2} align="center" justify="between" wrap>
            <Text size="xs" color="muted">
              Prepared {prepareResult.markups.length} markups from page{" "}
              {prepareResult.page.index + 1} of {prepareResult.page.total_pages}
              .
            </Text>
            <Button variant="ghost" size="sm" onClick={exportPrepare}>
              Export prepare JSON
            </Button>
          </HStack>
          {prepareResult.calibration_seed.available ? (
            <Text size="xs" color="muted">
              Calibration seed: {prepareResult.calibration_seed.source}
              {typeof prepareResult.calibration_seed.scale_hint === "number"
                ? `, scale hint ${prepareResult.calibration_seed.scale_hint.toFixed(4)}`
                : ""}
            </Text>
          ) : (
            <Text size="xs" color="muted">
              Calibration seed unavailable; manual two-point calibration
              required.
            </Text>
          )}
          {prepareResult.auto_calibration ? (
            <Text size="xs" color="muted">
              Auto calibration: {prepareResult.auto_calibration.status} | method{" "}
              {prepareResult.auto_calibration.method} | confidence{" "}
              {prepareResult.auto_calibration.confidence.toFixed(2)}
            </Text>
          ) : null}
          <Text
            size="xs"
            color={
              prepareResult.pdf_metadata.bluebeam_detected ? "success" : "muted"
            }
          >
            Bluebeam metadata{" "}
            {prepareResult.pdf_metadata.bluebeam_detected
              ? `detected (${prepareResult.pdf_metadata.detection_reasons.join(", ") || "signal"})`
              : "not detected"}
            .
          </Text>
          <Text size="xs" color="muted">
            Producer:{" "}
            {prepareResult.pdf_metadata.document.producer || "unknown"} |
            Creator: {prepareResult.pdf_metadata.document.creator || "unknown"}
          </Text>
          <Text size="xs" color="muted">
            Annotations: total{" "}
            {prepareResult.pdf_metadata.page.annotation_counts.total} |
            supported{" "}
            {prepareResult.pdf_metadata.page.annotation_counts.supported} |
            unsupported{" "}
            {prepareResult.pdf_metadata.page.annotation_counts.unsupported}
          </Text>
          {prepareTextFallbackSummary ? (
            <Text size="xs" color="muted">
              {prepareTextFallbackSummary}
            </Text>
          ) : null}
          {prepareColorSourcesSummary ? (
            <Text size="xs" color="muted">
              {prepareColorSourcesSummary}
            </Text>
          ) : null}
          {prepareResult.warnings.map((warning, index) => (
            <Text key={`${warning}:${index}`} size="xs" color="warning">
              {warning}
            </Text>
          ))}
        </div>
      ) : null}
      {prepareError ? (
        <Text size="sm" color="warning">
          {prepareError}
        </Text>
      ) : null}

      {compareResult ? (
        <div className={styles.compareResult}>
          <HStack gap={2} align="center" justify="between">
            <Text size="xs" color="muted">
              Engine {compareResult.engine.used}
              {compareResult.engine.used_fallback ? " (fallback)" : ""} |
              request {compareResult.requestId}
            </Text>
            <Button variant="ghost" size="sm" onClick={exportCompare}>
              Export JSON
            </Button>
          </HStack>
          <HStack gap={2} align="center" wrap>
            <Badge color="success" variant="soft">
              pass {compareResult.summary.pass_count}
            </Badge>
            <Badge color="warning" variant="soft">
              warn {compareResult.summary.warn_count}
            </Badge>
            <Badge color="danger" variant="soft">
              fail {compareResult.summary.fail_count}
            </Badge>
          </HStack>
          <Text size="xs" color="muted">
            Scale {compareResult.calibration.scale.toFixed(4)} | rotation{" "}
            {compareResult.calibration.rotation_deg.toFixed(2)} deg
          </Text>
          <Text size="xs" color="muted">
            Calibration mode: {compareResult.calibration_mode || "auto"}
          </Text>
          {compareResult.auto_calibration ? (
            <Text size="xs" color="muted">
              Auto calibration: {compareResult.auto_calibration.status} | method{" "}
              {compareResult.auto_calibration.method} | confidence{" "}
              {compareResult.auto_calibration.confidence.toFixed(2)}
            </Text>
          ) : null}
          {compareResult.recognition ? (
            <Text
              size="xs"
              color={
                compareResult.recognition.source === "local_model"
                  ? "primary"
                  : "muted"
              }
            >
              Recognition: {compareResult.recognition.source} | model{" "}
              {compareResult.recognition.modelVersion} | confidence{" "}
              {compareResult.recognition.confidence.toFixed(2)} | feature{" "}
              {compareResult.recognition.featureSource} |{" "}
              {compareResult.recognition.needsReview
                ? "review required"
                : "accepted"}
            </Text>
          ) : null}
          {compareResult.roi ? (
            <Text size="xs" color="muted">
              ROI used: x {compareResult.roi.x.toFixed(1)}, y{" "}
              {compareResult.roi.y.toFixed(1)}, w{" "}
              {compareResult.roi.width.toFixed(1)}, h{" "}
              {compareResult.roi.height.toFixed(1)}
            </Text>
          ) : null}
          {compareResult.replacement_tuning ? (
            <Text size="xs" color="muted">
              Replacement tuning: unresolved &lt;{" "}
              {compareResult.replacement_tuning.unresolved_confidence_threshold.toFixed(
                2,
              )}{" "}
              | ambiguous margin &lt;={" "}
              {compareResult.replacement_tuning.ambiguity_margin_threshold.toFixed(
                2,
              )}{" "}
              | radius x
              {compareResult.replacement_tuning.search_radius_multiplier.toFixed(
                2,
              )}
            </Text>
          ) : null}
          <div className={styles.findingList}>
            {compareResult.backcheck.findings.map((finding) => {
              const action = compareActionById.get(finding.action_id);
              const markup = action?.markup;
              const markupColorDiagnostic =
                markup && isRecordValue(markup)
                  ? formatMarkupColorDiagnostic(markup)
                  : null;
              const pairedIds =
                finding.paired_annotation_ids &&
                finding.paired_annotation_ids.length > 0
                  ? finding.paired_annotation_ids
                  : action?.paired_annotation_ids || [];
              return (
                <div key={finding.id} className={styles.findingCard}>
                  <HStack gap={2} align="center" wrap>
                    <Badge
                      color={
                        finding.status === "fail"
                          ? "danger"
                          : finding.status === "warn"
                            ? "warning"
                            : "success"
                      }
                      variant="soft"
                    >
                      {finding.status}
                    </Badge>
                    <Text size="xs" color="muted">
                      {finding.action_id} | {finding.category}
                    </Text>
                  </HStack>
                  {markupColorDiagnostic ? (
                    <Text size="xs" color="muted">
                      Markup color: {markupColorDiagnostic}
                    </Text>
                  ) : null}
                  {pairedIds.length > 0 ? (
                    <Text size="xs" color="muted">
                      Paired annotations: {pairedIds.join(", ")}
                    </Text>
                  ) : null}
                  {finding.notes.map((note) => (
                    <Text key={`${finding.id}:${note}`} size="xs" color="muted">
                      {note}
                    </Text>
                  ))}
                </div>
              );
            })}
          </div>

          <div className={styles.compareReviewPanel}>
            <HStack gap={2} align="center" justify="between" wrap>
              <Text size="xs" color="muted">
                Markup review queue ({markupReviewQueue.length})
              </Text>
              <Button variant="ghost" size="sm" onClick={trainMarkupModel}>
                Train markup model
              </Button>
            </HStack>
            {markupTrainingState ? (
              <Text size="xs" color={markupTrainingState.color}>
                {markupTrainingState.message}
              </Text>
            ) : null}
            {markupReviewQueue.length === 0 ? (
              <Text size="xs" color="muted">
                No low-confidence markup review items for this compare run.
              </Text>
            ) : (
              <div className={styles.compareReviewList}>
                {markupReviewQueue.map((item) => {
                  const action = compareActionById.get(item.action_id);
                  const actionId = String(item.action_id || "").trim();
                  const safeActionId = toSafeIdToken(actionId || item.id);
                  const feedbackState =
                    feedbackStateByActionId[actionId] || "idle";
                  const feedbackMessage =
                    feedbackMessageByActionId[actionId] || "";
                  const markup = getMarkupReviewMarkup(item, action);
                  const markupColorDiagnostic = markup
                    ? formatMarkupColorDiagnostic(markup)
                    : null;
                  const markupDraft = buildMarkupReviewDraftDefaults({
                    item,
                    action,
                    storedDraft: markupReviewDraftByActionId[actionId],
                  });
                  const predictedCategory = normalizeMarkupReviewCategory(
                    item.predicted_category || action?.category || "",
                  );
                  const predictedMarkupClass = normalizeMarkupReviewClass(
                    markup?.type,
                  );
                  const predictedColor = normalizeMarkupReviewColor(
                    markup?.color,
                  );
                  const predictedText =
                    typeof markup?.text === "string" ? markup.text.trim() : "";
                  const hasMarkupCorrections =
                    markupDraft.category !== predictedCategory ||
                    markupDraft.markupClass !== predictedMarkupClass ||
                    markupDraft.color !== predictedColor ||
                    markupDraft.text.trim() !== predictedText;
                  const noteInputId = `autodraft-markup-review-note-${safeActionId}`;
                  const categoryInputId = `autodraft-markup-review-category-${safeActionId}`;
                  const classInputId = `autodraft-markup-review-class-${safeActionId}`;
                  const colorInputId = `autodraft-markup-review-color-${safeActionId}`;
                  const textInputId = `autodraft-markup-review-text-${safeActionId}`;
                  return (
                    <div key={item.id} className={styles.compareReviewCard}>
                      <HStack gap={2} align="center" justify="between" wrap>
                        <Text size="xs" weight="semibold">
                          {actionId}
                        </Text>
                        <Badge variant="soft" color="warning">
                          {item.status}
                        </Badge>
                      </HStack>
                      <Text size="xs" color="muted">
                        {item.message}
                      </Text>
                      <Text size="xs" color="muted">
                        {item.predicted_category
                          ? `Predicted ${item.predicted_category}`
                          : "Predicted category unavailable"}
                        {item.predicted_action
                          ? ` | ${item.predicted_action}`
                          : ""}
                      </Text>
                      <Text size="xs" color="muted">
                        Confidence {item.confidence.toFixed(2)}
                        {markup &&
                        typeof markup.text === "string" &&
                        markup.text.trim().length > 0
                          ? ` | text ${markup.text}`
                          : ""}
                      </Text>
                      <Text size="xs" color="muted">
                        Current review values:
                        {` category ${markupDraft.category || predictedCategory || "unknown"}`}
                        {` | class ${markupDraft.markupClass || predictedMarkupClass || "unknown"}`}
                        {` | color ${markupDraft.color || predictedColor || "unknown"}`}
                      </Text>
                      {markupColorDiagnostic ? (
                        <Text size="xs" color="muted">
                          Markup color: {markupColorDiagnostic}
                        </Text>
                      ) : null}
                      {item.recognition ? (
                        <Text size="xs" color="muted">
                          Recognition: {item.recognition.source} | feature{" "}
                          {item.recognition.featureSource}
                        </Text>
                      ) : null}
                      {item.reason_codes.length > 0 ? (
                        <Text size="xs" color="muted">
                          Reasons: {item.reason_codes.join(", ")}
                        </Text>
                      ) : null}
                      <div className={styles.compareReviewGrid}>
                        <label
                          htmlFor={categoryInputId}
                          className={styles.compareFieldInline}
                        >
                          <span>Category</span>
                          <select
                            id={categoryInputId}
                            name={`autodraftMarkupReviewCategory-${safeActionId}`}
                            value={markupDraft.category}
                            onChange={(event) =>
                              setMarkupReviewDraft(actionId, {
                                category: normalizeMarkupReviewCategory(
                                  event.target.value,
                                ),
                              })
                            }
                          >
                            {MARKUP_REVIEW_CATEGORY_OPTIONS.map((option) => (
                              <option key={option || "default"} value={option}>
                                {option || "Use predicted"}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label
                          htmlFor={classInputId}
                          className={styles.compareFieldInline}
                        >
                          <span>Markup class</span>
                          <select
                            id={classInputId}
                            name={`autodraftMarkupReviewClass-${safeActionId}`}
                            value={markupDraft.markupClass}
                            onChange={(event) =>
                              setMarkupReviewDraft(actionId, {
                                markupClass: normalizeMarkupReviewClass(
                                  event.target.value,
                                ),
                              })
                            }
                          >
                            {MARKUP_REVIEW_CLASS_OPTIONS.map((option) => (
                              <option key={option || "default"} value={option}>
                                {option || "Use detected"}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label
                          htmlFor={colorInputId}
                          className={styles.compareFieldInline}
                        >
                          <span>Color</span>
                          <select
                            id={colorInputId}
                            name={`autodraftMarkupReviewColor-${safeActionId}`}
                            value={markupDraft.color}
                            onChange={(event) =>
                              setMarkupReviewDraft(actionId, {
                                color: normalizeMarkupReviewColor(
                                  event.target.value,
                                ),
                              })
                            }
                          >
                            {MARKUP_REVIEW_COLOR_OPTIONS.map((option) => (
                              <option key={option || "default"} value={option}>
                                {option || "Use detected"}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label
                          htmlFor={textInputId}
                          className={styles.compareFieldInline}
                        >
                          <span>Corrected text</span>
                          <input
                            id={textInputId}
                            name={`autodraftMarkupReviewText-${safeActionId}`}
                            type="text"
                            value={markupDraft.text}
                            onChange={(event) =>
                              setMarkupReviewDraft(actionId, {
                                text: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <label
                        htmlFor={noteInputId}
                        className={styles.compareFieldInline}
                      >
                        <span>Review note</span>
                        <textarea
                          id={noteInputId}
                          name={`autodraftMarkupReviewNote-${safeActionId}`}
                          className={styles.compareReviewNoteInput}
                          rows={2}
                          value={reviewNoteByActionId[actionId] || ""}
                          onChange={(event) =>
                            setReviewNote(actionId, event.target.value)
                          }
                        />
                      </label>
                      <HStack gap={1} align="center" wrap>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            submitMarkupReviewFeedback(item, "approve")
                          }
                          disabled={feedbackState === "saving"}
                        >
                          {hasMarkupCorrections
                            ? "Save markup correction"
                            : "Approve markup"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            submitMarkupReviewFeedback(item, "unresolved")
                          }
                          disabled={feedbackState === "saving"}
                        >
                          Mark unresolved
                        </Button>
                      </HStack>
                      {feedbackState === "saving" ? (
                        <Text size="xs" color="muted">
                          Saving feedback...
                        </Text>
                      ) : null}
                      {feedbackMessage ? (
                        <Text
                          size="xs"
                          color={
                            feedbackState === "error" ? "warning" : "success"
                          }
                        >
                          {feedbackMessage}
                        </Text>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={styles.compareReviewPanel}>
            <HStack gap={2} align="center" justify="between" wrap>
              <Text size="xs" color="muted">
                Replacement review queue ({reviewQueue.length})
              </Text>
              <HStack gap={1} align="center" wrap>
                {projectId && selectedDrawingPaths.length > 0 ? (
                  <>
                    <label
                      htmlFor="autodraft-compare-drawing-binding"
                      className={styles.compareInlineField}
                    >
                      <Text size="xs" color="muted">
                        Drawing binding
                      </Text>
                      <select
                        id="autodraft-compare-drawing-binding"
                        name="autodraftCompareDrawingBinding"
                        value={selectedDrawingPath}
                        onChange={(event) =>
                          setSelectedDrawingPath(event.target.value)
                        }
                      >
                        {selectedDrawingPaths.map((drawingPath) => (
                          <option key={drawingPath} value={drawingPath}>
                            {drawingPath}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void publishReviewedRun();
                      }}
                      disabled={
                        !compareResult ||
                        !prepareResult ||
                        !selectedDrawingPath ||
                        publishingSnapshot
                      }
                    >
                      {publishingSnapshot
                        ? "Publishing..."
                        : "Publish reviewed bundle"}
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={exportFeedbackMemory}
                >
                  Export feedback
                </Button>
                <Button variant="ghost" size="sm" onClick={exportReviewedRun}>
                  Export reviewed run
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={triggerFeedbackImport}
                >
                  Import feedback
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void refreshReplacementLearningStatus();
                  }}
                  disabled={replacementLearningSummary.loading}
                >
                  Refresh replacement status
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={trainReplacementModel}
                  disabled={replacementLearningSummary.loading}
                >
                  Train replacement model
                </Button>
                <input
                  ref={feedbackImportInputRef}
                  id="autodraft-compare-feedback-import-file"
                  name="autodraftCompareFeedbackImportFile"
                  type="file"
                  accept="application/json,.json"
                  onChange={onFeedbackImportChange}
                  style={{ display: "none" }}
                />
              </HStack>
            </HStack>
            {feedbackTransferState ? (
              <Text size="xs" color={feedbackTransferState.color}>
                {feedbackTransferState.message}
              </Text>
            ) : null}
            {replacementTrainingState ? (
              <Text size="xs" color={replacementTrainingState.color}>
                {replacementTrainingState.message}
              </Text>
            ) : null}
            {replacementLearningSummary.loading ? (
              <Text size="xs" color="muted">
                Loading replacement learning status...
              </Text>
            ) : replacementLearningSummary.error ? (
              <Text size="xs" color="warning">
                {replacementLearningSummary.error}
              </Text>
            ) : (
              <Stack gap={1}>
                <Text size="xs" color="muted">
                  {describeLearningModel(
                    "replacement",
                    replacementLearningSummary.model,
                  )}
                </Text>
                <Text size="xs" color="muted">
                  {describeLearningEvaluation(
                    "replacement",
                    replacementLearningSummary.evaluation,
                  )}
                </Text>
              </Stack>
            )}
            {reviewQueue.length === 0 ? (
              <Text size="xs" color="muted">
                No red-callout replacement review items for this compare run.
              </Text>
            ) : (
              <div className={styles.compareReviewList}>
                {reviewQueue.map((item) => {
                  const actionId = String(item.action_id || "").trim();
                  const safeActionId = toSafeIdToken(actionId || item.id);
                  const feedbackState =
                    feedbackStateByActionId[actionId] || "idle";
                  const feedbackMessage =
                    feedbackMessageByActionId[actionId] || "";
                  const selectedEntityId =
                    reviewSelectionByActionId[actionId] ||
                    item.selected_entity_id ||
                    "" ||
                    item.candidates[0]?.entity_id ||
                    "";
                  const selectedCandidate =
                    item.candidates.find(
                      (entry) => entry.entity_id === selectedEntityId,
                    ) || item.candidates[0];
                  const isCorrection =
                    Boolean(selectedEntityId) &&
                    selectedEntityId !== String(item.selected_entity_id || "");
                  const noteInputId = `autodraft-compare-review-note-${safeActionId}`;
                  const noteInputName = `autodraftCompareReviewNote-${safeActionId}`;
                  return (
                    <div key={item.id} className={styles.compareReviewCard}>
                      <HStack gap={2} align="center" justify="between" wrap>
                        <Text size="xs" weight="semibold">
                          {actionId}
                        </Text>
                        <Badge
                          variant="soft"
                          color={
                            item.status === "resolved"
                              ? "success"
                              : item.status === "ambiguous"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {item.status}
                        </Badge>
                      </HStack>
                      <Text size="xs" color="muted">
                        {item.message}
                      </Text>
                      <Text size="xs" color="muted">
                        New text: {item.new_text} | confidence{" "}
                        {item.confidence.toFixed(2)}
                      </Text>
                      {item.candidates.length > 0 ? (
                        <fieldset className={styles.compareReviewCandidates}>
                          <legend>Candidate old text targets</legend>
                          {item.candidates.map((candidate, candidateIndex) => {
                            const candidateId = `autodraft-compare-review-candidate-${safeActionId}-${candidateIndex + 1}`;
                            const candidateName = `autodraftCompareReviewCandidate-${safeActionId}`;
                            const isChecked =
                              selectedEntityId === candidate.entity_id;
                            return (
                              <label
                                key={candidateId}
                                htmlFor={candidateId}
                                className={styles.compareReviewCandidate}
                              >
                                <input
                                  id={candidateId}
                                  name={candidateName}
                                  type="radio"
                                  checked={isChecked}
                                  onChange={() =>
                                    setReviewSelection(
                                      actionId,
                                      candidate.entity_id,
                                    )
                                  }
                                />
                                <span>
                                  {candidate.text} ({candidate.entity_id}) |
                                  score {candidate.score.toFixed(2)} | d{" "}
                                  {candidate.distance.toFixed(1)}
                                  {candidate.selection_model
                                    ? ` | model ${candidate.selection_model.label} @ ${candidate.selection_model.confidence.toFixed(2)}${candidate.selection_model.applied ? ` ${candidate.selection_model.adjustment >= 0 ? "+" : ""}${candidate.selection_model.adjustment.toFixed(2)}` : ""}`
                                    : ""}
                                </span>
                              </label>
                            );
                          })}
                        </fieldset>
                      ) : (
                        <Text size="xs" color="warning">
                          No nearby CAD text candidates were found.
                        </Text>
                      )}
                      <label
                        htmlFor={noteInputId}
                        className={styles.compareFieldInline}
                      >
                        <span>Review note</span>
                        <textarea
                          id={noteInputId}
                          name={noteInputName}
                          className={styles.compareReviewNoteInput}
                          rows={2}
                          value={reviewNoteByActionId[actionId] || ""}
                          onChange={(event) =>
                            setReviewNote(actionId, event.target.value)
                          }
                        />
                      </label>
                      <HStack gap={1} align="center" wrap>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => submitReviewFeedback(item, "approve")}
                          disabled={feedbackState === "saving"}
                        >
                          {isCorrection ? "Save correction" : "Approve"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            submitReviewFeedback(item, "unresolved")
                          }
                          disabled={feedbackState === "saving"}
                        >
                          Mark unresolved
                        </Button>
                        {selectedCandidate ? (
                          <Text size="xs" color="muted">
                            Selected old text: {selectedCandidate.text}
                          </Text>
                        ) : null}
                      </HStack>
                      {feedbackState === "saving" ? (
                        <Text size="xs" color="muted">
                          Saving feedback...
                        </Text>
                      ) : null}
                      {feedbackMessage ? (
                        <Text
                          size="xs"
                          color={
                            feedbackState === "error" ? "warning" : "success"
                          }
                        >
                          {feedbackMessage}
                        </Text>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
      {compareError ? (
        <Text size="sm" color="warning">
          {compareError}
        </Text>
      ) : null}
    </div>
  );
}
