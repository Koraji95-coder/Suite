import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type AutoDraftPreparedMarkup,
	autoDraftService,
} from "./autodraftService";

describe("autoDraftService compare endpoints", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("prepareCompare posts multipart form data without forcing JSON content-type", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					ok: true,
					success: true,
					requestId: "req-1",
					source: "python-compare-prepare",
					page: { index: 0, total_pages: 1, width: 612, height: 792 },
					calibration_seed: { available: false, source: "none", notes: [] },
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
					warnings: [],
					pdf_metadata: {
						bluebeam_detected: true,
						detection_reasons: ["producer"],
						document: {
							title: "Sample",
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
							media_box: { width: 612, height: 792 },
							crop_box: null,
							annotation_counts: {
								total: 0,
								supported: 0,
								unsupported: 0,
								by_subtype: {},
							},
							text_extraction: {
								used: true,
								source: "ocr",
								feature_source: "pdf_text_fallback",
								render_available: true,
								ocr_available: true,
								embedded_line_count: 0,
								ocr_line_count: 1,
								candidate_count: 1,
								selected_line_count: 1,
								skipped_without_bounds: 0,
								selected_black_text_count: 0,
							},
						},
					},
					markups: [],
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const file = new File(["%PDF"], "sheet.pdf", { type: "application/pdf" });
		const response = await autoDraftService.prepareCompare(file, 0);

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const init = fetchCall?.[1] as RequestInit | undefined;
		const headers = (init?.headers || {}) as Record<string, string>;
		expect(headers["Content-Type"]).toBeUndefined();
		expect(init?.body).toBeInstanceOf(FormData);
		const formData = init?.body as FormData;
		expect(formData.get("page_index")).toBe("0");
		expect(formData.get("pdf")).toBeInstanceOf(File);
		expect(response.pdf_metadata.bluebeam_detected).toBe(true);
		expect(response.pdf_metadata.document.producer).toBe("Bluebeam Revu x64");
		expect(response.pdf_metadata.page.text_extraction?.source).toBe("ocr");
		expect(response.pdf_metadata.page.text_extraction?.used).toBe(true);
	});

	it("runCompare posts normalized compare payload", async () => {
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					ok: true,
					success: true,
					requestId: "req-2",
					source: "python-compare",
					mode: "cad-aware",
					tolerance_profile: "medium",
					engine: { requested: "auto", used: "python", used_fallback: true },
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
					calibration_mode: "auto",
					auto_calibration: {
						available: true,
						used: true,
						status: "ready",
						confidence: 0.77,
						method: "auto-fallback-manual-two-point",
						quality_notes: ["Manual fallback used."],
						suggested_pdf_points: [
							{ x: 10, y: 10 },
							{ x: 20, y: 10 },
						],
						suggested_cad_points: [
							{ x: 100, y: 100 },
							{ x: 140, y: 100 },
						],
					},
					roi: {
						x: 20,
						y: 30,
						width: 400,
						height: 200,
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
						requestId: "req-2",
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
							pass_count: 1,
							warn_count: 0,
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
								suggestions: [
									"Confirm note location against nearby CAD entities.",
								],
							},
						],
					},
					summary: {
						status: "pass",
						total_markups: 1,
						total_actions: 1,
						pass_count: 1,
						warn_count: 0,
						fail_count: 0,
						cad_context_available: true,
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const markups: AutoDraftPreparedMarkup[] = [
			{
				id: "m1",
				type: "cloud",
				color: "green",
				text: "delete",
				bounds: { x: 10, y: 10, width: 5, height: 5 },
			},
		];

		const compareResult = await autoDraftService.runCompare({
			engine: "auto",
			toleranceProfile: "medium",
			calibrationMode: "auto",
			manualOverride: true,
			markups,
			pdfPoints: [
				{ x: 10, y: 10 },
				{ x: 20, y: 10 },
			],
			cadPoints: [
				{ x: 100, y: 100 },
				{ x: 140, y: 100 },
			],
			roi: {
				x: 20,
				y: 30,
				width: 400,
				height: 200,
			},
			replacementTuning: {
				unresolved_confidence_threshold: 0.4,
				ambiguity_margin_threshold: 0.1,
				search_radius_multiplier: 2.8,
				min_search_radius: 24,
			},
		});

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const init = fetchCall?.[1] as RequestInit | undefined;
		const bodyRaw = String(init?.body || "");
		const payload = JSON.parse(bodyRaw) as Record<string, unknown>;
		expect(payload.engine).toBe("auto");
		expect(payload.tolerance_profile).toBe("medium");
		expect(payload.calibration_mode).toBe("auto");
		expect(payload.manual_override).toBe(true);
		expect(Array.isArray(payload.markups)).toBe(true);
		expect(Array.isArray(payload.pdf_points)).toBe(true);
		expect(Array.isArray(payload.cad_points)).toBe(true);
		expect(payload.roi).toEqual({
			x: 20,
			y: 30,
			width: 400,
			height: 200,
		});
		expect(payload.replacement_tuning).toEqual({
			unresolved_confidence_threshold: 0.4,
			ambiguity_margin_threshold: 0.1,
			search_radius_multiplier: 2.8,
			min_search_radius: 24,
		});
		expect(compareResult.plan.actions[0]?.paired_annotation_ids).toEqual([
			"annot-3",
			"annot-2",
		]);
		expect(compareResult.backcheck.findings[0]?.paired_annotation_ids).toEqual([
			"annot-3",
			"annot-2",
		]);
		expect(compareResult.calibration_mode).toBe("auto");
		expect(compareResult.auto_calibration?.status).toBe("ready");
		expect(compareResult.roi?.width).toBe(400);
		expect(
			compareResult.replacement_tuning?.unresolved_confidence_threshold,
		).toBe(0.36);
		expect(
			setTimeoutSpy.mock.calls.some(([, delay]) => delay === 120_000),
		).toBe(true);
	});

	it("runCompare normalizes markup review queue metadata", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					ok: true,
					success: true,
					requestId: "req-ocr",
					source: "python-compare",
					mode: "cad-aware",
					tolerance_profile: "medium",
					engine: { requested: "python", used: "python", used_fallback: false },
					calibration: {
						pdf_points: [
							{ x: 0, y: 0 },
							{ x: 10, y: 0 },
						],
						cad_points: [
							{ x: 0, y: 0 },
							{ x: 10, y: 0 },
						],
						scale: 1,
						rotation_deg: 0,
						translation: { x: 0, y: 0 },
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
								id: "action-1",
								rule_id: "note-blue-text",
								category: "NOTE",
								action: "Review and acknowledge note intent before execution.",
								confidence: 0.58,
								status: "needs_review",
								markup: {
									id: "ocr-1",
									type: "text",
									color: "blue",
									text: "verify feeder tag",
								},
							},
						],
					},
					backcheck: {
						ok: true,
						success: true,
						requestId: "req-ocr",
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
						warnings: [
							"Markup recognition flagged 1 action(s) for operator review.",
						],
						findings: [
							{
								id: "finding-1",
								action_id: "action-1",
								status: "fail",
								severity: "high",
								category: "note",
								notes: [
									"This action came from low-confidence markup recognition and is not execution-ready.",
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
							id: "markup-review-action-1",
							request_id: "req-ocr",
							action_id: "action-1",
							status: "needs_review",
							confidence: 0.58,
							message:
								"OCR-derived fallback markup requires operator review before geometry execution.",
							markup_id: "ocr-1",
							markup: {
								id: "ocr-1",
								type: "text",
								color: "blue",
								text: "verify feeder tag",
							},
							recognition: {
								model_version: "deterministic-v1",
								confidence: 0.58,
								source: "ocr",
								feature_source: "pdf_text_fallback+cad_context",
								reason_codes: ["prepare_text_fallback", "text_source:ocr"],
								needs_review: true,
								accepted: false,
								override_reason: null,
							},
							predicted_category: "NOTE",
							predicted_action:
								"Review and acknowledge note intent before execution.",
							reason_codes: ["prepare_text_fallback", "text_source:ocr"],
						},
					],
					review_queue: [],
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const compareResult = await autoDraftService.runCompare({
			engine: "python",
			toleranceProfile: "medium",
			calibrationMode: "manual",
			markups: [
				{
					id: "ocr-1",
					type: "text",
					color: "blue",
					text: "verify feeder tag",
					bounds: { x: 10, y: 10, width: 30, height: 10 },
				},
			],
			pdfPoints: [
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
			],
			cadPoints: [
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
			],
		});

		expect(compareResult.markup_review_queue).toHaveLength(1);
		expect(compareResult.markup_review_queue[0]?.action_id).toBe("action-1");
		expect(compareResult.markup_review_queue[0]?.recognition?.featureSource).toBe(
			"pdf_text_fallback+cad_context",
		);
		expect(compareResult.markup_review_queue[0]?.reason_codes).toEqual([
			"prepare_text_fallback",
			"text_source:ocr",
		]);
	});

	it("runCompare normalizes replacement review queue metadata", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					ok: true,
					success: true,
					requestId: "req-3",
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
								action: "Replace old text with new tag.",
								confidence: 0.71,
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
									confidence: 0.71,
									status: "ambiguous",
									candidates: [
										{
											entity_id: "E-TS410",
											text: "TS410",
											score: 0.71,
											distance: 8.0,
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
						requestId: "req-3",
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
								notes: ["Review replacement mapping."],
								suggestions: ["Confirm old text target before execution."],
								replacement: {
									new_text: "TS416",
									old_text: "TS410",
									target_entity_id: "E-TS410",
									confidence: 0.71,
									status: "ambiguous",
									candidates: [
										{
											entity_id: "E-TS410",
											text: "TS410",
											score: 0.71,
											distance: 8.0,
											pointer_hit: true,
											overlap: false,
											pair_hit_count: 0,
										},
									],
								},
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
					review_queue: [
						{
							id: "review-action-red-1",
							request_id: "req-3",
							action_id: "action-red-1",
							status: "ambiguous",
							confidence: 0.71,
							new_text: "TS416",
							selected_old_text: "TS410",
							selected_entity_id: "E-TS410",
							message: "Replacement for TS416 is ambiguous.",
							candidates: [
								{
									entity_id: "E-TS410",
									text: "TS410",
									score: 0.71,
									distance: 8.0,
									pointer_hit: true,
									overlap: false,
									pair_hit_count: 0,
									score_components: {
										base_score: 0.59,
										pre_model_score: 0.62,
										model_adjustment: 0.09,
										final_score: 0.71,
									},
									selection_model: {
										label: "selected",
										confidence: 0.89,
										model_version: "20260317T020000Z",
										feature_source: "replacement_numeric_features",
										source: "local_model",
										reason_codes: ["local_model_prediction"],
										applied: true,
										adjustment: 0.09,
									},
								},
							],
						},
					],
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const compareResult = await autoDraftService.runCompare({
			engine: "python",
			toleranceProfile: "medium",
			markups: [
				{
					id: "m1",
					type: "text",
					color: "red",
					text: "TS416",
					bounds: { x: 10, y: 10, width: 5, height: 5 },
				},
			],
			pdfPoints: [
				{ x: 10, y: 10 },
				{ x: 20, y: 10 },
			],
			cadPoints: [
				{ x: 100, y: 100 },
				{ x: 140, y: 100 },
			],
		});

		expect(compareResult.review_queue).toHaveLength(1);
		expect(compareResult.review_queue[0]?.action_id).toBe("action-red-1");
		expect(
			compareResult.review_queue[0]?.candidates[0]?.score_components
				?.model_adjustment,
		).toBe(0.09);
		expect(
			compareResult.review_queue[0]?.candidates[0]?.selection_model?.modelVersion,
		).toBe("20260317T020000Z");
		expect(
			compareResult.review_queue[0]?.candidates[0]?.selection_model?.applied,
		).toBe(true);
		expect(compareResult.plan.actions[0]?.replacement?.old_text).toBe("TS410");
		expect(
			compareResult.backcheck.findings[0]?.replacement?.target_entity_id,
		).toBe("E-TS410");
	});

	it("submit/export/import compare feedback hits expected endpoints", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		fetchSpy
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						ok: true,
						success: true,
						requestId: "req-feedback-submit",
						source: "autodraft-compare-feedback",
						stored: 1,
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						ok: true,
						success: true,
						requestId: "req-feedback-export",
						source: "autodraft-compare-feedback",
						events: [],
						pairs: [],
						metrics: [],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						ok: true,
						success: true,
						requestId: "req-feedback-import",
						source: "autodraft-compare-feedback",
						mode: "merge",
						imported: { events: 1, pairs: 1, metrics: 2 },
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						ok: true,
						success: true,
						requestId: "req-reviewed-run-export",
						source: "autodraft-reviewed-run",
						bundle: {
							schema: "autodraft_reviewed_run.v1",
							bundle_id: "req-compare-1:2:20260317T020100Z",
							request_id: "req-compare-1",
							captured_utc: "2026-03-17T02:01:00Z",
							source: "autodraft-reviewed-run",
							label: "sample-reviewed-run.pdf",
							summary: {
								prepare_markup_count: 2,
								compare_action_count: 2,
							},
							feedback: {
								items: [
									{
										request_id: "req-compare-1",
										action_id: "action-red-1",
										review_status: "corrected",
									},
								],
								event_count: 1,
								latest_event_utc: "2026-03-17T02:00:00Z",
							},
							learning_examples: {
								autodraft_replacement: [
									{
										label: "selected",
										text: "TS416",
									},
								],
							},
							prepare: { requestId: "req-prepare-1" },
							compare: { requestId: "req-compare-1" },
						},
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						ok: true,
						success: true,
						requestId: "req-train",
						source: "autodraft-learning",
						results: [
							{
								ok: true,
								domain: "autodraft_markup",
								version: "20260316T000000Z",
							},
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			);

		await autoDraftService.submitCompareFeedback({
			requestId: "req-compare-1",
			items: [
				{
					action_id: "action-red-1",
					review_status: "approved",
					new_text: "TS416",
					selected_old_text: "TS410",
					selected_entity_id: "E-TS410",
				},
			],
		});
		await autoDraftService.exportCompareFeedback();
		await autoDraftService.importCompareFeedback({
			mode: "merge",
			events: [],
			pairs: [],
			metrics: [],
		});
		const reviewedRunBundle = await autoDraftService.exportReviewedRunBundle({
			prepare: {
				ok: true,
				success: true,
				requestId: "req-prepare-1",
				source: "python-compare-prepare",
				page: { index: 0, total_pages: 1, width: 612, height: 792 },
				calibration_seed: { available: false, source: "none", notes: [] },
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
				warnings: [],
				pdf_metadata: {
					bluebeam_detected: false,
					detection_reasons: [],
					document: {
						title: null,
						author: null,
						subject: null,
						creator: null,
						producer: null,
						keywords: null,
						created_utc: null,
						modified_utc: null,
						custom: {},
					},
					page: {
						index: 0,
						rotation_deg: 0,
						user_unit: null,
						media_box: { width: 612, height: 792 },
						crop_box: null,
						annotation_counts: {
							total: 0,
							supported: 0,
							unsupported: 0,
							by_subtype: {},
						},
						text_extraction: {
							used: false,
							source: "none",
							feature_source: "pdf_annotations",
							render_available: false,
							ocr_available: false,
							embedded_line_count: 0,
							ocr_line_count: 0,
							candidate_count: 0,
							selected_line_count: 0,
							skipped_without_bounds: 0,
							selected_black_text_count: 0,
						},
					},
				},
				markups: [],
			},
			compare: {
				ok: true,
				success: true,
				requestId: "req-compare-1",
				source: "python-compare",
				mode: "cad-aware",
				tolerance_profile: "medium",
				engine: { requested: "python", used: "python", used_fallback: false },
				calibration: {
					pdf_points: [],
					cad_points: [],
					scale: 1,
					rotation_deg: 0,
					translation: { x: 0, y: 0 },
				},
				plan: {
					source: "python-local-rules",
					summary: {
						total_markups: 0,
						actions_proposed: 0,
						classified: 0,
						needs_review: 0,
					},
					actions: [],
				},
				backcheck: {
					ok: true,
					success: true,
					requestId: "req-compare-1",
					source: "python-local-backcheck",
					mode: "cad-aware",
					cad: {
						available: false,
						degraded: false,
						source: "none",
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
					total_markups: 0,
					total_actions: 0,
					pass_count: 0,
					warn_count: 0,
					fail_count: 0,
					cad_context_available: false,
				},
				markup_review_queue: [],
				review_queue: [],
			},
			label: "sample-reviewed-run.pdf",
		});
		await autoDraftService.trainLearningModels({
			domain: "autodraft_markup",
		});

		expect(fetchSpy.mock.calls[0]?.[0]).toContain(
			"/api/autodraft/compare/feedback",
		);
		expect(fetchSpy.mock.calls[1]?.[0]).toContain(
			"/api/autodraft/compare/feedback/export",
		);
		expect(fetchSpy.mock.calls[2]?.[0]).toContain(
			"/api/autodraft/compare/feedback/import",
		);
		expect(fetchSpy.mock.calls[3]?.[0]).toContain(
			"/api/autodraft/compare/reviewed-run/export",
		);
		expect(fetchSpy.mock.calls[4]?.[0]).toContain(
			"/api/autodraft/learning/train",
		);
		expect(reviewedRunBundle.schema).toBe("autodraft_reviewed_run.v1");
		expect(reviewedRunBundle.bundleId).toBe("req-compare-1:2:20260317T020100Z");
		expect(reviewedRunBundle.feedback.eventCount).toBe(1);
		expect(reviewedRunBundle.learningExamples.autodraft_replacement).toHaveLength(1);
	});

	it("lists replacement learning models and evaluations with domain filters", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		fetchSpy
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						ok: true,
						success: true,
						requestId: "req-models",
						source: "autodraft-learning",
						models: [
							{
								domain: "autodraft_replacement",
								version: "20260317T020000Z",
								artifact_path:
									"models/autodraft_replacement/20260317T020000Z.joblib",
								metrics: { accuracy: 0.82, macro_f1: 0.79 },
								metadata: { example_count: 14 },
								active: true,
								created_utc: "2026-03-17T02:00:00Z",
							},
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						ok: true,
						success: true,
						requestId: "req-evaluations",
						source: "autodraft-learning",
						evaluations: [
							{
								domain: "autodraft_replacement",
								version: "20260317T020000Z",
								metrics: { accuracy: 0.82, macro_f1: 0.79 },
								confusion: {},
								promoted: true,
								sample_count: 14,
								created_utc: "2026-03-17T02:01:00Z",
							},
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			);

		const models = await autoDraftService.listLearningModels(
			"autodraft_replacement",
		);
		const evaluations = await autoDraftService.listLearningEvaluations({
			domain: "autodraft_replacement",
			limit: 1,
		});

		expect(fetchSpy.mock.calls[0]?.[0]).toContain(
			"/api/autodraft/learning/models?domain=autodraft_replacement",
		);
		expect(fetchSpy.mock.calls[1]?.[0]).toContain(
			"/api/autodraft/learning/evaluations?domain=autodraft_replacement&limit=1",
		);
		expect(models[0]?.version).toBe("20260317T020000Z");
		expect(models[0]?.active).toBe(true);
		expect(models[0]?.metadata.example_count).toBe(14);
		expect(evaluations[0]?.version).toBe("20260317T020000Z");
		expect(evaluations[0]?.promoted).toBe(true);
		expect(evaluations[0]?.sampleCount).toBe(14);
	});
});
