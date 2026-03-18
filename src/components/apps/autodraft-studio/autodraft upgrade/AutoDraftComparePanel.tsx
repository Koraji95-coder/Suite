// src/components/apps/autodraft/AutoDraftComparePanel/AutoDraftComparePanel.tsx
//
// Slim orchestrator — composes extracted sub-components.
// Replaces the original 3220-line monolith.
//
// Place this file in the AutoDraftComparePanel/ subdirectory and update the
// barrel index.ts to: export { AutoDraftComparePanel } from "./AutoDraftComparePanel";

import {
	GlobalWorkerOptions,
	getDocument,
	type PDFDocumentProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import { logger } from "@/lib/logger";
import styles from "../AutoDraftStudioApp.module.css";
import {
	type AutoDraftCalibrationMode,
	type AutoDraftCompareEngine,
	type AutoDraftComparePoint,
	type AutoDraftComparePrepareResponse,
	type AutoDraftCompareResponse,
	type AutoDraftCompareReviewItem,
	type AutoDraftCompareRoi,
	type AutoDraftMarkupReviewItem,
	type AutoDraftReplacementTuning,
	type AutoDraftToleranceProfile,
	autoDraftService,
} from "../autodraftService";
import {
	buildMarkupReviewDraftDefaults,
	buildRoiFromPointPair,
	formatMarkupColorDiagnostic,
	getMarkupReviewMarkup,
	isRecordValue,
	type MarkupReviewDraft,
	normalizeMarkupReviewCategory,
	normalizeMarkupReviewClass,
	normalizeMarkupReviewColor,
	summarizeMarkupTrainingResult,
	summarizeReplacementTrainingResult,
} from "./compareHelpers";
import { CompareCanvasViewport } from "./CompareCanvasViewport";
import {
	CompareCalibrationPanel,
	DEFAULT_CAD_POINTS,
	DEFAULT_REPLACEMENT_TUNING,
	type CadPointInput,
	type ReplacementTuningInput,
} from "./CompareCalibrationPanel";
import { CompareReviewQueue } from "./CompareReviewQueue";
import { CompareMarkupReview } from "./CompareMarkupReview";
import { CompareFeedbackManager } from "./CompareFeedbackManager";
import {
	CompareLearningPanel,
	EMPTY_LEARNING_SUMMARY,
	type LearningSummaryState,
} from "./CompareLearningPanel";

if (!GlobalWorkerOptions.workerSrc) {
	GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

// ── Component ────────────────────────────────────────────

export function AutoDraftComparePanel() {
	// ─── PDF state ───────────────────────────────────────
	const [pdfFile, setPdfFile] = useState<File | null>(null);
	const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
	const [pageIndex, setPageIndex] = useState(0);
	const [loadingPdf, setLoadingPdf] = useState(false);

	// ─── Prepare / compare state ─────────────────────────
	const [prepareResult, setPrepareResult] =
		useState<AutoDraftComparePrepareResponse | null>(null);
	const [prepareError, setPrepareError] = useState<string | null>(null);
	const [loadingPrepare, setLoadingPrepare] = useState(false);
	const [compareResult, setCompareResult] =
		useState<AutoDraftCompareResponse | null>(null);
	const [compareError, setCompareError] = useState<string | null>(null);
	const [loadingCompare, setLoadingCompare] = useState(false);

	// ─── Config state ────────────────────────────────────
	const [engine, setEngine] = useState<AutoDraftCompareEngine>("auto");
	const [tolerance, setTolerance] =
		useState<AutoDraftToleranceProfile>("medium");
	const [calibrationMode, setCalibrationMode] =
		useState<AutoDraftCalibrationMode>("auto");
	const [manualOverride, setManualOverride] = useState(false);
	const [cadPoints, setCadPoints] =
		useState<CadPointInput[]>(DEFAULT_CAD_POINTS);
	const [replacementTuning, setReplacementTuning] =
		useState<ReplacementTuningInput>(DEFAULT_REPLACEMENT_TUNING);

	// ─── Canvas / calibration state ──────────────────────
	const [pdfPoints, setPdfPoints] = useState<AutoDraftComparePoint[]>([]);
	const [roiBounds, setRoiBounds] = useState<AutoDraftCompareRoi | null>(null);
	const [roiDrawMode, setRoiDrawMode] = useState(false);
	const [roiDrawStart, setRoiDrawStart] =
		useState<AutoDraftComparePoint | null>(null);

	// ─── Review / feedback state ─────────────────────────
	const [feedbackStateByActionId, setFeedbackStateByActionId] = useState<
		Record<string, "idle" | "saving" | "saved" | "error">
	>({});
	const [feedbackMessageByActionId, setFeedbackMessageByActionId] = useState<
		Record<string, string>
	>({});
	const [reviewSelectionByActionId, setReviewSelectionByActionId] = useState<
		Record<string, string>
	>({});
	const [reviewNoteByActionId, setReviewNoteByActionId] = useState<
		Record<string, string>
	>({});
	const [markupReviewDraftByActionId, setMarkupReviewDraftByActionId] =
		useState<Record<string, MarkupReviewDraft>>({});
	const [feedbackTransferState, setFeedbackTransferState] = useState<{
		color: "muted" | "warning" | "success";
		message: string;
	} | null>(null);

	// ─── Learning state ──────────────────────────────────
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

	// ─── Derived values ──────────────────────────────────
	const pageCount = pdfDoc?.numPages ?? 0;
	const pageNumber = pageIndex + 1;
	const invalidPageSelection = pageCount > 0 && pageIndex >= pageCount;
	const prepareDisabled =
		!pdfFile || loadingPrepare || loadingPdf || invalidPageSelection;
	const compareDisabled =
		loadingCompare || loadingPrepare || loadingPdf || !prepareResult;

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
		() => compareResult?.review_queue ?? [],
		[compareResult],
	);
	const markupReviewQueue = useMemo(
		() => compareResult?.markup_review_queue ?? [],
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
			if (markup.color !== "unknown") knownColors += 1;
			const meta = isRecordValue(markup.meta) ? markup.meta : null;
			const source =
				meta &&
				typeof meta.color_source === "string" &&
				meta.color_source.trim().length > 0
					? meta.color_source.trim().toUpperCase()
					: "UNKNOWN";
			counters.set(source, (counters.get(source) || 0) + 1);
		}
		const tokens = Array.from(counters.entries())
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([s, c]) => `${s}:${c}`)
			.join(" | ");
		return `Color extraction: known ${knownColors}/${prepareResult.markups.length} | sources ${tokens || "none"}`;
	}, [prepareResult]);

	const prepareTextFallbackSummary = useMemo(() => {
		const ext = prepareResult?.pdf_metadata.page.text_extraction;
		if (!ext) return null;
		if (!ext.used && ext.embedded_line_count <= 0 && ext.ocr_line_count <= 0)
			return null;
		if (!ext.used)
			return `Text fallback scanned but not used | embedded lines ${ext.embedded_line_count} | OCR lines ${ext.ocr_line_count}`;
		return `Text fallback: ${ext.source} | selected ${ext.selected_line_count} of ${Math.max(ext.candidate_count, ext.selected_line_count)} candidates | embedded lines ${ext.embedded_line_count} | OCR lines ${ext.ocr_line_count}`;
	}, [prepareResult]);

	// ─── PDF loading ─────────────────────────────────────
	useEffect(() => {
		if (!pdfFile) {
			setPdfDoc(null);
			setPdfPoints([]);
			setRoiBounds(null);
			setRoiDrawMode(false);
			setRoiDrawStart(null);
			return;
		}
		let cancelled = false;
		setLoadingPdf(true);
		setPrepareResult(null);
		setPrepareError(null);
		setCompareResult(null);
		setCompareError(null);
		setPdfPoints([]);
		setRoiBounds(null);
		setRoiDrawMode(false);
		setRoiDrawStart(null);

		void (async () => {
			try {
				const bytes = await pdfFile.arrayBuffer();
				const doc = await getDocument({ data: bytes }).promise;
				if (cancelled) return;
				setPdfDoc(doc);
				setPageIndex((c) => (c >= doc.numPages ? 0 : c));
			} catch (error) {
				if (cancelled) return;
				setPdfDoc(null);
				logger.error("Failed to load PDF preview", "AutoDraftComparePanel", error);
			} finally {
				if (!cancelled) setLoadingPdf(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [pdfFile]);

	// ─── Point capture ───────────────────────────────────
	const appendPdfPoint = useCallback((pt: AutoDraftComparePoint) => {
		setPdfPoints((prev) => {
			if (prev.length === 0) return [pt];
			if (prev.length === 1) return [prev[0], pt];
			return [prev[1], pt];
		});
	}, []);

	const handlePointCapture = useCallback(
		(pt: AutoDraftComparePoint) => {
			if (roiDrawMode) {
				if (!roiDrawStart) {
					setRoiDrawStart(pt);
				} else {
					setRoiBounds(buildRoiFromPointPair(roiDrawStart, pt));
					setRoiDrawStart(null);
					setRoiDrawMode(false);
				}
				return;
			}
			appendPdfPoint(pt);
		},
		[appendPdfPoint, roiDrawMode, roiDrawStart],
	);

	// ─── Config callbacks ────────────────────────────────
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
			setReplacementTuning((prev) => ({ ...prev, [field]: value }));
		},
		[],
	);

	const parseCadPoints = useCallback((): AutoDraftComparePoint[] | null => {
		const parsed = cadPoints.map((e) => ({ x: Number(e.x), y: Number(e.y) }));
		if (parsed.some((e) => !Number.isFinite(e.x) || !Number.isFinite(e.y)))
			return null;
		return parsed;
	}, [cadPoints]);

	const parseReplacementTuning =
		useCallback((): AutoDraftReplacementTuning | null => {
			const u = Number(replacementTuning.unresolvedConfidenceThreshold);
			const a = Number(replacementTuning.ambiguityMarginThreshold);
			const r = Number(replacementTuning.searchRadiusMultiplier);
			if (!Number.isFinite(u) || !Number.isFinite(a) || !Number.isFinite(r))
				return null;
			if (u < 0 || u > 1 || a < 0 || a > 1 || r < 0.5 || r > 8) return null;
			return {
				unresolved_confidence_threshold: u,
				ambiguity_margin_threshold: a,
				search_radius_multiplier: r,
				min_search_radius: 24,
			};
		}, [replacementTuning]);

	// ─── Feedback helpers ────────────────────────────────
	const resetFeedbackState = useCallback(() => {
		setFeedbackStateByActionId({});
		setFeedbackMessageByActionId({});
		setReviewSelectionByActionId({});
		setReviewNoteByActionId({});
		setMarkupReviewDraftByActionId({});
		setFeedbackTransferState(null);
	}, []);

	// ─── Prepare ─────────────────────────────────────────
	const runPrepare = useCallback(async () => {
		if (!pdfFile) {
			setPrepareError("Choose a PDF file first.");
			return;
		}
		setLoadingPrepare(true);
		setPrepareError(null);
		setCompareResult(null);
		setCompareError(null);
		resetFeedbackState();
		try {
			setPrepareResult(await autoDraftService.prepareCompare(pdfFile, pageIndex));
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
	}, [pdfFile, pageIndex, resetFeedbackState]);

	// ─── Compare ─────────────────────────────────────────
	const runCompare = useCallback(async () => {
		if (!prepareResult) {
			setCompareError("Run prepare first.");
			return;
		}
		const useManual = calibrationMode === "manual";
		let parsedCad: AutoDraftComparePoint[] | null = null;
		if (useManual) {
			if (pdfPoints.length !== 2) {
				setCompareError("Manual calibration needs exactly two PDF points.");
				return;
			}
			parsedCad = parseCadPoints();
			if (!parsedCad) {
				setCompareError("Enter valid CAD X/Y values for both calibration points.");
				return;
			}
		} else if (manualOverride && pdfPoints.length === 2) {
			parsedCad = parseCadPoints();
			if (!parsedCad) {
				setCompareError("Manual fallback is enabled, but CAD X/Y values are invalid.");
				return;
			}
		}
		const tuning = parseReplacementTuning();
		if (!tuning) {
			setCompareError("Replacement tuning values are invalid.");
			return;
		}
		setLoadingCompare(true);
		setCompareError(null);
		resetFeedbackState();
		try {
			setCompareResult(
				await autoDraftService.runCompare({
					engine,
					toleranceProfile: tolerance,
					calibrationMode,
					agentReviewMode: "pre",
					manualOverride,
					markups: prepareResult.markups,
					pdfPoints: parsedCad ? pdfPoints : undefined,
					cadPoints: parsedCad ?? undefined,
					roi: roiBounds || undefined,
					calibrationSeed: prepareResult.calibration_seed,
					replacementTuning: tuning,
				}),
			);
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
		prepareResult, pdfPoints, parseCadPoints, parseReplacementTuning,
		engine, tolerance, calibrationMode, manualOverride, roiBounds,
		resetFeedbackState,
	]);

	const setReviewSelection = useCallback(
		(actionId: string, entityId: string) => {
			setReviewSelectionByActionId((p) => ({ ...p, [actionId]: entityId }));
		},
		[],
	);
	const setReviewNote = useCallback((actionId: string, note: string) => {
		setReviewNoteByActionId((p) => ({ ...p, [actionId]: note }));
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

	// ─── Review feedback submission ──────────────────────
	const submitReviewFeedback = useCallback(
		async (
			item: AutoDraftCompareReviewItem,
			mode: "approve" | "unresolved",
		) => {
			if (!compareResult) return;
			const actionId = String(item.action_id || "").trim();
			if (!actionId) return;
			const selectedEntityId =
				reviewSelectionByActionId[actionId] ||
				item.selected_entity_id ||
				item.candidates[0]?.entity_id ||
				"";
			const selectedCandidate =
				item.candidates.find((e) => e.entity_id === selectedEntityId) ||
				item.candidates[0];
			const existingEntityId = String(item.selected_entity_id || "").trim();
			const reviewStatus =
				mode === "unresolved"
					? "unresolved"
					: selectedEntityId && selectedEntityId !== existingEntityId
						? "corrected"
						: "approved";
			setFeedbackStateByActionId((p) => ({ ...p, [actionId]: "saving" }));
			setFeedbackMessageByActionId((p) => ({ ...p, [actionId]: "" }));
			try {
				await autoDraftService.submitCompareFeedback({
					requestId: compareResult.requestId,
					items: [
						{
							request_id: item.request_id || compareResult.requestId,
							action_id: actionId,
							review_status: reviewStatus,
							new_text: item.new_text,
							selected_old_text: mode === "unresolved" ? "" : selectedCandidate?.text || item.selected_old_text || "",
							selected_entity_id: mode === "unresolved" ? "" : selectedEntityId,
							confidence: typeof selectedCandidate?.score === "number" ? selectedCandidate.score : item.confidence,
							note: reviewNoteByActionId[actionId] || "",
							candidates: item.candidates,
							selected_candidate: mode === "unresolved" || !selectedCandidate ? undefined : selectedCandidate,
							agent_suggestion: item.agent_hint,
							accepted_agent_suggestion: mode === "approve" && Boolean(item.agent_hint),
						},
					],
				});
				setFeedbackStateByActionId((p) => ({ ...p, [actionId]: "saved" }));
				setFeedbackMessageByActionId((p) => ({
					...p,
					[actionId]:
						reviewStatus === "corrected" ? "Correction saved."
						: reviewStatus === "approved" ? "Review approved and saved."
						: "Marked unresolved and saved.",
				}));
			} catch (error) {
				setFeedbackStateByActionId((p) => ({ ...p, [actionId]: "error" }));
				setFeedbackMessageByActionId((p) => ({
					...p,
					[actionId]: error instanceof Error && error.message.trim().length > 0
						? error.message
						: "Failed to save review feedback.",
				}));
			}
		},
		[compareResult, reviewNoteByActionId, reviewSelectionByActionId],
	);

	// ─── Markup review feedback submission ───────────────
	const submitMarkupReviewFeedback = useCallback(
		async (
			item: AutoDraftMarkupReviewItem,
			mode: "approve" | "unresolved",
		) => {
			if (!compareResult) return;
			const actionId = String(item.action_id || "").trim();
			if (!actionId) return;
			const action = compareActionById.get(actionId);
			const markup = getMarkupReviewMarkup(item, action);
			if (!markup) return;
			const defaults = buildMarkupReviewDraftDefaults({
				item, action,
				storedDraft: markupReviewDraftByActionId[actionId],
			});
			const predictedCategory = normalizeMarkupReviewCategory(item.predicted_category || action?.category || defaults.category);
			const predictedClass = normalizeMarkupReviewClass(markup.type);
			const predictedColor = normalizeMarkupReviewColor(markup.color);
			const predictedText = typeof markup.text === "string" ? markup.text.trim() : "";
			const hasCorrections =
				defaults.category !== predictedCategory ||
				defaults.markupClass !== predictedClass ||
				defaults.color !== predictedColor ||
				defaults.text.trim() !== predictedText;
			const reviewStatus = mode === "unresolved" ? "unresolved" : hasCorrections ? "corrected" : "approved";
			const markupMeta = isRecordValue(markup.meta) ? markup.meta : null;
			const pairedIds = Array.isArray(action?.paired_annotation_ids)
				? action.paired_annotation_ids.filter((e): e is string => typeof e === "string" && e.trim().length > 0)
				: markupMeta && Array.isArray(markupMeta.paired_annotation_ids)
					? markupMeta.paired_annotation_ids.filter((e): e is string => typeof e === "string" && e.trim().length > 0)
					: [];

			setFeedbackStateByActionId((p) => ({ ...p, [actionId]: "saving" }));
			setFeedbackMessageByActionId((p) => ({ ...p, [actionId]: "" }));
			try {
				await autoDraftService.submitCompareFeedback({
					requestId: compareResult.requestId,
					items: [{
						request_id: item.request_id || compareResult.requestId,
						action_id: actionId,
						review_status: reviewStatus,
						feedback_type: "markup_learning",
						new_text: defaults.text || predictedText,
						note: reviewNoteByActionId[actionId] || "",
						markup_id: item.markup_id || (typeof markup.id === "string" ? markup.id : undefined),
						markup,
						predicted_category: predictedCategory || undefined,
						predicted_action: item.predicted_action || action?.action || undefined,
						corrected_intent: mode === "unresolved" || !defaults.category || defaults.category === predictedCategory ? undefined : defaults.category,
						corrected_markup_class: mode === "unresolved" || !defaults.markupClass || defaults.markupClass === predictedClass ? undefined : defaults.markupClass,
						corrected_color: mode === "unresolved" || !defaults.color || defaults.color === predictedColor ? undefined : defaults.color,
						corrected_text: mode === "unresolved" || defaults.text.trim() === predictedText ? undefined : defaults.text.trim(),
						ocr_text: markupMeta && typeof markupMeta.ocr_text === "string" && markupMeta.ocr_text.trim().length > 0 ? markupMeta.ocr_text : undefined,
						paired_annotation_ids: pairedIds.length > 0 ? pairedIds : undefined,
						recognition: item.recognition,
						override_reason: reviewNoteByActionId[actionId] || undefined,
					}],
				});
				setFeedbackStateByActionId((p) => ({ ...p, [actionId]: "saved" }));
				setFeedbackMessageByActionId((p) => ({
					...p,
					[actionId]:
						reviewStatus === "corrected" ? "Markup correction saved."
						: reviewStatus === "approved" ? "Markup review approved and saved."
						: "Markup marked unresolved and saved.",
				}));
			} catch (error) {
				setFeedbackStateByActionId((p) => ({ ...p, [actionId]: "error" }));
				setFeedbackMessageByActionId((p) => ({
					...p,
					[actionId]: error instanceof Error && error.message.trim().length > 0
						? error.message
						: "Failed to save markup review feedback.",
				}));
			}
		},
		[compareActionById, compareResult, markupReviewDraftByActionId, reviewNoteByActionId],
	);

	// ─── Learning callbacks ──────────────────────────────
	const trainMarkupModel = useCallback(async () => {
		try {
			setMarkupTrainingState({ color: "muted", message: "Training local markup model..." });
			const payload = await autoDraftService.trainLearningModels({ domain: "autodraft_markup" });
			setMarkupTrainingState(summarizeMarkupTrainingResult(payload.results));
		} catch (error) {
			setMarkupTrainingState({
				color: "warning",
				message: error instanceof Error && error.message.trim().length > 0 ? error.message : "Failed to train local markup model.",
			});
		}
	}, []);

	const refreshReplacementLearningStatus = useCallback(async () => {
		setReplacementLearningSummary((p) => ({ ...p, loading: true, error: null }));
		try {
			const [models, evals] = await Promise.all([
				autoDraftService.listLearningModels("autodraft_replacement"),
				autoDraftService.listLearningEvaluations({ domain: "autodraft_replacement", limit: 1 }),
			]);
			setReplacementLearningSummary({
				loading: false, error: null,
				model: (Array.isArray(models) ? models : []).find((e) => e.active) || models[0] || null,
				evaluation: (Array.isArray(evals) ? evals : [])[0] || null,
			});
		} catch (error) {
			setReplacementLearningSummary({
				loading: false, model: null, evaluation: null,
				error: error instanceof Error && error.message.trim().length > 0 ? error.message : "Failed to load replacement learning status.",
			});
		}
	}, []);

	const trainReplacementModel = useCallback(async () => {
		try {
			setReplacementTrainingState({ color: "muted", message: "Training local replacement model..." });
			const payload = await autoDraftService.trainLearningModels({ domain: "autodraft_replacement" });
			setReplacementTrainingState(summarizeReplacementTrainingResult(payload.results));
			await refreshReplacementLearningStatus();
		} catch (error) {
			setReplacementTrainingState({
				color: "warning",
				message: error instanceof Error && error.message.trim().length > 0 ? error.message : "Failed to train local replacement model.",
			});
		}
	}, [refreshReplacementLearningStatus]);

	useEffect(() => {
		if (!compareResult) {
			setReplacementLearningSummary(EMPTY_LEARNING_SUMMARY);
			return;
		}
		void refreshReplacementLearningStatus();
	}, [compareResult, refreshReplacementLearningStatus]);

	// ─── Export helpers ──────────────────────────────────
	const exportJson = useCallback((data: unknown, prefix: string) => {
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `autodraft-${prefix}-${stamp}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, []);

	// ─── Render ──────────────────────────────────────────
	return (
		<div className={styles.comparePanel}>
			{/* Header */}
			<HStack gap={2} align="center" justify="between">
				<Text size="sm" weight="semibold">
					Bluebeam Compare (QA-only)
				</Text>
				<Button
					variant="outline"
					size="sm"
					onClick={() => void runCompare()}
					disabled={compareDisabled}
					loading={loadingCompare}
				>
					Run compare
				</Button>
			</HStack>

			{/* Controls row */}
			<div className={styles.compareControls}>
				<label htmlFor="autodraft-compare-pdf-file" className={styles.compareField}>
					<span>Bluebeam PDF</span>
					<input
						id="autodraft-compare-pdf-file"
						name="autodraftComparePdfFile"
						type="file"
						accept="application/pdf,.pdf"
						onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
					/>
				</label>
				<label htmlFor="autodraft-compare-page-number" className={styles.compareField}>
					<span>Page number</span>
					<input
						id="autodraft-compare-page-number"
						name="autodraftComparePageNumber"
						type="number"
						min={1}
						max={pageCount > 0 ? pageCount : undefined}
						value={pageNumber}
						onChange={(e) => {
							const next = Math.max(1, Math.round(Number(e.target.value) || 1));
							const idx = pageCount > 0 ? Math.min(next, pageCount) - 1 : next - 1;
							setPageIndex((c) => { if (c === idx) return c; setPdfPoints([]); return idx; });
						}}
					/>
				</label>
				<label htmlFor="autodraft-compare-engine" className={styles.compareField}>
					<span>Engine</span>
					<select id="autodraft-compare-engine" value={engine} onChange={(e) => setEngine(e.target.value as AutoDraftCompareEngine)}>
						<option value="auto">auto</option>
						<option value="python">python</option>
						<option value="dotnet">dotnet</option>
					</select>
				</label>
				<label htmlFor="autodraft-compare-tolerance" className={styles.compareField}>
					<span>Tolerance</span>
					<select id="autodraft-compare-tolerance" value={tolerance} onChange={(e) => setTolerance(e.target.value as AutoDraftToleranceProfile)}>
						<option value="strict">strict</option>
						<option value="medium">medium</option>
						<option value="loose">loose</option>
					</select>
				</label>
				<Button variant="primary" size="sm" onClick={() => void runPrepare()} disabled={prepareDisabled} loading={loadingPrepare || loadingPdf}>
					Prepare markups
				</Button>
			</div>

			{/* Preview + Calibration */}
			<div className={styles.comparePreviewWrap}>
				<CompareCanvasViewport
					pdfDoc={pdfDoc}
					pageIndex={pageIndex}
					pdfPoints={pdfPoints}
					roiBounds={roiBounds}
					roiDrawMode={roiDrawMode}
					roiDrawStart={roiDrawStart}
					onPointCapture={handlePointCapture}
					onRoiComplete={(roi) => { setRoiBounds(roi); setRoiDrawMode(false); setRoiDrawStart(null); }}
					onRoiDrawStartCapture={setRoiDrawStart}
				/>
				<CompareCalibrationPanel
					prepareResult={prepareResult}
					pdfPoints={pdfPoints}
					cadPoints={cadPoints}
					calibrationMode={calibrationMode}
					manualOverride={manualOverride}
					replacementTuning={replacementTuning}
					onCadPointChange={updateCadPoint}
					onCalibrationModeChange={(m) => { setCalibrationMode(m); if (m === "manual") setManualOverride(false); }}
					onManualOverrideChange={setManualOverride}
					onReplacementTuningChange={updateReplacementTuning}
					onResetTuning={() => setReplacementTuning(DEFAULT_REPLACEMENT_TUNING)}
				/>
			</div>

			{/* Prepare summary */}
			{prepareResult ? (
				<div className={styles.compareSummary}>
					<HStack gap={2} align="center" justify="between" wrap>
						<Text size="xs" color="muted">
							Prepared {prepareResult.markups.length} markups from page {prepareResult.page.index + 1} of {prepareResult.page.total_pages}.
						</Text>
						<Button variant="ghost" size="sm" onClick={() => exportJson(prepareResult, "prepare")}>
							Export prepare JSON
						</Button>
					</HStack>
					<Text size="xs" color={prepareResult.pdf_metadata.bluebeam_detected ? "success" : "muted"}>
						Bluebeam metadata {prepareResult.pdf_metadata.bluebeam_detected
							? `detected (${prepareResult.pdf_metadata.detection_reasons.join(", ") || "signal"})`
							: "not detected"}.
					</Text>
					{prepareTextFallbackSummary ? <Text size="xs" color="muted">{prepareTextFallbackSummary}</Text> : null}
					{prepareColorSourcesSummary ? <Text size="xs" color="muted">{prepareColorSourcesSummary}</Text> : null}
					{prepareResult.warnings.map((w, i) => <Text key={`${w}:${i}`} size="xs" color="warning">{w}</Text>)}
				</div>
			) : null}
			{prepareError ? <Text size="sm" color="warning">{prepareError}</Text> : null}

			{/* Compare results */}
			{compareResult ? (
				<div className={styles.compareResult}>
					<HStack gap={2} align="center" justify="between">
						<Text size="xs" color="muted">
							Engine {compareResult.engine.used}{compareResult.engine.used_fallback ? " (fallback)" : ""} | request {compareResult.requestId}
						</Text>
						<Button variant="ghost" size="sm" onClick={() => exportJson(compareResult, "compare")}>
							Export JSON
						</Button>
					</HStack>
					<HStack gap={2} align="center" wrap>
						<Badge color="success" variant="soft">pass {compareResult.summary.pass_count}</Badge>
						<Badge color="warning" variant="soft">warn {compareResult.summary.warn_count}</Badge>
						<Badge color="danger" variant="soft">fail {compareResult.summary.fail_count}</Badge>
					</HStack>
					<Text size="xs" color="muted">
						Scale {compareResult.calibration.scale.toFixed(4)} | rotation {compareResult.calibration.rotation_deg.toFixed(2)} deg | mode {compareResult.calibration_mode || "auto"}
					</Text>

					{/* Backcheck findings */}
					<div className={styles.findingList}>
						{compareResult.backcheck.findings.map((finding) => {
							const action = compareActionById.get(finding.action_id);
							const markup = action?.markup;
							const colorDiag = markup && isRecordValue(markup) ? formatMarkupColorDiagnostic(markup) : null;
							return (
								<div key={finding.id} className={styles.findingCard}>
									<HStack gap={2} align="center" wrap>
										<Badge color={finding.status === "fail" ? "danger" : finding.status === "warn" ? "warning" : "success"} variant="soft">
											{finding.status}
										</Badge>
										<Text size="xs" color="muted">{finding.action_id} | {finding.category}</Text>
									</HStack>
									{colorDiag ? <Text size="xs" color="muted">Markup color: {colorDiag}</Text> : null}
									{finding.notes.map((n) => <Text key={`${finding.id}:${n}`} size="xs" color="muted">{n}</Text>)}
								</div>
							);
						})}
					</div>

					{/* Markup review */}
					<CompareMarkupReview
						markupReviewQueue={markupReviewQueue}
						compareActionById={compareActionById}
						feedbackStateByActionId={feedbackStateByActionId}
						feedbackMessageByActionId={feedbackMessageByActionId}
						markupReviewDraftByActionId={markupReviewDraftByActionId}
						reviewNoteByActionId={reviewNoteByActionId}
						markupTrainingState={markupTrainingState}
						onMarkupReviewDraft={setMarkupReviewDraft}
						onReviewNote={setReviewNote}
						onSubmitFeedback={submitMarkupReviewFeedback}
						onTrainMarkupModel={() => void trainMarkupModel()}
					/>

					{/* Replacement review */}
					<div className={styles.compareReviewPanel}>
						<HStack gap={2} align="center" justify="between" wrap>
							<Text size="xs" color="muted">
								Replacement review queue ({reviewQueue.length})
							</Text>
							<HStack gap={1} align="center" wrap>
								<CompareFeedbackManager
									prepareResult={prepareResult}
									compareResult={compareResult}
									pdfFileName={pdfFile?.name || ""}
									feedbackTransferState={feedbackTransferState}
									onFeedbackTransferState={setFeedbackTransferState}
								/>
							</HStack>
						</HStack>

						<CompareLearningPanel
							learningSummary={replacementLearningSummary}
							replacementTrainingState={replacementTrainingState}
							onRefreshStatus={() => void refreshReplacementLearningStatus()}
							onTrainModel={() => void trainReplacementModel()}
						/>

						<CompareReviewQueue
							reviewQueue={reviewQueue}
							shadowReviewByActionId={shadowReviewByActionId}
							feedbackStateByActionId={feedbackStateByActionId}
							feedbackMessageByActionId={feedbackMessageByActionId}
							reviewSelectionByActionId={reviewSelectionByActionId}
							reviewNoteByActionId={reviewNoteByActionId}
							onReviewSelection={setReviewSelection}
							onReviewNote={setReviewNote}
							onSubmitFeedback={submitReviewFeedback}
						/>
					</div>
				</div>
			) : null}
			{compareError ? <Text size="sm" color="warning">{compareError}</Text> : null}
		</div>
	);
}
