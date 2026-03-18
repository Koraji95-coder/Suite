import type { PageViewport } from "pdfjs-dist";
import type { AutoDraftComparePoint, AutoDraftCompareRoi } from "./autodraftService";

export type PointProjection = {
	leftPercent: number;
	topPercent: number;
};

export type PanOffset = {
	x: number;
	y: number;
};

export const PDF_PREVIEW_MIN_ZOOM = 0.4;
export const PDF_PREVIEW_MAX_ZOOM = 4.0;

export function clampPercent(value: number): number {
	if (value < 0) return 0;
	if (value > 100) return 100;
	return value;
}

export function clampZoom(value: number): number {
	if (!Number.isFinite(value)) return 1;
	if (value < PDF_PREVIEW_MIN_ZOOM) return PDF_PREVIEW_MIN_ZOOM;
	if (value > PDF_PREVIEW_MAX_ZOOM) return PDF_PREVIEW_MAX_ZOOM;
	return value;
}

export function buildRoiFromPointPair(
	start: AutoDraftComparePoint,
	end: AutoDraftComparePoint,
): AutoDraftCompareRoi {
	const x = Math.min(start.x, end.x);
	const y = Math.min(start.y, end.y);
	const width = Math.max(0.0001, Math.abs(end.x - start.x));
	const height = Math.max(0.0001, Math.abs(end.y - start.y));
	return { x, y, width, height };
}

export function mapCanvasClientPointToPdf(args: {
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

export function mapPdfPointToCanvasPercent(args: {
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

export function buildPanForZoomAroundPoint(args: {
	currentZoom: number;
	nextZoomRaw: number;
	pan: PanOffset;
	anchor: { x: number; y: number } | null;
	viewportSize: { width: number; height: number };
}): { nextZoom: number; nextPan: PanOffset } | null {
	const { currentZoom, nextZoomRaw, pan, anchor, viewportSize } = args;
	if (!Number.isFinite(currentZoom) || currentZoom <= 0) {
		return null;
	}

	const nextZoom = clampZoom(nextZoomRaw);
	if (Math.abs(nextZoom - currentZoom) < 0.0001) {
		return null;
	}

	const effectiveAnchor = anchor || {
		x: viewportSize.width / 2,
		y: viewportSize.height / 2,
	};
	const worldX = (effectiveAnchor.x - pan.x) / currentZoom;
	const worldY = (effectiveAnchor.y - pan.y) / currentZoom;
	return {
		nextZoom,
		nextPan: {
			x: effectiveAnchor.x - worldX * nextZoom,
			y: effectiveAnchor.y - worldY * nextZoom,
		},
	};
}
