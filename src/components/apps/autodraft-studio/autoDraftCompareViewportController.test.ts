import { describe, expect, it } from "vitest";
import {
	buildPanForZoomAroundPoint,
	buildRoiFromPointPair,
	clampZoom,
	mapCanvasClientPointToPdf,
	mapPdfPointToCanvasPercent,
} from "./autoDraftCompareViewportController";

describe("autoDraftCompareViewportController", () => {
	it("clamps zoom to supported bounds", () => {
		expect(clampZoom(0.01)).toBe(0.4);
		expect(clampZoom(99)).toBe(4);
		expect(clampZoom(1.5)).toBe(1.5);
	});

	it("builds ROI from two points", () => {
		expect(buildRoiFromPointPair({ x: 40, y: 10 }, { x: 10, y: 30 })).toEqual({
			x: 10,
			y: 10,
			width: 30,
			height: 20,
		});
	});

	it("maps canvas and pdf points", () => {
		const pdfPoint = mapCanvasClientPointToPdf({
			clientX: 110,
			clientY: 70,
			rect: { left: 10, top: 20, width: 200, height: 100 } as DOMRect,
			canvasWidth: 400,
			canvasHeight: 200,
			viewport: {
				convertToPdfPoint(x: number, y: number) {
					return [x / 2, y / 2];
				},
			},
		});
		expect(pdfPoint).toEqual({ x: 100, y: 50 });

		const projection = mapPdfPointToCanvasPercent({
			pdfPoint: { x: 100, y: 50 },
			canvasWidth: 400,
			canvasHeight: 200,
			viewport: {
				convertToViewportPoint(x: number, y: number) {
					return [x * 2, y * 2];
				},
			},
		});
		expect(projection).toEqual({ leftPercent: 50, topPercent: 50 });
	});

	it("computes pan update while zooming around anchor", () => {
		const result = buildPanForZoomAroundPoint({
			currentZoom: 1,
			nextZoomRaw: 2,
			pan: { x: 0, y: 0 },
			anchor: { x: 100, y: 50 },
			viewportSize: { width: 300, height: 200 },
		});
		expect(result).toEqual({
			nextZoom: 2,
			nextPan: { x: -100, y: -50 },
		});
	});
});
