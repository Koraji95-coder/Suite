// src/components/apps/autodraft/AutoDraftComparePanel/CompareLearningPanel.tsx
//
// Replacement model training controls, active model display, evaluation history.

import { Button } from "@/components/primitives/Button";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import type {
	AutoDraftLearningModel,
	AutoDraftLearningEvaluation,
} from "../autodraftService";
import {
	describeLearningModel,
	describeLearningEvaluation,
} from "./compareHelpers";

// ── Types ────────────────────────────────────────────────

export type LearningSummaryState = {
	loading: boolean;
	model: AutoDraftLearningModel | null;
	evaluation: AutoDraftLearningEvaluation | null;
	error: string | null;
};

export const EMPTY_LEARNING_SUMMARY: LearningSummaryState = {
	loading: false,
	model: null,
	evaluation: null,
	error: null,
};

// ── Props ────────────────────────────────────────────────

interface CompareLearningPanelProps {
	learningSummary: LearningSummaryState;
	replacementTrainingState: {
		color: "muted" | "warning" | "success";
		message: string;
	} | null;
	onRefreshStatus: () => void;
	onTrainModel: () => void;
}

// ── Component ────────────────────────────────────────────

export function CompareLearningPanel({
	learningSummary,
	replacementTrainingState,
	onRefreshStatus,
	onTrainModel,
}: CompareLearningPanelProps) {
	return (
		<Stack gap={2}>
			<HStack gap={1} align="center" wrap>
				<Button
					variant="ghost"
					size="sm"
					onClick={onRefreshStatus}
					disabled={learningSummary.loading}
				>
					Refresh replacement status
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={onTrainModel}
					disabled={learningSummary.loading}
				>
					Train replacement model
				</Button>
			</HStack>

			{replacementTrainingState ? (
				<Text size="xs" color={replacementTrainingState.color}>
					{replacementTrainingState.message}
				</Text>
			) : null}

			{learningSummary.loading ? (
				<Text size="xs" color="muted">
					Loading replacement learning status...
				</Text>
			) : learningSummary.error ? (
				<Text size="xs" color="warning">
					{learningSummary.error}
				</Text>
			) : (
				<Stack gap={1}>
					<Text size="xs" color="muted">
						{describeLearningModel("replacement", learningSummary.model)}
					</Text>
					<Text size="xs" color="muted">
						{describeLearningEvaluation(
							"replacement",
							learningSummary.evaluation,
						)}
					</Text>
				</Stack>
			)}
		</Stack>
	);
}
