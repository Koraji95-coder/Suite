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
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import { logger } from "@/lib/logger";
import styles from "./AutoDraftStudioApp.module.css";
import {
	type AutoDraftCalibrationMode,
	type AutoDraftCompareEngine,
	type AutoDraftComparePoint,
	type AutoDraftComparePrepareResponse,
	type AutoDraftCompareRoi,
	type AutoDraftCompareResponse,
	type AutoDraftReplacementTuning,
	type AutoDraftToleranceProfile,
	autoDraftService,
} from "./autodraftService";

if (!GlobalWorkerOptions.workerSrc) {
	GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

type CadPointInput = {
	x: string;
	y: string;
};

type ReplacementTuningInput = {
	unresolvedConfidenceThreshold: string;
	ambiguityMarginThreshold: string;
	searchRadiusMultiplier: string;
};

const DEFAULT_CAD_POINTS: CadPointInput[] = [
	{ x: "", y: "" },
	{ x: "", y: "" },
];
const DEFAULT_REPLACEMENT_TUNING: ReplacementTuningInput = {
	unresolvedConfidenceThreshold: "0.36",
	ambiguityMarginThreshold: "0.08",
	searchRadiusMultiplier: "2.5",
};
const DEFAULT_CALIBRATION_MODE: AutoDraftCalibrationMode = "auto";

type PointProjection = {
	leftPercent: number;
	topPercent: number;
};

type PreviewStatus = {
	color: "muted" | "warning" | "success";
	message: string;
};

type PanOffset = {
	x: number;
	y: number;
};

type PreviewDragState = {
	startX: number;
	startY: number;
	startPan: PanOffset;
	hasMoved: boolean;
	maxDistance: number;
};

const PDF_PREVIEW_BASE_SCALE = 1.2;
const PDF_PREVIEW_MIN_ZOOM = 0.4;
const PDF_PREVIEW_MAX_ZOOM = 4.0;
const PDF_PREVIEW_ZOOM_STEP = 1.15;
const PREVIEW_PAN_THRESHOLD_PX = 6;

function isRecordValue(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatMarkupColorDiagnostic(
	markup: Record<string, unknown>,
): string | null {
	const color =
		typeof markup.color === "string" && markup.color.trim().length > 0
			? markup.color.trim()
			: "";
	const meta = isRecordValue(markup.meta) ? markup.meta : null;
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

function clampPercent(value: number): number {
	if (value < 0) return 0;
	if (value > 100) return 100;
	return value;
}

function clampZoom(value: number): number {
	if (!Number.isFinite(value)) return 1;
	if (value < PDF_PREVIEW_MIN_ZOOM) return PDF_PREVIEW_MIN_ZOOM;
	if (value > PDF_PREVIEW_MAX_ZOOM) return PDF_PREVIEW_MAX_ZOOM;
	return value;
}

function buildRoiFromPointPair(
	start: AutoDraftComparePoint,
	end: AutoDraftComparePoint,
): AutoDraftCompareRoi {
	const x = Math.min(start.x, end.x);
	const y = Math.min(start.y, end.y);
	const width = Math.max(0.0001, Math.abs(end.x - start.x));
	const height = Math.max(0.0001, Math.abs(end.y - start.y));
	return { x, y, width, height };
}

function toSafeIdToken(value: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "item";
}

function mapCanvasClientPointToPdf(args: {
	clientX: number;
	clientY: number;
	rect: Pick<DOMRect, "left" | "top" | "width" | "height">;
	canvasWidth: number;
	canvasHeight: number;
	viewport: Pick<PageViewport, "convertToPdfPoint">;
}): AutoDraftComparePoint | null {
	const { clientX, clientY, rect, canvasWidth, canvasHeight, viewport } = args;
	if (
		canvasWidth <= 0 ||
		canvasHeight <= 0 ||
		rect.width <= 0 ||
		rect.height <= 0
	) {
		return null;
	}
	const renderX = (clientX - rect.left) * (canvasWidth / rect.width);
	const renderY = (clientY - rect.top) * (canvasHeight / rect.height);
	const [pdfX, pdfY] = viewport.convertToPdfPoint(renderX, renderY);
	if (!Number.isFinite(pdfX) || !Number.isFinite(pdfY)) {
		return null;
	}
	return { x: pdfX, y: pdfY };
}

function mapPdfPointToCanvasPercent(args: {
	pdfPoint: AutoDraftComparePoint;
	canvasWidth: number;
	canvasHeight: number;
	viewport: Pick<PageViewport, "convertToViewportPoint">;
}): PointProjection | null {
	const { pdfPoint, canvasWidth, canvasHeight, viewport } = args;
	if (canvasWidth <= 0 || canvasHeight <= 0) {
		return null;
	}
	const [viewportX, viewportY] = viewport.convertToViewportPoint(
		pdfPoint.x,
		pdfPoint.y,
	);
	if (!Number.isFinite(viewportX) || !Number.isFinite(viewportY)) {
		return null;
	}
	return {
		leftPercent: clampPercent((viewportX / canvasWidth) * 100),
		topPercent: clampPercent((viewportY / canvasHeight) * 100),
	};
}

export function AutoDraftComparePanel() {
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
	const [reviewSelectionByActionId, setReviewSelectionByActionId] = useState<
		Record<string, string>
	>({});
	const [reviewNoteByActionId, setReviewNoteByActionId] = useState<
		Record<string, string>
	>({});
	const [pdfPoints, setPdfPoints] = useState<AutoDraftComparePoint[]>([]);
	const [cadPoints, setCadPoints] =
		useState<CadPointInput[]>(DEFAULT_CAD_POINTS);
	const [calibrationMode, setCalibrationMode] =
		useState<AutoDraftCalibrationMode>(DEFAULT_CALIBRATION_MODE);
	const [manualOverride, setManualOverride] = useState<boolean>(false);
	const [roiBounds, setRoiBounds] = useState<AutoDraftCompareRoi | null>(null);
	const [roiDrawMode, setRoiDrawMode] = useState<boolean>(false);
	const [roiDrawStart, setRoiDrawStart] = useState<AutoDraftComparePoint | null>(
		null,
	);
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
	const nextPointLabel =
		roiDrawMode
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
	const compareActionById = useMemo(() => {
		const lookup = new Map<
			string,
			AutoDraftCompareResponse["plan"]["actions"][number]
		>();
		if (!compareResult) return lookup;
		for (const action of compareResult.plan.actions) {
			lookup.set(action.id, action);
		}
		return lookup;
	}, [compareResult]);
	const reviewQueue = useMemo(
		() => (compareResult ? compareResult.review_queue : []),
		[compareResult],
	);
	const shadowReviewByActionId = useMemo(() => {
		const lookup = new Map<
			string,
			NonNullable<AutoDraftCompareResponse["shadow_advisor"]>["reviews"][number]
		>();
		if (!compareResult?.shadow_advisor?.reviews) return lookup;
		for (const review of compareResult.shadow_advisor.reviews) {
			lookup.set(review.action_id, review);
		}
		return lookup;
	}, [compareResult]);
	const prepareColorSourcesSummary = useMemo(() => {
		if (!prepareResult) return null;
		const counters = new Map<string, number>();
		let knownColors = 0;
		for (const markup of prepareResult.markups) {
			if (markup.color !== "unknown") {
				knownColors += 1;
			}
			const meta = isRecordValue(markup.meta) ? markup.meta : null;
			const source =
				meta &&
				typeof meta.color_source === "string" &&
				meta.color_source.trim().length > 0
					? meta.color_source.trim().toUpperCase()
					: "UNKNOWN";
			counters.set(source, (counters.get(source) || 0) + 1);
		}
		const sourceSummary = Array.from(counters.entries())
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([source, count]) => `${source}:${count}`)
			.join(" | ");
		return `Color extraction: known ${knownColors}/${prepareResult.markups.length} | sources ${sourceSummary || "none"}`;
	}, [prepareResult]);

	const prepareStatus = useMemo<PreviewStatus | null>(() => {
		if (loadingPdf) {
			return {
				color: "muted",
				message: "Loading PDF preview...",
			};
		}
		if (loadingPrepare) {
			return {
				color: "muted",
				message: "Preparing markups...",
			};
		}
		if (prepareError) {
			return {
				color: "warning",
				message: prepareError,
			};
		}
		if (!prepareResult) {
			return null;
		}
		if (prepareResult.markups.length === 0) {
			return {
				color: "warning",
				message: `Prepared 0 markups from page ${prepareResult.page.index + 1}. No supported annotations were detected.`,
			};
		}
		return {
			color: "success",
			message: `Prepared ${prepareResult.markups.length} markups from page ${prepareResult.page.index + 1}.`,
		};
	}, [loadingPdf, loadingPrepare, prepareError, prepareResult]);

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
			const currentZoom = zoom;
			if (
				!viewportElement ||
				!Number.isFinite(currentZoom) ||
				currentZoom <= 0
			) {
				setZoom(clampZoom(nextZoomRaw));
				return;
			}

			const nextZoom = clampZoom(nextZoomRaw);
			if (Math.abs(nextZoom - currentZoom) < 0.0001) return;

			if (!anchor) {
				const center = {
					x: viewportElement.clientWidth / 2,
					y: viewportElement.clientHeight / 2,
				};
				const worldX = (center.x - pan.x) / currentZoom;
				const worldY = (center.y - pan.y) / currentZoom;
				setPan({
					x: center.x - worldX * nextZoom,
					y: center.y - worldY * nextZoom,
				});
				setZoom(nextZoom);
				return;
			}

			const worldX = (anchor.x - pan.x) / currentZoom;
			const worldY = (anchor.y - pan.y) / currentZoom;
			setPan({
				x: anchor.x - worldX * nextZoom,
				y: anchor.y - worldY * nextZoom,
			});
			setZoom(nextZoom);
		},
		[pan.x, pan.y, zoom],
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

	const parseReplacementTuning =
		useCallback((): AutoDraftReplacementTuning | null => {
			const unresolvedThreshold = Number(
				replacementTuning.unresolvedConfidenceThreshold,
			);
			const ambiguityMargin = Number(
				replacementTuning.ambiguityMarginThreshold,
			);
			const radiusMultiplier = Number(replacementTuning.searchRadiusMultiplier);
			if (
				!Number.isFinite(unresolvedThreshold) ||
				!Number.isFinite(ambiguityMargin) ||
				!Number.isFinite(radiusMultiplier)
			) {
				return null;
			}
			if (
				unresolvedThreshold < 0 ||
				unresolvedThreshold > 1 ||
				ambiguityMargin < 0 ||
				ambiguityMargin > 1 ||
				radiusMultiplier < 0.5 ||
				radiusMultiplier > 8
			) {
				return null;
			}
			return {
				unresolved_confidence_threshold: unresolvedThreshold,
				ambiguity_margin_threshold: ambiguityMargin,
				search_radius_multiplier: radiusMultiplier,
				min_search_radius: 24,
			};
		}, [replacementTuning]);

	const parseCadPoints = useCallback((): AutoDraftComparePoint[] | null => {
		const parsed = cadPoints.map((entry) => ({
			x: Number(entry.x),
			y: Number(entry.y),
		}));
		if (
			parsed.some(
				(entry) => !Number.isFinite(entry.x) || !Number.isFinite(entry.y),
			)
		) {
			return null;
		}
		return parsed;
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

	const clearRoi = useCallback(() => {
		setRoiBounds(null);
		setRoiDrawMode(false);
		setRoiDrawStart(null);
	}, []);

	const focusRoiAroundPreparedMarkups = useCallback(() => {
		if (!prepareResult || prepareResult.markups.length === 0) {
			return;
		}
		let left: number | null = null;
		let bottom: number | null = null;
		let right: number | null = null;
		let top: number | null = null;
		for (const markup of prepareResult.markups) {
			const bounds = markup.bounds;
			if (!bounds) continue;
			const x = Number(bounds.x);
			const y = Number(bounds.y);
			const width = Number(bounds.width);
			const height = Number(bounds.height);
			if (
				!Number.isFinite(x) ||
				!Number.isFinite(y) ||
				!Number.isFinite(width) ||
				!Number.isFinite(height) ||
				width <= 0 ||
				height <= 0
			) {
				continue;
			}
			const nextRight = x + width;
			const nextTop = y + height;
			left = left === null ? x : Math.min(left, x);
			bottom = bottom === null ? y : Math.min(bottom, y);
			right = right === null ? nextRight : Math.max(right, nextRight);
			top = top === null ? nextTop : Math.max(top, nextTop);
		}
		if (left === null || bottom === null || right === null || top === null) {
			return;
		}
		setRoiDrawMode(false);
		setRoiDrawStart(null);
		setRoiBounds({
			x: left,
			y: bottom,
			width: Math.max(0.0001, right - left),
			height: Math.max(0.0001, top - bottom),
		});
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
		if (!pdfFile) {
			setPrepareError("Choose a PDF file first.");
			return;
		}
		if (pageCount > 0 && (pageIndex < 0 || pageIndex >= pageCount)) {
			setPrepareError(`Page number must be between 1 and ${pageCount}.`);
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
		setFeedbackTransferState(null);
		try {
			const nextResult = await autoDraftService.prepareCompare(
				pdfFile,
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
		if (!prepareResult) {
			setCompareError("Run prepare first.");
			return;
		}
		const hasCompletePdfPoints = pdfPoints.length === 2;
		const shouldUseManualPoints = calibrationMode === "manual";
		let parsedCadPoints: AutoDraftComparePoint[] | null = null;

		if (shouldUseManualPoints) {
			if (!hasCompletePdfPoints) {
				setCompareError("Manual calibration needs exactly two PDF points.");
				return;
			}
			parsedCadPoints = parseCadPoints();
			if (!parsedCadPoints) {
				setCompareError(
					"Enter valid CAD X/Y values for both calibration points.",
				);
				return;
			}
		} else if (manualOverride && hasCompletePdfPoints) {
			parsedCadPoints = parseCadPoints();
			if (!parsedCadPoints) {
				setCompareError(
					"Manual fallback is enabled, but the CAD X/Y values for both points are invalid.",
				);
				return;
			}
		}
		const parsedReplacementTuning = parseReplacementTuning();
		if (!parsedReplacementTuning) {
			setCompareError(
				"Replacement tuning values are invalid. Check thresholds and multiplier ranges.",
			);
			return;
		}

		setLoadingCompare(true);
		setCompareError(null);
		setFeedbackStateByActionId({});
		setFeedbackMessageByActionId({});
		setReviewSelectionByActionId({});
		setReviewNoteByActionId({});
		setFeedbackTransferState(null);
		try {
			const result = await autoDraftService.runCompare({
				engine,
				toleranceProfile: tolerance,
				calibrationMode,
				agentReviewMode: "pre",
				manualOverride,
				markups: prepareResult.markups,
				pdfPoints: parsedCadPoints ? pdfPoints : undefined,
				cadPoints: parsedCadPoints ?? undefined,
				roi: roiBounds || undefined,
				calibrationSeed: prepareResult.calibration_seed,
				replacementTuning: parsedReplacementTuning,
			});
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
		cadPoints,
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
							agent_suggestion: item.agent_hint,
							accepted_agent_suggestion:
								mode === "approve" && Boolean(item.agent_hint),
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

	const exportFeedbackMemory = useCallback(async () => {
		try {
			setFeedbackTransferState({
				color: "muted",
				message: "Exporting compare feedback memory...",
			});
			const payload = await autoDraftService.exportCompareFeedback();
			const stamp = new Date().toISOString().replace(/[:.]/g, "-");
			const blob = new Blob([JSON.stringify(payload, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `autodraft-compare-feedback-${stamp}.json`;
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
				const events = Array.isArray(parsed.events) ? parsed.events : [];
				const pairs = Array.isArray(parsed.pairs) ? parsed.pairs : [];
				const metrics = Array.isArray(parsed.metrics) ? parsed.metrics : [];
				const result = await autoDraftService.importCompareFeedback({
					mode: "merge",
					events,
					pairs,
					metrics,
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
		const payload = JSON.stringify(compareResult, null, 2);
		const blob = new Blob([payload], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `autodraft-compare-${stamp}.json`;
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
	}, [compareResult]);

	const exportPrepare = useCallback(() => {
		if (!prepareResult) return;
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		const payload = JSON.stringify(prepareResult, null, 2);
		const blob = new Blob([payload], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `autodraft-prepare-${stamp}.json`;
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
	}, [prepareResult]);

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

			<div className={styles.compareControls}>
				<label
					htmlFor="autodraft-compare-pdf-file"
					className={styles.compareField}
				>
					<span>Bluebeam PDF</span>
					<input
						id="autodraft-compare-pdf-file"
						name="autodraftComparePdfFile"
						type="file"
						accept="application/pdf,.pdf"
						onChange={(event) => {
							const file = event.target.files?.[0] ?? null;
							setPdfFile(file);
						}}
					/>
				</label>
				<label
					htmlFor="autodraft-compare-page-number"
					className={styles.compareField}
				>
					<span>Page number</span>
					<input
						id="autodraft-compare-page-number"
						name="autodraftComparePageNumber"
						type="number"
						min={1}
						max={pageCount > 0 ? pageCount : undefined}
						value={pageNumber}
						onChange={(event) => {
							const nextPageNumber = Math.max(
								1,
								Math.round(Number(event.target.value) || 1),
							);
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
						}}
					/>
				</label>
				<label
					htmlFor="autodraft-compare-engine"
					className={styles.compareField}
				>
					<span>Engine</span>
					<select
						id="autodraft-compare-engine"
						name="autodraftCompareEngine"
						value={engine}
						onChange={(event) =>
							setEngine(event.target.value as AutoDraftCompareEngine)
						}
					>
						<option value="auto">auto</option>
						<option value="python">python</option>
						<option value="dotnet">dotnet</option>
					</select>
				</label>
				<label
					htmlFor="autodraft-compare-tolerance"
					className={styles.compareField}
				>
					<span>Tolerance</span>
					<select
						id="autodraft-compare-tolerance"
						name="autodraftCompareTolerance"
						value={tolerance}
						onChange={(event) =>
							setTolerance(event.target.value as AutoDraftToleranceProfile)
						}
					>
						<option value="strict">strict</option>
						<option value="medium">medium</option>
						<option value="loose">loose</option>
					</select>
				</label>
				<label
					htmlFor="autodraft-compare-calibration-mode"
					className={styles.compareField}
				>
					<span>Calibration mode</span>
					<select
						id="autodraft-compare-calibration-mode"
						name="autodraftCompareCalibrationMode"
						value={calibrationMode}
						onChange={onCalibrationModeChange}
					>
						<option value="auto">auto</option>
						<option value="manual">manual</option>
					</select>
				</label>
				<label
					htmlFor="autodraft-compare-manual-override"
					className={`${styles.compareField} ${styles.compareCheckboxField}`}
				>
					<input
						id="autodraft-compare-manual-override"
						name="autodraftCompareManualOverride"
						type="checkbox"
						checked={manualOverride}
						disabled={calibrationMode === "manual"}
						onChange={(event) => setManualOverride(event.target.checked)}
					/>
					<span>Use manual points only if auto calibration fails</span>
				</label>
				<Button
					variant="primary"
					size="sm"
					onClick={runPrepare}
					disabled={prepareDisabled}
					loading={loadingPrepare || loadingPdf}
				>
					Prepare markups
				</Button>
			</div>
			<div className={styles.compareTuningPanel}>
				<Text size="xs" color="muted">
					Replacement tuning (red callouts)
				</Text>
				<div className={styles.compareTuningGrid}>
					<label
						htmlFor="autodraft-compare-tuning-unresolved-threshold"
						className={styles.compareField}
					>
						<span>Unresolved threshold</span>
						<input
							id="autodraft-compare-tuning-unresolved-threshold"
							name="autodraftCompareTuningUnresolvedThreshold"
							type="number"
							step="0.01"
							min={0}
							max={1}
							value={replacementTuning.unresolvedConfidenceThreshold}
							onChange={(event) =>
								updateReplacementTuning(
									"unresolvedConfidenceThreshold",
									event.target.value,
								)
							}
						/>
					</label>
					<label
						htmlFor="autodraft-compare-tuning-ambiguity-margin"
						className={styles.compareField}
					>
						<span>Ambiguity margin</span>
						<input
							id="autodraft-compare-tuning-ambiguity-margin"
							name="autodraftCompareTuningAmbiguityMargin"
							type="number"
							step="0.01"
							min={0}
							max={1}
							value={replacementTuning.ambiguityMarginThreshold}
							onChange={(event) =>
								updateReplacementTuning(
									"ambiguityMarginThreshold",
									event.target.value,
								)
							}
						/>
					</label>
					<label
						htmlFor="autodraft-compare-tuning-radius-multiplier"
						className={styles.compareField}
					>
						<span>Search radius multiplier</span>
						<input
							id="autodraft-compare-tuning-radius-multiplier"
							name="autodraftCompareTuningRadiusMultiplier"
							type="number"
							step="0.1"
							min={0.5}
							max={8}
							value={replacementTuning.searchRadiusMultiplier}
							onChange={(event) =>
								updateReplacementTuning(
									"searchRadiusMultiplier",
									event.target.value,
								)
							}
						/>
					</label>
					<div className={styles.compareTuningActions}>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setReplacementTuning(DEFAULT_REPLACEMENT_TUNING)}
						>
							Reset tuning
						</Button>
					</div>
				</div>
				<Text size="xs" color="muted" className={styles.compareTuningHint}>
					Default: unresolved &lt; 0.36, ambiguous margin &lt;= 0.08, radius
					x2.5.
				</Text>
			</div>
			{prepareStatus ? (
				<div className={styles.comparePrepareStatus} aria-live="polite">
					<Text size="xs" color={prepareStatus.color}>
						{prepareStatus.message}
					</Text>
					{prepareResult?.warnings.map((warning, index) => (
						<Text key={`${warning}:${index}`} size="xs" color="warning">
							{warning}
						</Text>
					))}
				</div>
			) : null}

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
					{compareResult.agent_pre_review ? (
						<Stack gap={1}>
							<Text
								size="xs"
								color={
									compareResult.agent_pre_review.available
										? "muted"
										: "warning"
								}
							>
								Agent pre-review `{compareResult.agent_pre_review.profile}`:{" "}
								{compareResult.agent_pre_review.available
									? compareResult.agent_pre_review.used
										? `${compareResult.agent_pre_review.hints_count} hint${compareResult.agent_pre_review.hints_count === 1 ? "" : "s"} applied.`
										: "No hints applied."
									: compareResult.agent_pre_review.error || "Unavailable."}
							</Text>
							<Text size="xs" color="muted">
								Attempted {compareResult.agent_pre_review.attempted ? "yes" : "no"}
								{typeof compareResult.agent_pre_review.latency_ms === "number"
									? ` | latency ${compareResult.agent_pre_review.latency_ms.toFixed(1)} ms`
									: ""}
							</Text>
							{compareResult.agent_pre_review.preflight ? (
								<Text size="xs" color="muted">
									Preflight:{" "}
									{compareResult.agent_pre_review.preflight.available
										? "model available"
										: compareResult.agent_pre_review.preflight.reason ||
											"not available"}
									{compareResult.agent_pre_review.preflight.expected_model
										? ` | expected ${compareResult.agent_pre_review.preflight.expected_model}`
										: ""}
								</Text>
							) : null}
						</Stack>
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
								Replacement review queue ({reviewQueue.length})
							</Text>
							<HStack gap={1} align="center" wrap>
								<Button
									variant="ghost"
									size="sm"
									onClick={exportFeedbackMemory}
								>
									Export feedback
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={triggerFeedbackImport}
								>
									Import feedback
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
						{compareResult.shadow_advisor ? (
							<Stack gap={1}>
								<Text
									size="xs"
									color={
										compareResult.shadow_advisor.available ? "muted" : "warning"
									}
								>
									Shadow advisor `{compareResult.shadow_advisor.profile}`:{" "}
									{compareResult.shadow_advisor.available
										? `${compareResult.shadow_advisor.reviews.length} suggestion${compareResult.shadow_advisor.reviews.length === 1 ? "" : "s"} available.`
										: compareResult.shadow_advisor.error || "Unavailable."}
								</Text>
								{compareResult.shadow_advisor.auth ? (
									<Text size="xs" color="muted">
										Advisor auth: mode {compareResult.shadow_advisor.auth.mode} | token{" "}
										{compareResult.shadow_advisor.auth.token_source} | refresh{" "}
										{compareResult.shadow_advisor.auth.refresh_attempted
											? "attempted"
											: "not attempted"}
									</Text>
								) : null}
							</Stack>
						) : null}
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
									const shadowSuggestion =
										item.shadow || shadowReviewByActionId.get(actionId) || null;
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
											{item.agent_hint ? (
												<Text size="xs" color="muted">
													Agent hint
													{item.agent_hint.intent_hint
														? ` | intent ${item.agent_hint.intent_hint}`
														: ""}
													{item.agent_hint.rationale
														? ` | ${item.agent_hint.rationale}`
														: ""}
												</Text>
											) : null}
											{shadowSuggestion ? (
												<Text size="xs" color="muted">
													Shadow suggestion:{" "}
													{shadowSuggestion.suggested_old_text || "no old text"}{" "}
													(
													{shadowSuggestion.suggested_entity_id ||
														"no entity id"}
													)
													{typeof shadowSuggestion.confidence === "number"
														? ` @ ${shadowSuggestion.confidence.toFixed(2)}`
														: ""}
													{shadowSuggestion.rationale
														? ` - ${shadowSuggestion.rationale}`
														: ""}
												</Text>
											) : null}
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
																	{candidate.score_components &&
																	typeof candidate.score_components.agent_boost ===
																		"number"
																		? ` | boost +${candidate.score_components.agent_boost.toFixed(2)}`
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
