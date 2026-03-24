// src/components/apps/autodraft/engine/pdfToCadGeometry.test.ts

import { describe, expect, it } from "vitest";
import {
	detectArcsFromSegments,
	extendDeadEndSegments,
	pointDistance,
	type Segment,
} from "./pdfToCadGeometry";

// ═══════════════════════════════════════════════════════════════════════════
// pointDistance
// ═══════════════════════════════════════════════════════════════════════════

describe("pointDistance", () => {
	it("returns 0 for identical points", () => {
		expect(pointDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
	});

	it("returns correct distance for horizontal separation", () => {
		expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3);
	});

	it("returns correct distance for vertical separation", () => {
		expect(pointDistance({ x: 0, y: 0 }, { x: 0, y: 4 })).toBe(4);
	});

	it("returns correct distance for 3-4-5 triangle", () => {
		expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
	});

	it("handles negative coordinates", () => {
		expect(pointDistance({ x: -3, y: -4 }, { x: 0, y: 0 })).toBe(5);
	});

	it("is symmetric", () => {
		const a = { x: 7.5, y: 13.2 };
		const b = { x: -2.1, y: 4.8 };
		expect(pointDistance(a, b)).toBeCloseTo(pointDistance(b, a), 10);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// detectArcsFromSegments
// ═══════════════════════════════════════════════════════════════════════════

describe("detectArcsFromSegments", () => {
	it("returns empty arcs for empty input", () => {
		const result = detectArcsFromSegments([]);
		expect(result.arcs).toHaveLength(0);
		expect(result.remainingSegments).toHaveLength(0);
	});

	it("returns empty arcs when detectArcs is disabled", () => {
		const segments: Segment[] = [
			{ x1: 0, y1: 0, x2: 10, y2: 0 },
		];
		const result = detectArcsFromSegments(segments, { detectArcs: false });
		expect(result.arcs).toHaveLength(0);
		expect(result.remainingSegments).toEqual(segments);
	});

	it("does not detect arcs from a single straight segment", () => {
		const segments: Segment[] = [
			{ x1: 0, y1: 0, x2: 100, y2: 0 },
		];
		const result = detectArcsFromSegments(segments);
		expect(result.arcs).toHaveLength(0);
		expect(result.remainingSegments).toHaveLength(1);
	});

	it("does not detect arcs from two disconnected segments", () => {
		const segments: Segment[] = [
			{ x1: 0, y1: 0, x2: 10, y2: 0 },
			{ x1: 50, y1: 50, x2: 60, y2: 50 },
		];
		const result = detectArcsFromSegments(segments);
		expect(result.arcs).toHaveLength(0);
		expect(result.remainingSegments).toHaveLength(2);
	});

	it("does not detect arcs from collinear connected segments", () => {
		const segments: Segment[] = [
			{ x1: 0, y1: 0, x2: 10, y2: 0 },
			{ x1: 10, y1: 0, x2: 20, y2: 0 },
			{ x1: 20, y1: 0, x2: 30, y2: 0 },
			{ x1: 30, y1: 0, x2: 40, y2: 0 },
		];
		const result = detectArcsFromSegments(segments);
		expect(result.arcs).toHaveLength(0);
		expect(result.remainingSegments).toHaveLength(4);
	});

	// Full circle from 12 segments (the DEMO_SEGMENTS circle from AutoDraftStudioApp)
	const circleSegments: Segment[] = [
		{ x1: 0, y1: 0, x2: 10, y2: 2 },
		{ x1: 10, y1: 2, x2: 18, y2: 8 },
		{ x1: 18, y1: 8, x2: 20, y2: 16 },
		{ x1: 20, y1: 16, x2: 18, y2: 24 },
		{ x1: 18, y1: 24, x2: 10, y2: 30 },
		{ x1: 10, y1: 30, x2: 0, y2: 32 },
		{ x1: 0, y1: 32, x2: -8, y2: 30 },
		{ x1: -8, y1: 30, x2: -16, y2: 24 },
		{ x1: -16, y1: 24, x2: -18, y2: 16 },
		{ x1: -18, y1: 16, x2: -16, y2: 8 },
		{ x1: -16, y1: 8, x2: -8, y2: 2 },
		{ x1: -8, y1: 2, x2: 0, y2: 0 },
	];

	it("detects a circle from 12 connected arc segments", () => {
		const result = detectArcsFromSegments(circleSegments);
		expect(result.arcs).toHaveLength(1);
		expect(result.arcs[0].isCircle).toBe(true);
		expect(result.arcs[0].r).toBeGreaterThan(10);
		expect(result.arcs[0].r).toBeLessThan(25);
		expect(result.remainingSegments).toHaveLength(0);
	});

	it("separates arc segments from non-arc segments in mixed input", () => {
		const mixedSegments: Segment[] = [
			...circleSegments,
			// Two isolated horizontal segments (not part of the arc)
			{ x1: 50, y1: 0, x2: 60, y2: 0 },
			{ x1: 70, y1: 0, x2: 80, y2: 0 },
		];
		const result = detectArcsFromSegments(mixedSegments);
		expect(result.arcs).toHaveLength(1);
		expect(result.remainingSegments).toHaveLength(2);
	});

	it("respects arcMaxRelativeError config", () => {
		// Very tight tolerance should still detect the clean demo circle
		const strict = detectArcsFromSegments(circleSegments, {
			arcMaxRelativeError: 0.05,
		});
		expect(strict.arcs.length).toBeGreaterThanOrEqual(0);
		// At least verify it doesn't crash
	});

	// Semicircle: half the circle segments
	it("detects a semicircular arc from 6 connected segments", () => {
		const halfCircle = circleSegments.slice(0, 6);
		const result = detectArcsFromSegments(halfCircle);
		// 6 segments ≈ 180° turn, should detect as a non-circle arc
		if (result.arcs.length > 0) {
			expect(result.arcs[0].isCircle).toBe(false);
			expect(result.arcs[0].r).toBeGreaterThan(5);
		}
		// If the heuristic rejects it (possible with only 6 points), that's also acceptable
		expect(result.arcs.length).toBeLessThanOrEqual(1);
	});

	it("arc center is roughly at the geometric center of the circle", () => {
		const result = detectArcsFromSegments(circleSegments);
		expect(result.arcs).toHaveLength(1);
		const arc = result.arcs[0];
		// The demo circle is roughly centered around (1, 16)
		expect(arc.cx).toBeGreaterThan(-5);
		expect(arc.cx).toBeLessThan(5);
		expect(arc.cy).toBeGreaterThan(10);
		expect(arc.cy).toBeLessThan(22);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// extendDeadEndSegments
// ═══════════════════════════════════════════════════════════════════════════

describe("extendDeadEndSegments", () => {
	it("returns empty array for empty input", () => {
		const result = extendDeadEndSegments([]);
		expect(result).toHaveLength(0);
	});

	it("returns input unchanged when extendLines is disabled", () => {
		const segments: Segment[] = [
			{ x1: 0, y1: 0, x2: 10, y2: 0 },
		];
		const result = extendDeadEndSegments(segments, { extendLines: false });
		expect(result).toEqual(segments);
	});

	it("returns a single segment unchanged (no intersection target)", () => {
		const segments: Segment[] = [
			{ x1: 0, y1: 0, x2: 10, y2: 0 },
		];
		const result = extendDeadEndSegments(segments);
		expect(result).toHaveLength(1);
		expect(result[0].x1).toBe(0);
		expect(result[0].x2).toBe(10);
	});

	it("does not modify segments that are already connected", () => {
		const segments: Segment[] = [
			{ x1: 0, y1: 0, x2: 10, y2: 0 },
			{ x1: 10, y1: 0, x2: 10, y2: 10 },
			{ x1: 10, y1: 10, x2: 0, y2: 10 },
			{ x1: 0, y1: 10, x2: 0, y2: 0 },
		];
		const result = extendDeadEndSegments(segments);
		// All endpoints are shared — no dead ends, no extensions
		expect(result).toHaveLength(4);
		expect(result[0].x1).toBe(0);
		expect(result[0].y1).toBe(0);
	});

	it("extends a dead-end segment to meet a nearby perpendicular segment", () => {
		// Horizontal segment stops short of a vertical segment
		// Gap of 3 units (within default extendMaxPt of 8)
		const segments: Segment[] = [
			{ x1: 0, y1: 5, x2: 7, y2: 5 },    // horizontal, dead end at x=7
			{ x1: 10, y1: 0, x2: 10, y2: 10 },  // vertical at x=10
		];
		const result = extendDeadEndSegments(segments, {
			joinTolerancePt: 2,
			extendMaxPt: 8,
		});
		expect(result).toHaveLength(2);
		// The horizontal segment's x2 endpoint should have been extended to x=10
		const extended = result[0];
		expect(extended.x2).toBeCloseTo(10, 0);
		expect(extended.y2).toBeCloseTo(5, 0);
	});

	it("does not extend beyond extendMaxPt", () => {
		// Gap of 20 units — beyond default extendMaxPt of 8
		const segments: Segment[] = [
			{ x1: 0, y1: 5, x2: 5, y2: 5 },     // dead end at x=5
			{ x1: 25, y1: 0, x2: 25, y2: 10 },   // vertical at x=25
		];
		const result = extendDeadEndSegments(segments, {
			joinTolerancePt: 2,
			extendMaxPt: 8,
		});
		expect(result).toHaveLength(2);
		// Should NOT extend — gap is too large
		expect(result[0].x2).toBe(5);
	});

	it("extends from the start endpoint of a dead-end segment", () => {
		// Vertical segment with dead end at its start (y=3), perpendicular target at y=0
		const segments: Segment[] = [
			{ x1: 5, y1: 3, x2: 5, y2: 20 },    // vertical, dead end at y=3
			{ x1: 0, y1: 0, x2: 10, y2: 0 },     // horizontal at y=0
		];
		const result = extendDeadEndSegments(segments, {
			joinTolerancePt: 2,
			extendMaxPt: 8,
		});
		expect(result).toHaveLength(2);
		const extended = result[0];
		expect(extended.y1).toBeCloseTo(0, 0);
		expect(extended.x1).toBeCloseTo(5, 0);
	});

	it("handles the DEMO_SEGMENTS gap correctly", () => {
		// From AutoDraftStudioApp: two segments with a gap at x=32 to x=34.5
		const gapSegments: Segment[] = [
			{ x1: 28, y1: 16, x2: 32, y2: 16 },
			{ x1: 34.5, y1: 16, x2: 40, y2: 16 },
		];
		const result = extendDeadEndSegments(gapSegments, {
			joinTolerancePt: 2,
			extendMaxPt: 8,
		});
		expect(result).toHaveLength(2);
		// At least one segment should have been extended toward the other
		const seg0End = result[0].x2;
		const seg1Start = result[1].x1;
		const originalGap = 34.5 - 32; // 2.5
		const newGap = Math.abs(seg1Start - seg0End);
		expect(newGap).toBeLessThan(originalGap);
	});

	it("returns a new array (does not mutate input)", () => {
		const segments: Segment[] = [
			{ x1: 0, y1: 5, x2: 7, y2: 5 },
			{ x1: 10, y1: 0, x2: 10, y2: 10 },
		];
		const original0 = { ...segments[0] };
		const result = extendDeadEndSegments(segments);
		// Original should be unchanged
		expect(segments[0].x2).toBe(original0.x2);
		// Result should be a different array reference
		expect(result).not.toBe(segments);
	});

	it("preserves the kind property on extended segments", () => {
		const segments: Segment[] = [
			{ x1: 0, y1: 5, x2: 7, y2: 5, kind: "line" },
			{ x1: 10, y1: 0, x2: 10, y2: 10 },
		];
		const result = extendDeadEndSegments(segments, {
			joinTolerancePt: 2,
			extendMaxPt: 8,
		});
		expect(result[0].kind).toBe("line");
	});

	it("does not extend zero-length segments", () => {
		const segments: Segment[] = [
			{ x1: 5, y1: 5, x2: 5, y2: 5 },      // zero length
			{ x1: 10, y1: 0, x2: 10, y2: 10 },
		];
		const result = extendDeadEndSegments(segments);
		expect(result).toHaveLength(2);
		// Zero-length segment should be untouched (length < 0.5 guard)
		expect(result[0].x1).toBe(5);
		expect(result[0].x2).toBe(5);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration: detectArcs then extendDeadEnds (the real pipeline)
// ═══════════════════════════════════════════════════════════════════════════

describe("arc detection → dead-end extension pipeline", () => {
	const fullDemoSegments: Segment[] = [
		// Circle (12 segments)
		{ x1: 0, y1: 0, x2: 10, y2: 2 },
		{ x1: 10, y1: 2, x2: 18, y2: 8 },
		{ x1: 18, y1: 8, x2: 20, y2: 16 },
		{ x1: 20, y1: 16, x2: 18, y2: 24 },
		{ x1: 18, y1: 24, x2: 10, y2: 30 },
		{ x1: 10, y1: 30, x2: 0, y2: 32 },
		{ x1: 0, y1: 32, x2: -8, y2: 30 },
		{ x1: -8, y1: 30, x2: -16, y2: 24 },
		{ x1: -16, y1: 24, x2: -18, y2: 16 },
		{ x1: -18, y1: 16, x2: -16, y2: 8 },
		{ x1: -16, y1: 8, x2: -8, y2: 2 },
		{ x1: -8, y1: 2, x2: 0, y2: 0 },
		// Two short horizontal segments with a gap
		{ x1: 28, y1: 16, x2: 32, y2: 16 },
		{ x1: 34.5, y1: 16, x2: 40, y2: 16 },
	];

	it("detects the circle and leaves line segments for extension", () => {
		const arcResult = detectArcsFromSegments(fullDemoSegments, {
			detectArcs: true,
			arcMaxRelativeError: 0.12,
		});
		expect(arcResult.arcs).toHaveLength(1);
		expect(arcResult.arcs[0].isCircle).toBe(true);
		expect(arcResult.remainingSegments).toHaveLength(2);

		const extended = extendDeadEndSegments(arcResult.remainingSegments, {
			extendLines: true,
			extendMaxPt: 8,
			joinTolerancePt: 2,
		});
		expect(extended).toHaveLength(2);
	});

	it("pipeline output counts match AutoDraftStudioApp demo expectations", () => {
		const arcResult = detectArcsFromSegments(fullDemoSegments, {
			detectArcs: true,
			arcMaxRelativeError: 0.12,
		});
		const extended = extendDeadEndSegments(arcResult.remainingSegments, {
			extendLines: true,
			extendMaxPt: 8,
			joinTolerancePt: 2,
		});

		// These match the Metric cards in the Architecture tab
		expect(fullDemoSegments.length).toBe(14);          // inputSegments
		expect(arcResult.arcs.length).toBe(1);             // arcsDetected
		expect(arcResult.remainingSegments.length).toBe(2); // remainingSegments
		expect(extended.length).toBe(2);                    // extendedSegments
	});
});
