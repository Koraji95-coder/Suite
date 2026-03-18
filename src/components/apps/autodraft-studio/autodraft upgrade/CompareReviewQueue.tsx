// src/components/apps/autodraft/AutoDraftComparePanel/CompareReviewQueue.tsx
//
// Replacement review queue — candidate radio selection, agent hints,
// shadow advisor suggestions, per-item feedback submission.

import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import type {
	AutoDraftCompareResponse,
	AutoDraftCompareReviewItem,
} from "../autodraftService";
import { toSafeIdToken } from "./compareHelpers";
import styles from "../AutoDraftStudioApp.module.css";

// ── Types ────────────────────────────────────────────────

type FeedbackState = "idle" | "saving" | "saved" | "error";

type ShadowSuggestion = NonNullable<
	AutoDraftCompareResponse["shadow_advisor"]
>["reviews"][number];

// ── Props ────────────────────────────────────────────────

interface CompareReviewQueueProps {
	reviewQueue: AutoDraftCompareReviewItem[];
	shadowReviewByActionId: Map<string, ShadowSuggestion>;
	feedbackStateByActionId: Record<string, FeedbackState>;
	feedbackMessageByActionId: Record<string, string>;
	reviewSelectionByActionId: Record<string, string>;
	reviewNoteByActionId: Record<string, string>;
	onReviewSelection: (actionId: string, entityId: string) => void;
	onReviewNote: (actionId: string, note: string) => void;
	onSubmitFeedback: (
		item: AutoDraftCompareReviewItem,
		mode: "approve" | "unresolved",
	) => void;
}

// ── Component ────────────────────────────────────────────

export function CompareReviewQueue({
	reviewQueue,
	shadowReviewByActionId,
	feedbackStateByActionId,
	feedbackMessageByActionId,
	reviewSelectionByActionId,
	reviewNoteByActionId,
	onReviewSelection,
	onReviewNote,
	onSubmitFeedback,
}: CompareReviewQueueProps) {
	if (reviewQueue.length === 0) {
		return (
			<Text size="xs" color="muted">
				No red-callout replacement review items for this compare run.
			</Text>
		);
	}

	return (
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

						{/* Agent hint */}
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

						{/* Shadow suggestion */}
						{shadowSuggestion ? (
							<Text size="xs" color="muted">
								Shadow suggestion:{" "}
								{shadowSuggestion.suggested_old_text || "no old text"} (
								{shadowSuggestion.suggested_entity_id || "no entity id"})
								{typeof shadowSuggestion.confidence === "number"
									? ` @ ${shadowSuggestion.confidence.toFixed(2)}`
									: ""}
								{shadowSuggestion.rationale
									? ` - ${shadowSuggestion.rationale}`
									: ""}
							</Text>
						) : null}

						{/* Candidate radio selection */}
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
													onReviewSelection(actionId, candidate.entity_id)
												}
											/>
											<span>
												{candidate.text} ({candidate.entity_id}) | score{" "}
												{candidate.score.toFixed(2)} | d{" "}
												{candidate.distance.toFixed(1)}
												{candidate.score_components &&
												typeof candidate.score_components.agent_boost ===
													"number"
													? ` | boost +${candidate.score_components.agent_boost.toFixed(2)}`
													: ""}
												{candidate.selection_model
													? ` | model ${candidate.selection_model.label} @ ${candidate.selection_model.confidence.toFixed(2)}${candidate.selection_model.applied ? ` ${candidate.selection_model.adjustment >= 0 ? "+" : ""}${candidate.selection_model.adjustment.toFixed(2)}` : ""}`
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

						{/* Review note */}
						<label htmlFor={noteInputId} className={styles.compareFieldInline}>
							<span>Review note</span>
							<textarea
								id={noteInputId}
								name={noteInputName}
								className={styles.compareReviewNoteInput}
								rows={2}
								value={reviewNoteByActionId[actionId] || ""}
								onChange={(event) =>
									onReviewNote(actionId, event.target.value)
								}
							/>
						</label>

						{/* Actions */}
						<HStack gap={1} align="center" wrap>
							<Button
								variant="primary"
								size="sm"
								onClick={() => onSubmitFeedback(item, "approve")}
								disabled={feedbackState === "saving"}
							>
								{isCorrection ? "Save correction" : "Approve"}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => onSubmitFeedback(item, "unresolved")}
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

						{/* Feedback status */}
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
			})}
		</div>
	);
}
