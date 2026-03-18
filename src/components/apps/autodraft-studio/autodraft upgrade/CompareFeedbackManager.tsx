// src/components/apps/autodraft/AutoDraftComparePanel/CompareFeedbackManager.tsx
//
// Feedback export/import, reviewed run bundle export, and shadow advisor status.

import { type ChangeEvent, useCallback, useRef } from "react";
import { Button } from "@/components/primitives/Button";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import type {
	AutoDraftComparePrepareResponse,
	AutoDraftCompareResponse,
} from "../autodraftService";
import { autoDraftService } from "../autodraftService";
import styles from "../AutoDraftStudioApp.module.css";

// ── Types ────────────────────────────────────────────────

type TransferState = {
	color: "muted" | "warning" | "success";
	message: string;
} | null;

// ── Props ────────────────────────────────────────────────

interface CompareFeedbackManagerProps {
	prepareResult: AutoDraftComparePrepareResponse | null;
	compareResult: AutoDraftCompareResponse | null;
	pdfFileName: string;
	feedbackTransferState: TransferState;
	onFeedbackTransferState: (state: TransferState) => void;
}

// ── Component ────────────────────────────────────────────

export function CompareFeedbackManager({
	prepareResult,
	compareResult,
	pdfFileName,
	feedbackTransferState,
	onFeedbackTransferState,
}: CompareFeedbackManagerProps) {
	const importInputRef = useRef<HTMLInputElement | null>(null);

	const exportFeedbackMemory = useCallback(async () => {
		try {
			onFeedbackTransferState({
				color: "muted",
				message: "Exporting compare feedback memory...",
			});
			const payload = await autoDraftService.exportCompareFeedback();
			const stamp = new Date().toISOString().replace(/[:.]/g, "-");
			const blob = new Blob([JSON.stringify(payload, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `autodraft-compare-feedback-${stamp}.json`;
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			URL.revokeObjectURL(url);
			onFeedbackTransferState({
				color: "success",
				message: `Exported feedback memory (${payload.events.length} event${payload.events.length === 1 ? "" : "s"}).`,
			});
		} catch (error) {
			onFeedbackTransferState({
				color: "warning",
				message:
					error instanceof Error && error.message.trim().length > 0
						? error.message
						: "Failed to export compare feedback memory.",
			});
		}
	}, [onFeedbackTransferState]);

	const exportReviewedRun = useCallback(async () => {
		if (!prepareResult || !compareResult) return;
		try {
			onFeedbackTransferState({
				color: "muted",
				message: "Exporting reviewed run bundle...",
			});
			const bundle = await autoDraftService.exportReviewedRunBundle({
				prepare: prepareResult,
				compare: compareResult,
				label: pdfFileName || compareResult.requestId,
			});
			const stamp = new Date().toISOString().replace(/[:.]/g, "-");
			const blob = new Blob([JSON.stringify(bundle, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `autodraft-reviewed-run-${stamp}.json`;
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			URL.revokeObjectURL(url);
			onFeedbackTransferState({
				color: "success",
				message: `Exported reviewed run bundle (${bundle.feedback.eventCount} feedback item${bundle.feedback.eventCount === 1 ? "" : "s"}).`,
			});
		} catch (error) {
			onFeedbackTransferState({
				color: "warning",
				message:
					error instanceof Error && error.message.trim().length > 0
						? error.message
						: "Failed to export reviewed run bundle.",
			});
		}
	}, [compareResult, pdfFileName, prepareResult, onFeedbackTransferState]);

	const onImportChange = useCallback(
		async (event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0] ?? null;
			event.target.value = "";
			if (!file) return;
			try {
				onFeedbackTransferState({
					color: "muted",
					message: `Importing ${file.name}...`,
				});
				const text = await file.text();
				const parsed = JSON.parse(text) as Record<string, unknown>;
				const events = Array.isArray(parsed.events) ? parsed.events : [];
				const pairs = Array.isArray(parsed.pairs) ? parsed.pairs : [];
				const metrics = Array.isArray(parsed.metrics) ? parsed.metrics : [];
				const result = await autoDraftService.importCompareFeedback({
					mode: "merge",
					events,
					pairs,
					metrics,
				});
				const imported = result.imported;
				onFeedbackTransferState({
					color: "success",
					message: imported
						? `Imported feedback memory: ${imported.events} events, ${imported.pairs} pairs, ${imported.metrics} metrics.`
						: "Imported feedback memory.",
				});
			} catch (error) {
				onFeedbackTransferState({
					color: "warning",
					message:
						error instanceof Error && error.message.trim().length > 0
							? error.message
							: "Failed to import compare feedback memory.",
				});
			}
		},
		[onFeedbackTransferState],
	);

	return (
		<Stack gap={1}>
			<HStack gap={1} align="center" wrap>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => void exportFeedbackMemory()}
				>
					Export feedback
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => void exportReviewedRun()}
				>
					Export reviewed run
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => importInputRef.current?.click()}
				>
					Import feedback
				</Button>
				<input
					ref={importInputRef}
					type="file"
					accept="application/json,.json"
					onChange={(e) => void onImportChange(e)}
					style={{ display: "none" }}
				/>
			</HStack>

			{feedbackTransferState ? (
				<Text size="xs" color={feedbackTransferState.color}>
					{feedbackTransferState.message}
				</Text>
			) : null}

			{/* Shadow advisor status */}
			{compareResult?.shadow_advisor ? (
				<Stack gap={1}>
					<Text
						size="xs"
						color={
							compareResult.shadow_advisor.available ? "muted" : "warning"
						}
					>
						Shadow advisor `{compareResult.shadow_advisor.profile}`:{" "}
						{compareResult.shadow_advisor.available
							? `${compareResult.shadow_advisor.reviews.length} suggestion${compareResult.shadow_advisor.reviews.length === 1 ? "" : "s"} available.`
							: compareResult.shadow_advisor.error || "Unavailable."}
					</Text>
					{compareResult.shadow_advisor.auth ? (
						<Text size="xs" color="muted">
							Advisor auth: mode {compareResult.shadow_advisor.auth.mode} | token{" "}
							{compareResult.shadow_advisor.auth.token_source} | refresh{" "}
							{compareResult.shadow_advisor.auth.refresh_attempted
								? "attempted"
								: "not attempted"}
						</Text>
					) : null}
				</Stack>
			) : null}
		</Stack>
	);
}
