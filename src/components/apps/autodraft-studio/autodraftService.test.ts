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
		expect(payload.agent_review_mode).toBe("pre");
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
	});

	it("runCompare normalizes replacement review queue and shadow advisor metadata", async () => {
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
										agent_boost: 0.12,
										final_score: 0.71,
									},
								},
							],
							agent_hint: {
								candidate_boosts: {
									"E-TS410": 0.12,
								},
								intent_hint: "ADD",
								rationale: "Closest replacement candidate.",
							},
							shadow: {
								action_id: "action-red-1",
								suggested_old_text: "TS410",
								suggested_entity_id: "E-TS410",
								confidence: 0.73,
								rationale: "Arrow tail intersects the old label.",
							},
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
								confidence: 0.73,
								rationale: "Arrow tail intersects the old label.",
							},
						],
					},
					agent_pre_review: {
						enabled: true,
						attempted: true,
						available: true,
						used: true,
						profile: "draftsmith",
						latency_ms: 121.2,
						hints_count: 1,
						error: null,
						auth: {
							mode: "service_token",
							token_source: "redis_cache",
							refresh_attempted: false,
						},
						preflight: {
							checked: true,
							available: true,
							expected_model: "joshuaokolo/C3Dv0:latest",
							reason: "model_available",
						},
					},
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
		expect(compareResult.review_queue[0]?.shadow?.suggested_old_text).toBe(
			"TS410",
		);
		expect(compareResult.review_queue[0]?.agent_hint?.candidate_boosts?.["E-TS410"]).toBe(
			0.12,
		);
		expect(
			compareResult.review_queue[0]?.candidates[0]?.score_components
				?.agent_boost,
		).toBe(0.12);
		expect(compareResult.plan.actions[0]?.replacement?.old_text).toBe("TS410");
		expect(
			compareResult.backcheck.findings[0]?.replacement?.target_entity_id,
		).toBe("E-TS410");
		expect(compareResult.shadow_advisor?.reviews[0]?.action_id).toBe(
			"action-red-1",
		);
		expect(compareResult.agent_pre_review?.hints_count).toBe(1);
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

		expect(fetchSpy.mock.calls[0]?.[0]).toContain(
			"/api/autodraft/compare/feedback",
		);
		expect(fetchSpy.mock.calls[1]?.[0]).toContain(
			"/api/autodraft/compare/feedback/export",
		);
		expect(fetchSpy.mock.calls[2]?.[0]).toContain(
			"/api/autodraft/compare/feedback/import",
		);
	});
});
