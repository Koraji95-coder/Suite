import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoDraftComparePanel } from "./AutoDraftComparePanel";
import { autoDraftService } from "./autodraftService";

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
	default: "/mock-pdf-worker.js",
}));

const getDocumentMock = vi.fn();

vi.mock("pdfjs-dist", () => ({
	GlobalWorkerOptions: { workerSrc: "" },
	getDocument: (...args: unknown[]) => getDocumentMock(...args),
}));

vi.mock("./autodraftService", async () => {
	const actual =
		await vi.importActual<typeof import("./autodraftService")>(
			"./autodraftService",
		);
	return {
		...actual,
		autoDraftService: {
			prepareCompare: vi.fn(),
			runCompare: vi.fn(),
			submitCompareFeedback: vi.fn(),
			exportCompareFeedback: vi.fn(),
			importCompareFeedback: vi.fn(),
			trainLearningModels: vi.fn(),
		},
	};
});

type MockPdfPage = {
	getViewport: ReturnType<typeof vi.fn>;
	render: ReturnType<typeof vi.fn>;
};

type MockPdfDoc = {
	numPages: number;
	getPage: ReturnType<typeof vi.fn>;
	page: MockPdfPage;
};

function createMockPdfDoc(numPages = 2): MockPdfDoc {
	const page: MockPdfPage = {
		getViewport: vi.fn(({ scale }: { scale: number }) => ({
			width: 1000 * scale,
			height: 2000 * scale,
			convertToPdfPoint: (x: number, y: number) => [x, y],
			convertToViewportPoint: (x: number, y: number) => [x, y],
		})),
		render: vi.fn(() => ({ promise: Promise.resolve() })),
	};

	return {
		numPages,
		getPage: vi.fn(async () => page),
		page,
	};
}

function createPrepareResponse(markupCount: number) {
	return {
		ok: true,
		success: true,
		requestId: "req-prepare",
		source: "python-compare-prepare",
		page: {
			index: 0,
			total_pages: 2,
			width: 1000,
			height: 2000,
		},
		calibration_seed: {
			available: false,
			source: "none",
			scale_hint: null,
			notes: [],
		},
		auto_calibration: {
			available: true,
			used: false,
			status: "needs_manual",
			confidence: 0,
			method: "none",
			quality_notes: [],
			suggested_pdf_points: [],
			suggested_cad_points: [],
		},
		warnings: ["Unsupported annotation subtype: Polygon"],
		pdf_metadata: {
			bluebeam_detected: true,
			detection_reasons: ["producer"],
			document: {
				title: "Test Sheet",
				author: null,
				subject: null,
				creator: "Bluebeam Revu",
				producer: "Bluebeam Revu x64",
				keywords: null,
				created_utc: null,
				modified_utc: null,
				custom: {},
			},
			page: {
				index: 0,
				rotation_deg: 0,
				user_unit: null,
				media_box: { width: 1000, height: 2000 },
				crop_box: null,
				annotation_counts: {
					total: markupCount,
					supported: markupCount,
					unsupported: 0,
					by_subtype: { "/FreeText": markupCount },
				},
			},
		},
		markups: Array.from({ length: markupCount }, (_, index) => ({
			id: `m-${index + 1}`,
			type: "cloud",
			color: "red",
			text: "",
			bounds: {
				x: 10 + index,
				y: 20 + index,
				width: 5,
				height: 5,
			},
		})),
	};
}

function createDeferred<T>() {
	let resolve: (value: T) => void = () => undefined;
	let reject: (error?: unknown) => void = () => undefined;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("AutoDraftComparePanel", () => {
	let mockPdfDoc: MockPdfDoc;

	beforeEach(() => {
		vi.clearAllMocks();
		getDocumentMock.mockReset();
		mockPdfDoc = createMockPdfDoc(2);
		getDocumentMock.mockReturnValue({
			promise: Promise.resolve(mockPdfDoc),
		});
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
			() => ({}) as never,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("wires ids and names on compare form fields", () => {
		render(<AutoDraftComparePanel />);

		const fileInput = screen.getByLabelText("Bluebeam PDF") as HTMLInputElement;
		expect(fileInput.id).toBe("autodraft-compare-pdf-file");
		expect(fileInput.name).toBe("autodraftComparePdfFile");

		const pageInput = screen.getByLabelText("Page number") as HTMLInputElement;
		expect(pageInput.id).toBe("autodraft-compare-page-number");
		expect(pageInput.name).toBe("autodraftComparePageNumber");

		const engineSelect = screen.getByLabelText("Engine") as HTMLSelectElement;
		expect(engineSelect.id).toBe("autodraft-compare-engine");
		expect(engineSelect.name).toBe("autodraftCompareEngine");

		const toleranceSelect = screen.getByLabelText(
			"Tolerance",
		) as HTMLSelectElement;
		expect(toleranceSelect.id).toBe("autodraft-compare-tolerance");
		expect(toleranceSelect.name).toBe("autodraftCompareTolerance");

		const calibrationModeSelect = screen.getByLabelText(
			"Calibration mode",
		) as HTMLSelectElement;
		expect(calibrationModeSelect.id).toBe("autodraft-compare-calibration-mode");
		expect(calibrationModeSelect.name).toBe("autodraftCompareCalibrationMode");

		const manualOverride = screen.getByLabelText(
			"Use manual points only if auto calibration fails",
		) as HTMLInputElement;
		expect(manualOverride.id).toBe("autodraft-compare-manual-override");
		expect(manualOverride.name).toBe("autodraftCompareManualOverride");

		const unresolvedThreshold = screen.getByLabelText(
			"Unresolved threshold",
		) as HTMLInputElement;
		expect(unresolvedThreshold.id).toBe(
			"autodraft-compare-tuning-unresolved-threshold",
		);
		expect(unresolvedThreshold.name).toBe(
			"autodraftCompareTuningUnresolvedThreshold",
		);

		const ambiguityMargin = screen.getByLabelText(
			"Ambiguity margin",
		) as HTMLInputElement;
		expect(ambiguityMargin.id).toBe(
			"autodraft-compare-tuning-ambiguity-margin",
		);
		expect(ambiguityMargin.name).toBe("autodraftCompareTuningAmbiguityMargin");

		const radiusMultiplier = screen.getByLabelText(
			"Search radius multiplier",
		) as HTMLInputElement;
		expect(radiusMultiplier.id).toBe(
			"autodraft-compare-tuning-radius-multiplier",
		);
		expect(radiusMultiplier.name).toBe(
			"autodraftCompareTuningRadiusMultiplier",
		);

		const cadP1X = screen.getByLabelText("P1 X") as HTMLInputElement;
		expect(cadP1X.id).toBe("autodraft-compare-cad-p1-x");
		expect(cadP1X.name).toBe("autodraftCompareCadP1X");

		const cadP1Y = screen.getByLabelText("P1 Y") as HTMLInputElement;
		expect(cadP1Y.id).toBe("autodraft-compare-cad-p1-y");
		expect(cadP1Y.name).toBe("autodraftCompareCadP1Y");
	});

	it("suppresses page wheel scrolling inside compare preview grid", () => {
		render(<AutoDraftComparePanel />);
		const previewGrid = screen.getByTestId("autodraft-compare-preview-grid");
		const wheelEvent = new WheelEvent("wheel", {
			bubbles: true,
			cancelable: true,
			deltaY: 120,
		});
		previewGrid.dispatchEvent(wheelEvent);
		expect(wheelEvent.defaultPrevented).toBe(true);
	});

	it("shows prepare progress and explicit zero-markup success, using 1-based page input", async () => {
		const prepareMock = vi.mocked(autoDraftService.prepareCompare);
		const deferred =
			createDeferred<
				Awaited<ReturnType<typeof autoDraftService.prepareCompare>>
			>();
		prepareMock.mockReturnValueOnce(deferred.promise);

		render(<AutoDraftComparePanel />);

		const fileInput = screen.getByLabelText("Bluebeam PDF") as HTMLInputElement;
		const pageInput = screen.getByLabelText("Page number") as HTMLInputElement;
		const pdfFile = new File(["%PDF-1.7"], "sheet.pdf", {
			type: "application/pdf",
		});

		fireEvent.change(fileInput, {
			target: { files: [pdfFile] },
		});

		await waitFor(() => {
			expect(getDocumentMock).toHaveBeenCalledTimes(1);
		});

		fireEvent.change(pageInput, {
			target: { value: "2" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Prepare markups" }));
		expect(screen.getByText("Preparing markups...")).toBeTruthy();

		deferred.resolve(createPrepareResponse(0));

		await waitFor(() => {
			expect(
				screen.getByText(/No supported annotations were detected/i),
			).toBeTruthy();
		});
		expect(
			screen.getAllByText(/Unsupported annotation subtype/i).length >= 1,
		).toBe(true);
		expect(prepareMock).toHaveBeenCalledWith(pdfFile, 1);
	});

	it("adds visible point markers when PDF points are clicked", async () => {
		const prepareMock = vi.mocked(autoDraftService.prepareCompare);
		prepareMock.mockResolvedValue(createPrepareResponse(1));

		const { container } = render(<AutoDraftComparePanel />);

		const fileInput = screen.getByLabelText("Bluebeam PDF") as HTMLInputElement;
		const pdfFile = new File(["%PDF-1.7"], "sheet.pdf", {
			type: "application/pdf",
		});

		fireEvent.change(fileInput, {
			target: { files: [pdfFile] },
		});

		await waitFor(() => {
			expect(mockPdfDoc.getPage).toHaveBeenCalled();
		});

		const canvas = container.querySelector("canvas");
		expect(canvas).toBeTruthy();
		if (!canvas) return;

		vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 100,
			bottom: 200,
			width: 100,
			height: 200,
			toJSON: () => ({}),
		} as DOMRect);

		fireEvent.click(canvas, { clientX: 10, clientY: 20 });

		await waitFor(() => {
			expect(screen.getByTestId("autodraft-compare-pdf-marker-0")).toBeTruthy();
		});

		fireEvent.click(canvas, { clientX: 20, clientY: 40 });

		await waitFor(() => {
			expect(screen.getByTestId("autodraft-compare-pdf-marker-1")).toBeTruthy();
		});
	});

	it("captures a calibration point from pointer down/up without drag", async () => {
		render(<AutoDraftComparePanel />);

		const fileInput = screen.getByLabelText("Bluebeam PDF") as HTMLInputElement;
		const pdfFile = new File(["%PDF-1.7"], "sheet.pdf", {
			type: "application/pdf",
		});

		fireEvent.change(fileInput, {
			target: { files: [pdfFile] },
		});

		await waitFor(() => {
			expect(mockPdfDoc.getPage).toHaveBeenCalled();
		});

		const canvas = screen.getByTestId(
			"autodraft-compare-preview-canvas",
		) as HTMLCanvasElement;
		vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 100,
			bottom: 200,
			width: 100,
			height: 200,
			toJSON: () => ({}),
		} as DOMRect);

		const viewport = screen.getByTestId("autodraft-compare-preview-viewport");
		fireEvent.pointerDown(viewport, { button: 0, clientX: 12, clientY: 24 });
		fireEvent.pointerUp(viewport, { button: 0, clientX: 12, clientY: 24 });

		await waitFor(() => {
			expect(screen.getByTestId("autodraft-compare-pdf-marker-0")).toBeTruthy();
		});
	});

	it("sends ROI and auto calibration mode when ROI draw is used", async () => {
		const prepareMock = vi.mocked(autoDraftService.prepareCompare);
		const compareMock = vi.mocked(autoDraftService.runCompare);
		prepareMock.mockResolvedValue(createPrepareResponse(1));
		compareMock.mockResolvedValue({
			ok: true,
			success: true,
			requestId: "req-roi",
			source: "python-compare",
			mode: "cad-aware",
			tolerance_profile: "medium",
			calibration_mode: "auto",
			engine: { requested: "auto", used: "python", used_fallback: false },
			calibration: {
				pdf_points: [],
				cad_points: [],
				scale: 1,
				rotation_deg: 0,
				translation: { x: 0, y: 0 },
			},
			auto_calibration: {
				available: true,
				used: true,
				status: "ready",
				confidence: 0.8,
				method: "auto-seed",
				quality_notes: [],
				suggested_pdf_points: [],
				suggested_cad_points: [],
			},
			roi: { x: 60, y: 120, width: 120, height: 240 },
			plan: {
				source: "python-local-rules",
				summary: {
					total_markups: 1,
					actions_proposed: 1,
					classified: 1,
					needs_review: 0,
				},
				actions: [],
			},
			backcheck: {
				ok: true,
				success: true,
				requestId: "req-roi",
				source: "python-local-backcheck",
				mode: "cad-aware",
				cad: {
					available: true,
					degraded: false,
					source: "live",
					entity_count: 0,
					locked_layer_count: 0,
				},
				summary: {
					total_actions: 0,
					pass_count: 0,
					warn_count: 0,
					fail_count: 0,
				},
				warnings: [],
				findings: [],
			},
			summary: {
				status: "pass",
				total_markups: 1,
				total_actions: 0,
				pass_count: 0,
				warn_count: 0,
				fail_count: 0,
				cad_context_available: true,
			},
			markup_review_queue: [],
			review_queue: [],
			shadow_advisor: {
				enabled: false,
				available: false,
				profile: "draftsmith",
				reviews: [],
			},
		});

		const { container } = render(<AutoDraftComparePanel />);
		const fileInput = screen.getByLabelText("Bluebeam PDF") as HTMLInputElement;
		const pdfFile = new File(["%PDF-1.7"], "sheet.pdf", {
			type: "application/pdf",
		});
		fireEvent.change(fileInput, {
			target: { files: [pdfFile] },
		});

		await waitFor(() => {
			expect(mockPdfDoc.getPage).toHaveBeenCalled();
		});

		const canvas = container.querySelector("canvas");
		expect(canvas).toBeTruthy();
		if (!canvas) return;
		vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 100,
			bottom: 200,
			width: 100,
			height: 200,
			toJSON: () => ({}),
		} as DOMRect);

		fireEvent.click(screen.getByRole("button", { name: "Prepare markups" }));
		await waitFor(() => {
			expect(prepareMock).toHaveBeenCalled();
		});

		fireEvent.click(screen.getByRole("button", { name: "Draw ROI" }));
		fireEvent.click(canvas, { clientX: 5, clientY: 10 });
		fireEvent.click(canvas, { clientX: 15, clientY: 30 });
		fireEvent.click(screen.getByRole("button", { name: "Run compare" }));

		await waitFor(() => {
			expect(compareMock).toHaveBeenCalled();
		});
		const payload = compareMock.mock.calls[0]?.[0];
		expect(payload?.calibrationMode).toBe("auto");
		expect(payload?.agentReviewMode).toBe("pre");
		expect(payload?.roi).toBeTruthy();
		expect(payload?.roi?.width).toBeGreaterThan(0);
		expect(payload?.roi?.height).toBeGreaterThan(0);
	});

	it("shows paired annotation ids and color source diagnostics in compare findings", async () => {
		const prepareMock = vi.mocked(autoDraftService.prepareCompare);
		const compareMock = vi.mocked(autoDraftService.runCompare);
		prepareMock.mockResolvedValue(createPrepareResponse(1));
		compareMock.mockResolvedValue({
			ok: true,
			success: true,
			requestId: "req-compare",
			source: "python-compare",
			mode: "cad-aware",
			tolerance_profile: "medium",
			engine: { requested: "auto", used: "python", used_fallback: false },
			calibration: {
				pdf_points: [
					{ x: 10, y: 10 },
					{ x: 20, y: 10 },
				],
				cad_points: [
					{ x: 100, y: 100 },
					{ x: 140, y: 100 },
				],
				scale: 2,
				rotation_deg: 0,
				translation: { x: 80, y: 80 },
			},
			plan: {
				source: "python-local-rules",
				summary: {
					total_markups: 1,
					actions_proposed: 1,
					classified: 1,
					needs_review: 0,
				},
				actions: [
					{
						id: "action-1",
						rule_id: "semantic-color-blue",
						category: "NOTE",
						action: "Review and acknowledge note intent before execution.",
						confidence: 0.64,
						status: "proposed",
						paired_annotation_ids: ["annot-3", "annot-2"],
						markup: {
							id: "annot-3",
							type: "text",
							color: "blue",
							text: "Add termination cabinet terminal blocks",
							meta: {
								color_source: "DA",
								color_hex: "#0000FF",
							},
						},
					},
				],
			},
			backcheck: {
				ok: true,
				success: true,
				requestId: "req-compare",
				source: "python-local-backcheck",
				mode: "cad-aware",
				cad: {
					available: true,
					degraded: false,
					source: "live",
					entity_count: 0,
					locked_layer_count: 0,
				},
				summary: {
					total_actions: 1,
					pass_count: 0,
					warn_count: 1,
					fail_count: 0,
				},
				warnings: [],
				findings: [
					{
						id: "finding-1",
						action_id: "action-1",
						status: "warn",
						severity: "medium",
						category: "note",
						paired_annotation_ids: ["annot-3", "annot-2"],
						notes: ["NOTE action has no nearby CAD entity context."],
						suggestions: ["Confirm note location against nearby CAD entities."],
					},
				],
			},
			summary: {
				status: "warn",
				total_markups: 1,
				total_actions: 1,
				pass_count: 0,
				warn_count: 1,
				fail_count: 0,
				cad_context_available: true,
			},
			markup_review_queue: [],
			review_queue: [],
			shadow_advisor: {
				enabled: true,
				available: true,
				profile: "draftsmith",
				reviews: [],
			},
		});

		const { container } = render(<AutoDraftComparePanel />);
		const fileInput = screen.getByLabelText("Bluebeam PDF") as HTMLInputElement;
		const pdfFile = new File(["%PDF-1.7"], "sheet.pdf", {
			type: "application/pdf",
		});
		fireEvent.change(fileInput, {
			target: { files: [pdfFile] },
		});

		await waitFor(() => {
			expect(mockPdfDoc.getPage).toHaveBeenCalled();
		});

		const canvas = container.querySelector("canvas");
		expect(canvas).toBeTruthy();
		if (!canvas) return;

		vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 100,
			bottom: 200,
			width: 100,
			height: 200,
			toJSON: () => ({}),
		} as DOMRect);

		fireEvent.click(screen.getByRole("button", { name: "Prepare markups" }));
		await waitFor(() => {
			expect(prepareMock).toHaveBeenCalled();
		});

		fireEvent.click(canvas, { clientX: 10, clientY: 20 });
		fireEvent.click(canvas, { clientX: 20, clientY: 40 });
		fireEvent.change(screen.getByLabelText("P1 X"), {
			target: { value: "100" },
		});
		fireEvent.change(screen.getByLabelText("P1 Y"), {
			target: { value: "100" },
		});
		fireEvent.change(screen.getByLabelText("P2 X"), {
			target: { value: "140" },
		});
		fireEvent.change(screen.getByLabelText("P2 Y"), {
			target: { value: "100" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Run compare" }));

		await waitFor(() => {
			expect(compareMock).toHaveBeenCalled();
		});
		expect(screen.getByText(/Markup color:/i)).toBeTruthy();
		expect(screen.getByText(/#0000FF/i)).toBeTruthy();
		expect(
			screen.getByText(/Paired annotations: annot-3, annot-2/i),
		).toBeTruthy();
	});

	it("renders markup review queue for OCR/text-fallback compare results", async () => {
		const prepareMock = vi.mocked(autoDraftService.prepareCompare);
		const compareMock = vi.mocked(autoDraftService.runCompare);
		prepareMock.mockResolvedValue(createPrepareResponse(1));
		compareMock.mockResolvedValue({
			ok: true,
			success: true,
			requestId: "req-compare-ocr",
			source: "python-compare",
			mode: "cad-aware",
			tolerance_profile: "medium",
			engine: { requested: "python", used: "python", used_fallback: false },
			calibration: {
				pdf_points: [
					{ x: 10, y: 10 },
					{ x: 20, y: 10 },
				],
				cad_points: [
					{ x: 100, y: 100 },
					{ x: 110, y: 100 },
				],
				scale: 1,
				rotation_deg: 0,
				translation: { x: 90, y: 90 },
			},
			plan: {
				source: "python-local-rules",
				summary: {
					total_markups: 1,
					actions_proposed: 1,
					classified: 1,
					needs_review: 1,
				},
				actions: [
					{
						id: "action-ocr-1",
						rule_id: "note-blue-text",
						category: "NOTE",
						action: "Review and acknowledge note intent before execution.",
						confidence: 0.58,
						status: "needs_review",
						markup: {
							id: "ocr-text-1",
							type: "text",
							color: "blue",
							text: "verify feeder tag",
							meta: {
								color_source: "render_sample",
								color_hex: "#0000FF",
								extraction_source: "ocr",
							},
						},
					},
				],
			},
			backcheck: {
				ok: true,
				success: true,
				requestId: "req-compare-ocr",
				source: "python-local-backcheck",
				mode: "cad-aware",
				cad: {
					available: true,
					degraded: false,
					source: "client",
					entity_count: 1,
					locked_layer_count: 0,
				},
				summary: {
					total_actions: 1,
					pass_count: 0,
					warn_count: 0,
					fail_count: 1,
				},
				warnings: ["Markup recognition flagged 1 action(s) for operator review."],
				findings: [
					{
						id: "finding-1",
						action_id: "action-ocr-1",
						status: "fail",
						severity: "high",
						category: "note",
						notes: [
							"OCR-derived fallback markup requires operator review before geometry execution.",
						],
						suggestions: [
							"Confirm markup text, color, and intent before execution.",
						],
					},
				],
			},
			summary: {
				status: "fail",
				total_markups: 1,
				total_actions: 1,
				pass_count: 0,
				warn_count: 0,
				fail_count: 1,
				cad_context_available: true,
			},
			markup_review_queue: [
				{
					id: "markup-review-action-ocr-1",
					request_id: "req-compare-ocr",
					action_id: "action-ocr-1",
					status: "needs_review",
					confidence: 0.58,
					message:
						"OCR-derived fallback markup requires operator review before geometry execution.",
					markup_id: "ocr-text-1",
					markup: {
						id: "ocr-text-1",
						type: "text",
						color: "blue",
						text: "verify feeder tag",
						meta: {
							color_source: "render_sample",
							color_hex: "#0000FF",
							extraction_source: "ocr",
						},
					},
					recognition: {
						modelVersion: "deterministic-v1",
						confidence: 0.58,
						source: "ocr",
						featureSource: "pdf_text_fallback+cad_context",
						reasonCodes: ["prepare_text_fallback", "text_source:ocr"],
						needsReview: true,
						accepted: false,
						overrideReason: null,
					},
					predicted_category: "NOTE",
					predicted_action:
						"Review and acknowledge note intent before execution.",
					reason_codes: ["prepare_text_fallback", "text_source:ocr"],
				},
			],
			review_queue: [],
			shadow_advisor: {
				enabled: true,
				available: true,
				profile: "draftsmith",
				reviews: [],
			},
		});

		const { container } = render(<AutoDraftComparePanel />);
		const fileInput = screen.getByLabelText("Bluebeam PDF") as HTMLInputElement;
		const pdfFile = new File(["%PDF-1.7"], "sheet.pdf", {
			type: "application/pdf",
		});
		fireEvent.change(fileInput, {
			target: { files: [pdfFile] },
		});

		await waitFor(() => {
			expect(mockPdfDoc.getPage).toHaveBeenCalled();
		});

		const canvas = container.querySelector("canvas");
		expect(canvas).toBeTruthy();
		if (!canvas) return;

		vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 100,
			bottom: 200,
			width: 100,
			height: 200,
			toJSON: () => ({}),
		} as DOMRect);

		fireEvent.click(screen.getByRole("button", { name: "Prepare markups" }));
		await waitFor(() => {
			expect(prepareMock).toHaveBeenCalled();
		});

		fireEvent.click(canvas, { clientX: 10, clientY: 20 });
		fireEvent.click(canvas, { clientX: 20, clientY: 40 });
		fireEvent.change(screen.getByLabelText("P1 X"), {
			target: { value: "100" },
		});
		fireEvent.change(screen.getByLabelText("P1 Y"), {
			target: { value: "100" },
		});
		fireEvent.change(screen.getByLabelText("P2 X"), {
			target: { value: "110" },
		});
		fireEvent.change(screen.getByLabelText("P2 Y"), {
			target: { value: "100" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Run compare" }));

		await waitFor(() => {
			expect(compareMock).toHaveBeenCalled();
		});
		expect(screen.getByText(/Markup review queue \(1\)/i)).toBeTruthy();
		expect(
			screen.getAllByText(
				/OCR-derived fallback markup requires operator review before geometry execution\./i,
			).length,
		).toBeGreaterThanOrEqual(1);
		expect(screen.getByText(/Recognition: ocr \| feature pdf_text_fallback\+cad_context/i)).toBeTruthy();
		expect(screen.getByText(/Reasons: prepare_text_fallback, text_source:ocr/i)).toBeTruthy();
	});

	it("submits native markup review corrections and trains the markup model", async () => {
		const prepareMock = vi.mocked(autoDraftService.prepareCompare);
		const compareMock = vi.mocked(autoDraftService.runCompare);
		const feedbackMock = vi.mocked(autoDraftService.submitCompareFeedback);
		const trainMock = vi.mocked(autoDraftService.trainLearningModels);
		prepareMock.mockResolvedValue(createPrepareResponse(1));
		feedbackMock.mockResolvedValue({
			ok: true,
			success: true,
			requestId: "req-feedback-markup",
			source: "autodraft-compare-feedback",
			stored: 1,
			learning: { autodraft_markup: 1 },
		});
		trainMock.mockResolvedValue({
			requestId: "req-train",
			results: [
				{
					ok: true,
					domain: "autodraft_markup",
					version: "20260316T000000Z",
					sample_count: 8,
					metrics: { accuracy: 0.75, macro_f1: 0.72 },
				},
			],
		});
		compareMock.mockResolvedValue({
			ok: true,
			success: true,
			requestId: "req-compare-native",
			source: "python-compare",
			mode: "cad-aware",
			tolerance_profile: "medium",
			engine: { requested: "auto", used: "python", used_fallback: false },
			calibration: {
				pdf_points: [
					{ x: 10, y: 10 },
					{ x: 20, y: 10 },
				],
				cad_points: [
					{ x: 100, y: 100 },
					{ x: 110, y: 100 },
				],
				scale: 1,
				rotation_deg: 0,
				translation: { x: 90, y: 90 },
			},
			plan: {
				source: "python-local-rules",
				summary: {
					total_markups: 1,
					actions_proposed: 1,
					classified: 1,
					needs_review: 1,
				},
				actions: [
					{
						id: "action-native-1",
						rule_id: "semantic-color-blue",
						category: "NOTE",
						action: "Review and acknowledge note intent before execution.",
						confidence: 0.55,
						status: "needs_review",
						markup: {
							id: "annot-native-1",
							type: "text",
							color: "blue",
							text: "verify feeder tag",
							meta: {
								subtype: "/FreeText",
								color_source: "C",
							},
						},
					},
				],
			},
			backcheck: {
				ok: true,
				success: true,
				requestId: "req-compare-native",
				source: "python-local-backcheck",
				mode: "cad-aware",
				cad: {
					available: true,
					degraded: false,
					source: "live",
					entity_count: 1,
					locked_layer_count: 0,
				},
				summary: {
					total_actions: 1,
					pass_count: 0,
					warn_count: 0,
					fail_count: 1,
				},
				warnings: ["Markup recognition flagged 1 action(s) for operator review."],
				findings: [
					{
						id: "finding-1",
						action_id: "action-native-1",
						status: "fail",
						severity: "high",
						category: "note",
						notes: [
							"Low-confidence markup recognition requires operator review before execution.",
						],
						suggestions: [
							"Confirm markup text, color, and intent before execution.",
						],
					},
				],
			},
			summary: {
				status: "fail",
				total_markups: 1,
				total_actions: 1,
				pass_count: 0,
				warn_count: 0,
				fail_count: 1,
				cad_context_available: true,
			},
			markup_review_queue: [
				{
					id: "markup-review-action-native-1",
					request_id: "req-compare-native",
					action_id: "action-native-1",
					status: "needs_review",
					confidence: 0.55,
					message:
						"Low-confidence markup recognition requires operator review before execution.",
					markup_id: "annot-native-1",
					markup: {
						id: "annot-native-1",
						type: "text",
						color: "blue",
						text: "verify feeder tag",
						meta: {
							subtype: "/FreeText",
							color_source: "C",
						},
					},
					recognition: {
						modelVersion: "deterministic-v1",
						confidence: 0.55,
						source: "deterministic",
						featureSource: "pdf_annotations+cad_context",
						reasonCodes: ["color:blue", "type:text"],
						needsReview: true,
						accepted: false,
						overrideReason: null,
					},
					predicted_category: "NOTE",
					predicted_action:
						"Review and acknowledge note intent before execution.",
					reason_codes: ["color:blue", "type:text"],
				},
			],
			review_queue: [],
			shadow_advisor: {
				enabled: true,
				available: true,
				profile: "draftsmith",
				reviews: [],
			},
		});

		const { container } = render(<AutoDraftComparePanel />);
		const fileInput = screen.getByLabelText("Bluebeam PDF") as HTMLInputElement;
		const pdfFile = new File(["%PDF-1.7"], "sheet.pdf", {
			type: "application/pdf",
		});
		fireEvent.change(fileInput, {
			target: { files: [pdfFile] },
		});

		await waitFor(() => {
			expect(mockPdfDoc.getPage).toHaveBeenCalled();
		});
		const canvas = container.querySelector("canvas");
		expect(canvas).toBeTruthy();
		if (!canvas) return;
		vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 100,
			bottom: 200,
			width: 100,
			height: 200,
			toJSON: () => ({}),
		} as DOMRect);

		fireEvent.click(screen.getByRole("button", { name: "Prepare markups" }));
		await waitFor(() => {
			expect(prepareMock).toHaveBeenCalled();
		});

		fireEvent.click(screen.getByRole("button", { name: "Run compare" }));
		await waitFor(() => {
			expect(compareMock).toHaveBeenCalled();
		});

		fireEvent.change(screen.getByLabelText("Category"), {
			target: { value: "ADD" },
		});
		fireEvent.change(screen.getByLabelText("Markup class"), {
			target: { value: "arrow" },
		});
		fireEvent.change(screen.getByLabelText("Color"), {
			target: { value: "red" },
		});
		fireEvent.change(screen.getByLabelText("Corrected text"), {
			target: { value: "install feeder tag" },
		});
		fireEvent.change(screen.getByLabelText("Review note"), {
			target: { value: "Native note actually indicates a feeder add." },
		});
		fireEvent.click(
			screen.getByRole("button", { name: "Save markup correction" }),
		);

		await waitFor(() => {
			expect(feedbackMock).toHaveBeenCalledTimes(1);
		});
		const feedbackPayload = feedbackMock.mock.calls[0]?.[0];
		expect(feedbackPayload?.requestId).toBe("req-compare-native");
		expect(feedbackPayload?.items[0]?.feedback_type).toBe("markup_learning");
		expect(feedbackPayload?.items[0]?.review_status).toBe("corrected");
		expect(feedbackPayload?.items[0]?.predicted_category).toBe("NOTE");
		expect(feedbackPayload?.items[0]?.corrected_intent).toBe("ADD");
		expect(feedbackPayload?.items[0]?.corrected_markup_class).toBe("arrow");
		expect(feedbackPayload?.items[0]?.corrected_color).toBe("red");
		expect(feedbackPayload?.items[0]?.corrected_text).toBe("install feeder tag");

		fireEvent.click(
			screen.getByRole("button", { name: "Train markup model" }),
		);
		await waitFor(() => {
			expect(trainMock).toHaveBeenCalledTimes(1);
		});
		expect(trainMock).toHaveBeenCalledWith({ domain: "autodraft_markup" });
		expect(
			screen.getByText(/Markup model trained \| 20260316T000000Z \| samples 8 \| acc 0.75 \| f1 0.72/i),
		).toBeTruthy();
	});

	it("renders replacement review cards and submits correction feedback", async () => {
		const prepareMock = vi.mocked(autoDraftService.prepareCompare);
		const compareMock = vi.mocked(autoDraftService.runCompare);
		const feedbackMock = vi.mocked(autoDraftService.submitCompareFeedback);
		prepareMock.mockResolvedValue(createPrepareResponse(1));
		feedbackMock.mockResolvedValue({
			ok: true,
			success: true,
			requestId: "req-feedback",
			source: "autodraft-compare-feedback",
			stored: 1,
		});
		compareMock.mockResolvedValue({
			ok: true,
			success: true,
			requestId: "req-compare",
			source: "python-compare",
			mode: "cad-aware",
			tolerance_profile: "medium",
			engine: { requested: "auto", used: "python", used_fallback: false },
			calibration: {
				pdf_points: [
					{ x: 10, y: 10 },
					{ x: 20, y: 10 },
				],
				cad_points: [
					{ x: 100, y: 100 },
					{ x: 140, y: 100 },
				],
				scale: 2,
				rotation_deg: 0,
				translation: { x: 80, y: 80 },
			},
			plan: {
				source: "python-local-rules",
				summary: {
					total_markups: 1,
					actions_proposed: 1,
					classified: 1,
					needs_review: 1,
				},
				actions: [
					{
						id: "action-red-1",
						rule_id: "semantic-color-red",
						category: "ADD",
						action: "Replace old device tag with new tag.",
						confidence: 0.8,
						status: "review",
						markup: {
							id: "annot-8",
							type: "text",
							color: "red",
							text: "TS416",
						},
						replacement: {
							new_text: "TS416",
							old_text: "TS410",
							target_entity_id: "E-TS410",
							confidence: 0.61,
							status: "ambiguous",
							candidates: [
								{
									entity_id: "E-TS410",
									text: "TS410",
									score: 0.61,
									distance: 8.1,
									pointer_hit: true,
									overlap: false,
									pair_hit_count: 0,
								},
								{
									entity_id: "E-TS402",
									text: "TS402",
									score: 0.58,
									distance: 9.2,
									pointer_hit: true,
									overlap: false,
									pair_hit_count: 0,
								},
							],
						},
					},
				],
			},
			backcheck: {
				ok: true,
				success: true,
				requestId: "req-compare",
				source: "python-local-backcheck",
				mode: "cad-aware",
				cad: {
					available: true,
					degraded: false,
					source: "live",
					entity_count: 2,
					locked_layer_count: 0,
				},
				summary: {
					total_actions: 1,
					pass_count: 0,
					warn_count: 1,
					fail_count: 0,
				},
				warnings: [],
				findings: [
					{
						id: "finding-1",
						action_id: "action-red-1",
						status: "warn",
						severity: "medium",
						category: "add",
						notes: ["Replacement review required."],
						suggestions: ["Confirm old text target before execution."],
					},
				],
			},
			summary: {
				status: "warn",
				total_markups: 1,
				total_actions: 1,
				pass_count: 0,
				warn_count: 1,
				fail_count: 0,
				cad_context_available: true,
			},
			markup_review_queue: [],
			review_queue: [
				{
					id: "review-action-red-1",
					request_id: "req-compare",
					action_id: "action-red-1",
					status: "ambiguous",
					confidence: 0.61,
					new_text: "TS416",
					selected_old_text: "TS410",
					selected_entity_id: "E-TS410",
					message: "Replacement mapping is ambiguous.",
					candidates: [
						{
							entity_id: "E-TS410",
							text: "TS410",
							score: 0.61,
							distance: 8.1,
							pointer_hit: true,
							overlap: false,
							pair_hit_count: 0,
						},
						{
							entity_id: "E-TS402",
							text: "TS402",
							score: 0.58,
							distance: 9.2,
							pointer_hit: true,
							overlap: false,
							pair_hit_count: 0,
						},
					],
				},
			],
			shadow_advisor: {
				enabled: true,
				available: true,
				profile: "draftsmith",
				reviews: [
					{
						action_id: "action-red-1",
						suggested_old_text: "TS410",
						suggested_entity_id: "E-TS410",
						confidence: 0.72,
						rationale: "Arrow points directly to label.",
					},
				],
			},
		});

		const { container } = render(<AutoDraftComparePanel />);
		const fileInput = screen.getByLabelText("Bluebeam PDF") as HTMLInputElement;
		const pdfFile = new File(["%PDF-1.7"], "sheet.pdf", {
			type: "application/pdf",
		});
		fireEvent.change(fileInput, {
			target: { files: [pdfFile] },
		});

		await waitFor(() => {
			expect(mockPdfDoc.getPage).toHaveBeenCalled();
		});
		const canvas = container.querySelector("canvas");
		expect(canvas).toBeTruthy();
		if (!canvas) return;
		vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 100,
			bottom: 200,
			width: 100,
			height: 200,
			toJSON: () => ({}),
		} as DOMRect);

		fireEvent.click(screen.getByRole("button", { name: "Prepare markups" }));
		await waitFor(() => {
			expect(prepareMock).toHaveBeenCalled();
		});

		fireEvent.click(canvas, { clientX: 10, clientY: 20 });
		fireEvent.click(canvas, { clientX: 20, clientY: 40 });
		fireEvent.change(screen.getByLabelText("P1 X"), {
			target: { value: "100" },
		});
		fireEvent.change(screen.getByLabelText("P1 Y"), {
			target: { value: "100" },
		});
		fireEvent.change(screen.getByLabelText("P2 X"), {
			target: { value: "140" },
		});
		fireEvent.change(screen.getByLabelText("P2 Y"), {
			target: { value: "100" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Run compare" }));

		await waitFor(() => {
			expect(compareMock).toHaveBeenCalled();
		});
		const compareArgs = compareMock.mock.calls[0]?.[0];
		expect(
			compareArgs?.replacementTuning?.unresolved_confidence_threshold,
		).toBeCloseTo(0.36, 6);
		expect(
			compareArgs?.replacementTuning?.ambiguity_margin_threshold,
		).toBeCloseTo(0.08, 6);
		expect(
			compareArgs?.replacementTuning?.search_radius_multiplier,
		).toBeCloseTo(2.5, 6);
		expect(screen.getByText(/Replacement review queue \(1\)/i)).toBeTruthy();
		expect(screen.getByText(/Shadow suggestion:/i)).toBeTruthy();

		fireEvent.click(
			screen.getByLabelText(/TS402 \(E-TS402\) \| score 0.58 \| d 9.2/i),
		);
		fireEvent.change(screen.getByLabelText("Review note"), {
			target: { value: "Second candidate is correct for this run." },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save correction" }));

		await waitFor(() => {
			expect(feedbackMock).toHaveBeenCalledTimes(1);
		});
		const payload = feedbackMock.mock.calls[0]?.[0];
		expect(payload?.requestId).toBe("req-compare");
		expect(payload?.items[0]?.review_status).toBe("corrected");
		expect(payload?.items[0]?.selected_entity_id).toBe("E-TS402");
	});
});
