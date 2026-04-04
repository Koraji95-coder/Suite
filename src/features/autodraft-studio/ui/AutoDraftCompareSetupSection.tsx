import type { ChangeEvent } from "react";
import { Button } from "@/components/system/base/Button";
import { Text } from "@/components/system/base/Text";
import type {
	AutoDraftCalibrationMode,
	AutoDraftCompareEngine,
	AutoDraftToleranceProfile,
} from "./autodraftService";
import type { ReplacementTuningInput } from "./autoDraftCompareHelpers";
import type { PrepareStatus } from "./autoDraftCompareSelectors";
import styles from "./AutoDraftStudioApp.module.css";

type AutoDraftCompareSetupSectionProps = {
	pageCount: number;
	pageNumber: number;
	engine: AutoDraftCompareEngine;
	tolerance: AutoDraftToleranceProfile;
	calibrationMode: AutoDraftCalibrationMode;
	manualOverride: boolean;
	loadingPrepare: boolean;
	loadingPdf: boolean;
	prepareDisabled: boolean;
	replacementTuning: ReplacementTuningInput;
	prepareStatus: PrepareStatus | null;
	prepareWarnings: string[];
	onPdfFileChange: (file: File | null) => void;
	onPageNumberInputChange: (rawValue: string) => void;
	onEngineChange: (value: AutoDraftCompareEngine) => void;
	onToleranceChange: (value: AutoDraftToleranceProfile) => void;
	onCalibrationModeChange: (event: ChangeEvent<HTMLSelectElement>) => void;
	onManualOverrideChange: (checked: boolean) => void;
	onRunPrepare: () => void;
	onReplacementTuningChange: (
		field: keyof ReplacementTuningInput,
		value: string,
	) => void;
	onResetReplacementTuning: () => void;
};

export function AutoDraftCompareSetupSection({
	pageCount,
	pageNumber,
	engine,
	tolerance,
	calibrationMode,
	manualOverride,
	loadingPrepare,
	loadingPdf,
	prepareDisabled,
	replacementTuning,
	prepareStatus,
	prepareWarnings,
	onPdfFileChange,
	onPageNumberInputChange,
	onEngineChange,
	onToleranceChange,
	onCalibrationModeChange,
	onManualOverrideChange,
	onRunPrepare,
	onReplacementTuningChange,
	onResetReplacementTuning,
}: AutoDraftCompareSetupSectionProps) {
	return (
		<>
			<div className={styles.compareControls}>
				<label
					htmlFor="autodraft-compare-pdf-file"
					className={styles.compareField}
				>
					<span>Bluebeam PDF</span>
					<input
						id="autodraft-compare-pdf-file"
						name="autodraftComparePdfFile"
						type="file"
						accept="application/pdf,.pdf"
						onChange={(event) => {
							onPdfFileChange(event.target.files?.[0] ?? null);
						}}
					/>
				</label>
				<label
					htmlFor="autodraft-compare-page-number"
					className={styles.compareField}
				>
					<span>Page number</span>
					<input
						id="autodraft-compare-page-number"
						name="autodraftComparePageNumber"
						type="number"
						min={1}
						max={pageCount > 0 ? pageCount : undefined}
						value={pageNumber}
						onChange={(event) => onPageNumberInputChange(event.target.value)}
					/>
				</label>
				<label
					htmlFor="autodraft-compare-engine"
					className={styles.compareField}
				>
					<span>Engine</span>
					<select
						id="autodraft-compare-engine"
						name="autodraftCompareEngine"
						value={engine}
						onChange={(event) =>
							onEngineChange(event.target.value as AutoDraftCompareEngine)
						}
					>
						<option value="auto">auto</option>
						<option value="python">python</option>
						<option value="dotnet">dotnet</option>
					</select>
				</label>
				<label
					htmlFor="autodraft-compare-tolerance"
					className={styles.compareField}
				>
					<span>Tolerance</span>
					<select
						id="autodraft-compare-tolerance"
						name="autodraftCompareTolerance"
						value={tolerance}
						onChange={(event) =>
							onToleranceChange(event.target.value as AutoDraftToleranceProfile)
						}
					>
						<option value="strict">strict</option>
						<option value="medium">medium</option>
						<option value="loose">loose</option>
					</select>
				</label>
				<label
					htmlFor="autodraft-compare-calibration-mode"
					className={styles.compareField}
				>
					<span>Calibration mode</span>
					<select
						id="autodraft-compare-calibration-mode"
						name="autodraftCompareCalibrationMode"
						value={calibrationMode}
						onChange={onCalibrationModeChange}
					>
						<option value="auto">auto</option>
						<option value="manual">manual</option>
					</select>
				</label>
				<label
					htmlFor="autodraft-compare-manual-override"
					className={`${styles.compareField} ${styles.compareCheckboxField}`}
				>
					<input
						id="autodraft-compare-manual-override"
						name="autodraftCompareManualOverride"
						type="checkbox"
						checked={manualOverride}
						disabled={calibrationMode === "manual"}
						onChange={(event) => onManualOverrideChange(event.target.checked)}
					/>
					<span>Use manual points only if auto calibration fails</span>
				</label>
				<Button
					variant="primary"
					size="sm"
					onClick={onRunPrepare}
					disabled={prepareDisabled}
					loading={loadingPrepare || loadingPdf}
				>
					Prepare markups
				</Button>
			</div>
			<div className={styles.compareTuningPanel}>
				<Text size="xs" color="muted">
					Replacement tuning (red callouts)
				</Text>
				<div className={styles.compareTuningGrid}>
					<label
						htmlFor="autodraft-compare-tuning-unresolved-threshold"
						className={styles.compareField}
					>
						<span>Unresolved threshold</span>
						<input
							id="autodraft-compare-tuning-unresolved-threshold"
							name="autodraftCompareTuningUnresolvedThreshold"
							type="number"
							step="0.01"
							min={0}
							max={1}
							value={replacementTuning.unresolvedConfidenceThreshold}
							onChange={(event) =>
								onReplacementTuningChange(
									"unresolvedConfidenceThreshold",
									event.target.value,
								)
							}
						/>
					</label>
					<label
						htmlFor="autodraft-compare-tuning-ambiguity-margin"
						className={styles.compareField}
					>
						<span>Ambiguity margin</span>
						<input
							id="autodraft-compare-tuning-ambiguity-margin"
							name="autodraftCompareTuningAmbiguityMargin"
							type="number"
							step="0.01"
							min={0}
							max={1}
							value={replacementTuning.ambiguityMarginThreshold}
							onChange={(event) =>
								onReplacementTuningChange(
									"ambiguityMarginThreshold",
									event.target.value,
								)
							}
						/>
					</label>
					<label
						htmlFor="autodraft-compare-tuning-radius-multiplier"
						className={styles.compareField}
					>
						<span>Search radius multiplier</span>
						<input
							id="autodraft-compare-tuning-radius-multiplier"
							name="autodraftCompareTuningRadiusMultiplier"
							type="number"
							step="0.1"
							min={0.5}
							max={8}
							value={replacementTuning.searchRadiusMultiplier}
							onChange={(event) =>
								onReplacementTuningChange(
									"searchRadiusMultiplier",
									event.target.value,
								)
							}
						/>
					</label>
					<div className={styles.compareTuningActions}>
						<Button variant="ghost" size="sm" onClick={onResetReplacementTuning}>
							Reset tuning
						</Button>
					</div>
				</div>
				<Text size="xs" color="muted" className={styles.compareTuningHint}>
					Default: unresolved &lt; 0.36, ambiguous margin &lt;= 0.08, radius
					x2.5.
				</Text>
			</div>
			{prepareStatus ? (
				<div className={styles.comparePrepareStatus} aria-live="polite">
					<Text size="xs" color={prepareStatus.color}>
						{prepareStatus.message}
					</Text>
					{prepareWarnings.map((warning, index) => (
						<Text key={`${warning}:${index}`} size="xs" color="warning">
							{warning}
						</Text>
					))}
				</div>
			) : null}
		</>
	);
}
