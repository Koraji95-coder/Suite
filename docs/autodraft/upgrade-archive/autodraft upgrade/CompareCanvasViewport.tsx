// src/components/apps/autodraft/AutoDraftComparePanel/CompareCanvasViewport.tsx
//
// Extracted from AutoDraftComparePanel.tsx — PDF canvas with pan, zoom,
// calibration point placement, and ROI rectangle drawing.
//
// Usage in orchestrator:
//   <CompareCanvasViewport
//     pdfDoc={pdfDoc}
//     pageIndex={pageIndex}
//     pdfPoints={pdfPoints}
//     roiBounds={roiBounds}
//     roiDrawMode={roiDrawMode}
//     roiDrawStart={roiDrawStart}
//     onPointCapture={handlePreviewPointCapture}
//     onRoiComplete={(roi) => { setRoiBounds(roi); setRoiDrawMode(false); setRoiDrawStart(null); }}
//     onRoiDrawStartCapture={setRoiDrawStart}
//   />

import {
	type CSSProperties,
	type MouseEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { PageViewport, PDFDocumentProxy } from "pdfjs-dist";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import type { AutoDraftComparePoint, AutoDraftCompareRoi } from "../autodraftService";
import {
	buildRoiFromPointPair,
	clampZoom,
	mapCanvasClientPointToPdf,
	mapPdfPointToCanvasPercent,
	PDF_PREVIEW_ZOOM_STEP,
	type PointProjection,
} from "./compareHelpers";
import styles from "./CompareCanvasViewport.module.css";

// ── Constants ────────────────────────────────────────────

const PDF_PREVIEW_BASE_SCALE = 1.2;
const PREVIEW_PAN_THRESHOLD_PX = 6;

// ── Types ────────────────────────────────────────────────

type PanOffset = { x: number; y: number };

type PreviewDragState = {
	startX: number;
	startY: number;
	startPan: PanOffset;
	hasMoved: boolean;
	maxDistance: number;
};

// ── Props ────────────────────────────────────────────────

interface CompareCanvasViewportProps {
	pdfDoc: PDFDocumentProxy | null;
	pageIndex: number;
	pdfPoints: AutoDraftComparePoint[];
	roiBounds: AutoDraftCompareRoi | null;
	roiDrawMode: boolean;
	roiDrawStart: AutoDraftComparePoint | null;
	onPointCapture: (point: AutoDraftComparePoint) => void;
	onRoiComplete: (roi: AutoDraftCompareRoi) => void;
	onRoiDrawStartCapture: (point: AutoDraftComparePoint) => void;
}

// ── Component ────────────────────────────────────────────

export function CompareCanvasViewport({
	pdfDoc,
	pageIndex,
	pdfPoints,
	roiBounds,
	roiDrawMode,
	roiDrawStart,
	onPointCapture,
	onRoiComplete,
	onRoiDrawStartCapture,
}: CompareCanvasViewportProps) {
	const [zoom, setZoom] = useState<number>(1);
	const [pan, setPan] = useState<PanOffset>({ x: 0, y: 0 });
	const [isPanning, setIsPanning] = useState(false);
	const [canvasNaturalWidth, setCanvasNaturalWidth] = useState(0);
	const [canvasNaturalHeight, setCanvasNaturalHeight] = useState(0);
	const [renderError, setRenderError] = useState<string | null>(null);

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const viewportElRef = useRef<HTMLDivElement | null>(null);
	const viewportRef = useRef<PageViewport | null>(null);
	const dragRef = useRef<PreviewDragState | null>(null);
	const suppressClickRef = useRef(false);

	// ── PDF page rendering ───────────────────────────────

	useEffect(() => {
		let cancelled = false;
		const canvas = canvasRef.current;
		if (!canvas || !pdfDoc || pageIndex < 0 || pageIndex >= pdfDoc.numPages) {
			setCanvasNaturalWidth(0);
			setCanvasNaturalHeight(0);
			viewportRef.current = null;
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
						"CompareCanvasViewport",
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

	// ── Fit to viewport on first render ──────────────────

	const fitToViewport = useCallback(() => {
		const el = viewportElRef.current;
		if (!el || canvasNaturalWidth <= 0 || canvasNaturalHeight <= 0) {
			setZoom(1);
			setPan({ x: 0, y: 0 });
			return;
		}
		const rect = el.getBoundingClientRect();
		const scaleByWidth = rect.width / canvasNaturalWidth;
		const scaleByHeight = rect.height / canvasNaturalHeight;
		const nextZoom = clampZoom(Math.min(scaleByWidth, scaleByHeight, 1));
		const stageWidth = canvasNaturalWidth * nextZoom;
		const stageHeight = canvasNaturalHeight * nextZoom;
		setZoom(nextZoom);
		setPan({
			x: (rect.width - stageWidth) / 2,
			y: (rect.height - stageHeight) / 2,
		});
	}, [canvasNaturalWidth, canvasNaturalHeight]);

	useEffect(() => {
		if (canvasNaturalWidth <= 0 || canvasNaturalHeight <= 0) return;
		fitToViewport();
	}, [canvasNaturalWidth, canvasNaturalHeight, fitToViewport]);

	// ── Zoom around anchor ───────────────────────────────

	const setZoomAround = useCallback(
		(nextZoomRaw: number, anchor: { x: number; y: number } | null) => {
			const el = viewportElRef.current;
			const currentZoom = zoom;
			if (!el || !Number.isFinite(currentZoom) || currentZoom <= 0) {
				setZoom(clampZoom(nextZoomRaw));
				return;
			}
			const nextZoom = clampZoom(nextZoomRaw);
			if (Math.abs(nextZoom - currentZoom) < 0.0001) return;

			const ref = anchor ?? {
				x: el.clientWidth / 2,
				y: el.clientHeight / 2,
			};
			const worldX = (ref.x - pan.x) / currentZoom;
			const worldY = (ref.y - pan.y) / currentZoom;
			setPan({
				x: ref.x - worldX * nextZoom,
				y: ref.y - worldY * nextZoom,
			});
			setZoom(nextZoom);
		},
		[pan.x, pan.y, zoom],
	);

	// ── Wheel zoom (native, non-passive) ─────────────────

	useEffect(() => {
		const el = viewportElRef.current;
		if (!el) return;
		const handler = (event: WheelEvent) => {
			if (event.cancelable) event.preventDefault();
			const rect = el.getBoundingClientRect();
			const anchor = {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			};
			const multiplier =
				event.deltaY < 0 ? PDF_PREVIEW_ZOOM_STEP : 1 / PDF_PREVIEW_ZOOM_STEP;
			setZoomAround(zoom * multiplier, anchor);
		};
		el.addEventListener("wheel", handler, { passive: false });
		return () => el.removeEventListener("wheel", handler);
	}, [setZoomAround, zoom]);

	// ── Pointer handlers (pan + point capture) ───────────

	const onPointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (event.button !== 0) return;
			dragRef.current = {
				startX: event.clientX,
				startY: event.clientY,
				startPan: { ...pan },
				hasMoved: false,
				maxDistance: 0,
			};
		},
		[pan],
	);

	const onPointerMove = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			if (!drag) return;
			if ((event.buttons & 1) !== 1) return;
			const dx = event.clientX - drag.startX;
			const dy = event.clientY - drag.startY;
			const distance = Math.hypot(dx, dy);
			drag.maxDistance = Math.max(drag.maxDistance, distance);
			if (distance >= PREVIEW_PAN_THRESHOLD_PX) {
				drag.hasMoved = true;
				setIsPanning(true);
				setPan({
					x: drag.startPan.x + dx,
					y: drag.startPan.y + dy,
				});
			}
		},
		[],
	);

	const capturePointFromEvent = useCallback(
		(clientX: number, clientY: number) => {
			const viewport = viewportRef.current;
			const canvas = canvasRef.current;
			if (!viewport || !canvas) return;
			const rect = canvas.getBoundingClientRect();
			if (
				clientX < rect.left ||
				clientX > rect.right ||
				clientY < rect.top ||
				clientY > rect.bottom
			) {
				return;
			}
			const point = mapCanvasClientPointToPdf({
				clientX,
				clientY,
				rect,
				canvasWidth: canvas.width,
				canvasHeight: canvas.height,
				viewport,
			});
			if (!point) return;

			if (roiDrawMode) {
				if (!roiDrawStart) {
					onRoiDrawStartCapture(point);
				} else {
					onRoiComplete(buildRoiFromPointPair(roiDrawStart, point));
				}
			} else {
				onPointCapture(point);
			}
			suppressClickRef.current = true;
		},
		[roiDrawMode, roiDrawStart, onPointCapture, onRoiComplete, onRoiDrawStartCapture],
	);

	const onPointerUp = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			if (!drag) return;
			if (drag.hasMoved) {
				suppressClickRef.current = true;
			} else {
				capturePointFromEvent(event.clientX, event.clientY);
			}
			dragRef.current = null;
			setIsPanning(false);
		},
		[capturePointFromEvent],
	);

	const onCanvasClick = useCallback(
		(event: MouseEvent<HTMLCanvasElement>) => {
			if (suppressClickRef.current) {
				suppressClickRef.current = false;
				return;
			}
			// Fallback click handler — pointer-up usually handles it
		},
		[],
	);

	// ── Projected overlays ───────────────────────────────

	const projectedPdfPoints = useMemo(() => {
		const canvas = canvasRef.current;
		const viewport = viewportRef.current;
		if (!canvas || !viewport) return [];
		return pdfPoints
			.map((point, index) => {
				const projection = mapPdfPointToCanvasPercent({
					pdfPoint: point,
					canvasWidth: canvas.width,
					canvasHeight: canvas.height,
					viewport,
				});
				if (!projection) return null;
				return { index, projection };
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

	// ── Stage transform ──────────────────────────────────

	const stageStyle = useMemo<CSSProperties | undefined>(
		() =>
			canvasNaturalWidth > 0 && canvasNaturalHeight > 0
				? {
						width: `${canvasNaturalWidth}px`,
						height: `${canvasNaturalHeight}px`,
						transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
						transformOrigin: "top left",
					}
				: undefined,
		[canvasNaturalWidth, canvasNaturalHeight, pan.x, pan.y, zoom],
	);

	const latestPointIndex = pdfPoints.length > 0 ? pdfPoints.length - 1 : null;

	// ── Render ───────────────────────────────────────────

	if (renderError) {
		return (
			<div className={styles.viewport}>
				<div className={styles.errorMessage}>{renderError}</div>
			</div>
		);
	}

	return (
		<div
			ref={viewportElRef}
			className={cn(
				styles.viewport,
				isPanning && styles.viewportDragging,
			)}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
		>
			<div className={styles.stage} style={stageStyle}>
				<canvas
					ref={canvasRef}
					className={styles.canvas}
					onClick={onCanvasClick}
				/>

				{/* Marker overlay layer */}
				<div className={styles.markerLayer}>
					{/* ROI overlay */}
					{projectedRoi && (
						<div
							className={styles.roiOverlay}
							style={{
								left: `${projectedRoi.left}%`,
								top: `${projectedRoi.top}%`,
								width: `${projectedRoi.width}%`,
								height: `${projectedRoi.height}%`,
							}}
						/>
					)}

					{/* Calibration point markers */}
					{projectedPdfPoints.map((entry) => (
						<div
							key={entry.index}
							className={cn(
								styles.pointMarker,
								entry.index === latestPointIndex && styles.pointMarkerLatest,
							)}
							style={{
								left: `${entry.projection.leftPercent}%`,
								top: `${entry.projection.topPercent}%`,
							}}
						>
							{entry.index + 1}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
