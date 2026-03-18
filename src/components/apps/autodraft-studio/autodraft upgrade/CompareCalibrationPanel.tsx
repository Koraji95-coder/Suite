// src/components/apps/autodraft/AutoDraftComparePanel/CompareCalibrationPanel.tsx
//
// Extracted from AutoDraftComparePanel.tsx — calibration point inputs,
// replacement tuning controls, and auto-calibration status display.

import { type ChangeEvent, useCallback } from "react";
import { Button } from "@/components/primitives/Button";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import type {
	AutoDraftCalibrationMode,
	AutoDraftComparePrepareResponse,
	AutoDraftComparePoint,
} from "../autodraftService";
import styles from "../AutoDraftStudioApp.module.css";

// ── Types ────────────────────────────────────────────────

export type CadPointInput = {
	x: string;
	y: string;
};

export type ReplacementTuningInput = {
	unresolvedConfidenceThreshold: string;
	ambiguityMarginThreshold: string;
	searchRadiusMultiplier: string;
};

export const DEFAULT_CAD_POINTS: CadPointInput[] = [
	{ x: "", y: "" },
	{ x: "", y: "" },
];

export const DEFAULT_REPLACEMENT_TUNING: ReplacementTuningInput = {
	unresolvedConfidenceThreshold: "0.36",
	ambiguityMarginThreshold: "0.08",
	searchRadiusMultiplier: "2.5",
};

// ── Props ────────────────────────────────────────────────

interface CompareCalibrationPanelProps {
	prepareResult: AutoDraftComparePrepareResponse | null;
	pdfPoints: AutoDraftComparePoint[];
	cadPoints: CadPointInput[];
	calibrationMode: AutoDraftCalibrationMode;
	manualOverride: boolean;
	replacementTuning: ReplacementTuningInput;
	onCadPointChange: (index: number, field: keyof CadPointInput, value: string) => void;
	onCalibrationModeChange: (mode: AutoDraftCalibrationMode) => void;
	onManualOverrideChange: (checked: boolean) => void;
	onReplacementTuningChange: (field: keyof ReplacementTuningInput, value: string) => void;
	onResetTuning: () => void;
}

// ── Component ────────────────────────────────────────────

export function CompareCalibrationPanel({
	prepareResult,
	pdfPoints,
	cadPoints,
	calibrationMode,
	manualOverride,
	replacementTuning,
	onCadPointChange,
	onCalibrationModeChange,
	onManualOverrideChange,
	onReplacementTuningChange,
	onResetTuning,
}: CompareCalibrationPanelProps) {
	const requireManual = calibrationMode === "manual";
	const autoCalib = prepareResult?.auto_calibration;
	const calibSeed = prepareResult?.calibration_seed;

	const handleModeChange = useCallback(
		(event: ChangeEvent<HTMLSelectElement>) => {
			const next = event.target.value === "manual" ? "manual" : "auto";
			onCalibrationModeChange(next as AutoDraftCalibrationMode);
		},
		[onCalibrationModeChange],
	);

	return (
		<Stack gap={3}>
			{/* Calibration points */}
			<div className={styles.compareCalibrate}>
				<Text size="xs" color="muted" weight="semibold">
					Calibration Points
				</Text>

				{pdfPoints.map((point, index) => (
					<div key={index} className={styles.compareCadRow}>
						<div className={styles.compareFieldInline}>
							<Text size="xs" color="muted">
								PDF P{index + 1}
							</Text>
							<input
								type="text"
								readOnly
								value={
									point
										? `${point.x.toFixed(2)}, ${point.y.toFixed(2)}`
										: ""
								}
								placeholder="click canvas"
							/>
						</div>
						<div className={styles.compareFieldInline}>
							<Text size="xs" color="muted">
								CAD P{index + 1}
							</Text>
							<HStack gap={1}>
								<input
									type="text"
									placeholder="X"
									value={cadPoints[index]?.x ?? ""}
									onChange={(e) =>
										onCadPointChange(index, "x", e.target.value)
									}
								/>
								<input
									type="text"
									placeholder="Y"
									value={cadPoints[index]?.y ?? ""}
									onChange={(e) =>
										onCadPointChange(index, "y", e.target.value)
									}
								/>
							</HStack>
						</div>
					</div>
				))}

				{pdfPoints.length === 0 && (
					<Text size="xs" color="muted">
						Click the PDF canvas to place calibration points.
					</Text>
				)}

				{/* Calibration mode */}
				<div className={styles.compareFieldInline}>
					<Text size="xs" color="muted">
						Mode
					</Text>
					<select value={calibrationMode} onChange={handleModeChange}>
						<option value="auto">Auto</option>
						<option value="manual">Manual</option>
					</select>
				</div>

				{/* Manual override checkbox (only in auto mode) */}
				{!requireManual && (
					<label className={styles.compareCheckboxField}>
						<input
							type="checkbox"
							checked={manualOverride}
							onChange={(e) => onManualOverrideChange(e.target.checked)}
						/>
						<Text size="xs" color="muted">
							Use manual points as fallback if auto-calibration fails
						</Text>
					</label>
				)}

				{/* Auto-calibration status */}
				{autoCalib && (
					<div className={styles.comparePrepareStatus}>
						<Text size="xs" color="muted">
							Auto-calibration: {autoCalib.status} · confidence{" "}
							{(autoCalib.confidence * 100).toFixed(0)}% · method{" "}
							{autoCalib.method}
						</Text>
						{autoCalib.quality_notes.map((note, i) => (
							<Text key={i} size="xs" color="muted">
								{note}
							</Text>
						))}
					</div>
				)}

				{/* Calibration seed hints */}
				{calibSeed?.available && (
					<div className={styles.comparePrepareStatus}>
						<Text size="xs" color="muted">
							Calibration seed: {calibSeed.source}
							{calibSeed.scale_hint != null
								? ` · scale ~${calibSeed.scale_hint.toFixed(4)}`
								: ""}
							{calibSeed.rotation_hint_deg != null
								? ` · rotation ~${calibSeed.rotation_hint_deg.toFixed(1)}°`
								: ""}
							{calibSeed.ratio_text ? ` · ${calibSeed.ratio_text}` : ""}
						</Text>
					</div>
				)}
			</div>

			{/* Replacement tuning */}
			<div className={styles.compareTuningPanel}>
				<HStack gap={2} align="center" justify="between">
					<Text size="xs" color="muted" weight="semibold">
						Replacement Tuning
					</Text>
					<Button variant="ghost" size="sm" onClick={onResetTuning}>
						Reset
					</Button>
				</HStack>

				<div className={styles.compareTuningGrid}>
					<div className={styles.compareFieldInline}>
						<Text size="xs" color="muted">
							Confidence threshold
						</Text>
						<input
							type="number"
							step="0.01"
							min="0"
							max="1"
							value={replacementTuning.unresolvedConfidenceThreshold}
							onChange={(e) =>
								onReplacementTuningChange(
									"unresolvedConfidenceThreshold",
									e.target.value,
								)
							}
						/>
					</div>
					<div className={styles.compareFieldInline}>
						<Text size="xs" color="muted">
							Ambiguity margin
						</Text>
						<input
							type="number"
							step="0.01"
							min="0"
							max="1"
							value={replacementTuning.ambiguityMarginThreshold}
							onChange={(e) =>
								onReplacementTuningChange(
									"ambiguityMarginThreshold",
									e.target.value,
								)
							}
						/>
					</div>
					<div className={styles.compareFieldInline}>
						<Text size="xs" color="muted">
							Search radius ×
						</Text>
						<input
							type="number"
							step="0.1"
							min="0.5"
							max="8"
							value={replacementTuning.searchRadiusMultiplier}
							onChange={(e) =>
								onReplacementTuningChange(
									"searchRadiusMultiplier",
									e.target.value,
								)
							}
						/>
					</div>
				</div>

				<Text size="xs" color="muted" className={styles.compareTuningHint}>
					Controls how replacement candidates are scored and filtered.
					Lower confidence threshold → more resolved matches.
					Higher search radius → wider spatial search.
				</Text>
			</div>
		</Stack>
	);
}
