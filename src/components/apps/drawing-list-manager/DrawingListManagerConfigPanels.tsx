import { Shuffle } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import styles from "./DrawingListManagerConfigPanels.module.css";
import {
	buildProjectCode,
	type ProjectConfig,
	type SwapRule,
} from "./drawingListManagerModels";

interface DrawingListManagerConfigPanelsProps {
	projectConfig: ProjectConfig;
	setProjectConfig: Dispatch<SetStateAction<ProjectConfig>>;
	templateCounts: Record<string, number>;
	setTemplateCounts: Dispatch<SetStateAction<Record<string, number>>>;
	swapRules: SwapRule[];
	setSwapRules: Dispatch<SetStateAction<SwapRule[]>>;
	onApplySwap: () => void;
}

export function DrawingListManagerConfigPanels({
	projectConfig,
	setProjectConfig,
	templateCounts,
	setTemplateCounts,
	swapRules,
	setSwapRules,
	onApplySwap,
}: DrawingListManagerConfigPanelsProps) {
	return (
		<div className={styles.layout}>
			{/* Project Standard */}
			<div className={styles.panel}>
				<h3 className={styles.title}>Project Standard</h3>
				<div className={styles.sectionGrid}>
					<label className={styles.labelGroup}>
						Project number (XXX)
						<input
							value={projectConfig.projectNumber}
							onChange={(e) => {
								const next = e.target.value.toUpperCase().replace(/^R3P-/, "");
								setProjectConfig((prev) => ({
									...prev,
									projectNumber: next,
								}));
							}}
							placeholder="25074"
							className={styles.input}
						/>
					</label>
					<label className={styles.labelGroup}>
						Default revision
						<input
							value={projectConfig.revisionDefault}
							onChange={(e) =>
								setProjectConfig((prev) => ({
									...prev,
									revisionDefault: e.target.value.toUpperCase(),
								}))
							}
							className={styles.input}
						/>
					</label>
					<label className={styles.checkboxRow}>
						<input
							type="checkbox"
							checked={projectConfig.enforceProjectCode}
							onChange={(e) =>
								setProjectConfig((prev) => ({
									...prev,
									enforceProjectCode: e.target.checked,
								}))
							}
						/>
						Enforce project code in naming convention
					</label>
					<div className={styles.labelGroup}>
						Naming pattern
						<div className={styles.patternPreview}>
							{buildProjectCode(projectConfig.projectNumber)}-DISC-TYPE-### REV
						</div>
					</div>
				</div>
			</div>

			{/* Drawing Types & Counts */}
			<div className={styles.panel}>
				<h3 className={styles.title}>Drawing Types & Counts</h3>
				<p className={styles.copy}>
					Set how many drawings of each type to generate.
				</p>
				<div className={styles.typesGrid}>
					{projectConfig.allowedDisciplines.flatMap((discipline) =>
						projectConfig.allowedSheetTypes.map((sheetType) => {
							const typeKey = `${discipline}-${sheetType}`;
							const count = templateCounts[typeKey] || 0;
							return (
								<div key={typeKey} className={styles.typeCard}>
									<label className={styles.typeLabel}>{typeKey}</label>
									<input
										type="number"
										min={0}
										max={99}
										value={count}
										onChange={(e) =>
											setTemplateCounts((prev) => ({
												...prev,
												[typeKey]: Math.max(0, Number(e.target.value)),
											}))
										}
										className={styles.input}
									/>
								</div>
							);
						}),
					)}
				</div>
			</div>

			{/* Hot Swap Names */}
			<div className={styles.panel}>
				<h3 className={styles.title}>Hot Swap Names</h3>
				<p className={styles.copy}>
					Replace naming fragments across titles and regenerate naming
					consistency.
				</p>
				<div className={styles.swapList}>
					{swapRules.map((rule) => (
						<div key={rule.id} className={styles.swapRow}>
							<input
								value={rule.from}
								onChange={(e) =>
									setSwapRules((prev) =>
										prev.map((item) =>
											item.id === rule.id
												? { ...item, from: e.target.value }
												: item,
										),
									)
								}
								placeholder="From"
								className={styles.input}
							/>
							<input
								value={rule.to}
								onChange={(e) =>
									setSwapRules((prev) =>
										prev.map((item) =>
											item.id === rule.id
												? { ...item, to: e.target.value }
												: item,
										),
									)
								}
								placeholder="To"
								className={styles.input}
							/>
						</div>
					))}
				</div>
				<button
					type="button"
					onClick={onApplySwap}
					className={styles.swapButton}
				>
					<Shuffle size={14} />
					Apply Swap Rules
				</button>
			</div>
		</div>
	);
}
