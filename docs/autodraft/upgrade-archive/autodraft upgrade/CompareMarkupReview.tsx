// src/components/apps/autodraft/AutoDraftComparePanel/CompareMarkupReview.tsx
//
// Markup classification review — category/class/color/text correction,
// recognition metadata display, per-item feedback submission.

import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import type {
	AutoDraftCompareResponse,
	AutoDraftMarkupReviewItem,
} from "../autodraftService";
import {
	buildMarkupReviewDraftDefaults,
	formatMarkupColorDiagnostic,
	getMarkupReviewMarkup,
	isRecordValue,
	MARKUP_REVIEW_CATEGORY_OPTIONS,
	MARKUP_REVIEW_CLASS_OPTIONS,
	MARKUP_REVIEW_COLOR_OPTIONS,
	type MarkupReviewDraft,
	normalizeMarkupReviewCategory,
	normalizeMarkupReviewClass,
	normalizeMarkupReviewColor,
	toSafeIdToken,
} from "./compareHelpers";
import styles from "../AutoDraftStudioApp.module.css";

// ── Types ────────────────────────────────────────────────

type FeedbackState = "idle" | "saving" | "saved" | "error";

// ── Props ────────────────────────────────────────────────

interface CompareMarkupReviewProps {
	markupReviewQueue: AutoDraftMarkupReviewItem[];
	compareActionById: Map<
		string,
		AutoDraftCompareResponse["plan"]["actions"][number]
	>;
	feedbackStateByActionId: Record<string, FeedbackState>;
	feedbackMessageByActionId: Record<string, string>;
	markupReviewDraftByActionId: Record<string, MarkupReviewDraft>;
	reviewNoteByActionId: Record<string, string>;
	markupTrainingState: { color: "muted" | "warning" | "success"; message: string } | null;
	onMarkupReviewDraft: (actionId: string, patch: Partial<MarkupReviewDraft>) => void;
	onReviewNote: (actionId: string, note: string) => void;
	onSubmitFeedback: (
		item: AutoDraftMarkupReviewItem,
		mode: "approve" | "unresolved",
	) => void;
	onTrainMarkupModel: () => void;
}

// ── Component ────────────────────────────────────────────

export function CompareMarkupReview({
	markupReviewQueue,
	compareActionById,
	feedbackStateByActionId,
	feedbackMessageByActionId,
	markupReviewDraftByActionId,
	reviewNoteByActionId,
	markupTrainingState,
	onMarkupReviewDraft,
	onReviewNote,
	onSubmitFeedback,
	onTrainMarkupModel,
}: CompareMarkupReviewProps) {
	return (
		<div className={styles.compareReviewPanel}>
			<HStack gap={2} align="center" justify="between" wrap>
				<Text size="xs" color="muted">
					Markup review queue ({markupReviewQueue.length})
				</Text>
				<Button variant="ghost" size="sm" onClick={onTrainMarkupModel}>
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
					{markupReviewQueue.map((item) => (
						<MarkupReviewCard
							key={item.id}
							item={item}
							action={compareActionById.get(item.action_id)}
							feedbackState={feedbackStateByActionId[item.action_id] || "idle"}
							feedbackMessage={feedbackMessageByActionId[item.action_id] || ""}
							storedDraft={markupReviewDraftByActionId[item.action_id]}
							reviewNote={reviewNoteByActionId[item.action_id] || ""}
							onDraftChange={(patch) =>
								onMarkupReviewDraft(item.action_id, patch)
							}
							onNoteChange={(note) => onReviewNote(item.action_id, note)}
							onSubmit={(mode) => onSubmitFeedback(item, mode)}
						/>
					))}
				</div>
			)}
		</div>
	);
}

// ── Card ─────────────────────────────────────────────────

function MarkupReviewCard({
	item,
	action,
	feedbackState,
	feedbackMessage,
	storedDraft,
	reviewNote,
	onDraftChange,
	onNoteChange,
	onSubmit,
}: {
	item: AutoDraftMarkupReviewItem;
	action?: AutoDraftCompareResponse["plan"]["actions"][number];
	feedbackState: FeedbackState;
	feedbackMessage: string;
	storedDraft?: MarkupReviewDraft;
	reviewNote: string;
	onDraftChange: (patch: Partial<MarkupReviewDraft>) => void;
	onNoteChange: (note: string) => void;
	onSubmit: (mode: "approve" | "unresolved") => void;
}) {
	const actionId = String(item.action_id || "").trim();
	const safeActionId = toSafeIdToken(actionId || item.id);
	const markup = getMarkupReviewMarkup(item, action);
	const markupColorDiagnostic = markup
		? formatMarkupColorDiagnostic(markup)
		: null;
	const markupDraft = buildMarkupReviewDraftDefaults({
		item,
		action,
		storedDraft,
	});
	const predictedCategory = normalizeMarkupReviewCategory(
		item.predicted_category || action?.category || "",
	);
	const predictedMarkupClass = normalizeMarkupReviewClass(markup?.type);
	const predictedColor = normalizeMarkupReviewColor(markup?.color);
	const predictedText =
		typeof markup?.text === "string" ? markup.text.trim() : "";
	const hasMarkupCorrections =
		markupDraft.category !== predictedCategory ||
		markupDraft.markupClass !== predictedMarkupClass ||
		markupDraft.color !== predictedColor ||
		markupDraft.text.trim() !== predictedText;

	const categoryInputId = `autodraft-markup-review-category-${safeActionId}`;
	const classInputId = `autodraft-markup-review-class-${safeActionId}`;
	const colorInputId = `autodraft-markup-review-color-${safeActionId}`;
	const textInputId = `autodraft-markup-review-text-${safeActionId}`;
	const noteInputId = `autodraft-markup-review-note-${safeActionId}`;

	return (
		<div className={styles.compareReviewCard}>
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
				{item.predicted_action ? ` | ${item.predicted_action}` : ""}
			</Text>
			<Text size="xs" color="muted">
				Confidence {item.confidence.toFixed(2)}
				{markup && typeof markup.text === "string" && markup.text.trim().length > 0
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

			{/* Correction fields */}
			<div className={styles.compareReviewGrid}>
				<label htmlFor={categoryInputId} className={styles.compareFieldInline}>
					<span>Category</span>
					<select
						id={categoryInputId}
						name={`autodraftMarkupReviewCategory-${safeActionId}`}
						value={markupDraft.category}
						onChange={(event) =>
							onDraftChange({
								category: normalizeMarkupReviewCategory(event.target.value),
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
				<label htmlFor={classInputId} className={styles.compareFieldInline}>
					<span>Markup class</span>
					<select
						id={classInputId}
						name={`autodraftMarkupReviewClass-${safeActionId}`}
						value={markupDraft.markupClass}
						onChange={(event) =>
							onDraftChange({
								markupClass: normalizeMarkupReviewClass(event.target.value),
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
				<label htmlFor={colorInputId} className={styles.compareFieldInline}>
					<span>Color</span>
					<select
						id={colorInputId}
						name={`autodraftMarkupReviewColor-${safeActionId}`}
						value={markupDraft.color}
						onChange={(event) =>
							onDraftChange({
								color: normalizeMarkupReviewColor(event.target.value),
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
				<label htmlFor={textInputId} className={styles.compareFieldInline}>
					<span>Corrected text</span>
					<input
						id={textInputId}
						name={`autodraftMarkupReviewText-${safeActionId}`}
						type="text"
						value={markupDraft.text}
						onChange={(event) => onDraftChange({ text: event.target.value })}
					/>
				</label>
			</div>

			{/* Note */}
			<label htmlFor={noteInputId} className={styles.compareFieldInline}>
				<span>Review note</span>
				<textarea
					id={noteInputId}
					name={`autodraftMarkupReviewNote-${safeActionId}`}
					className={styles.compareReviewNoteInput}
					rows={2}
					value={reviewNote}
					onChange={(event) => onNoteChange(event.target.value)}
				/>
			</label>

			{/* Actions */}
			<HStack gap={1} align="center" wrap>
				<Button
					variant="primary"
					size="sm"
					onClick={() => onSubmit("approve")}
					disabled={feedbackState === "saving"}
				>
					{hasMarkupCorrections ? "Save markup correction" : "Approve markup"}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onSubmit("unresolved")}
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
					color={feedbackState === "error" ? "warning" : "success"}
				>
					{feedbackMessage}
				</Text>
			) : null}
		</div>
	);
}
