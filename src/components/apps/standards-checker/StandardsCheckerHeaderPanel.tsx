import { Play } from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { cn } from "@/lib/utils";
import styles from "./StandardsChecker.module.css";
import { StandardsCheckerModeTabs } from "./StandardsCheckerModeTabs";
import { categories, type StandardsCategory } from "./standardsCheckerModels";
import type { StandardsCheckerMode } from "./standardsCheckerModels";

interface StandardsCheckerHeaderPanelProps {
	activeCategory: StandardsCategory;
	availableCount: number;
	failCount: number;
	loadingProjects: boolean;
	mode: StandardsCheckerMode;
	onModeChange: (mode: StandardsCheckerMode) => void;
	selectedCount: number;
	onProjectChange: (projectId: string) => void;
	onCategoryChange: (category: StandardsCategory) => void;
	onRunChecks: () => void;
	passCount: number;
	projectOptions: Array<{
		id: string;
		name: string;
	}>;
	resultsCount: number;
	running: boolean;
	selectedProjectId: string;
	warningCount: number;
}

export function StandardsCheckerHeaderPanel({
	activeCategory,
	availableCount,
	failCount,
	loadingProjects,
	mode,
	onModeChange,
	selectedCount,
	onProjectChange,
	onCategoryChange,
	onRunChecks,
	passCount,
	projectOptions,
	resultsCount,
	running,
	selectedProjectId,
	warningCount,
}: StandardsCheckerHeaderPanelProps) {
	const selectionSummary =
		selectedCount > 0
			? `${selectedCount} selected of ${availableCount}`
			: `${availableCount} available in this family`;
	const resultsSummary =
		resultsCount > 0
			? `${passCount} pass • ${warningCount} warning • ${failCount} blocker${failCount === 1 ? "" : "s"}`
			: null;

	return (
		<section className={styles.panel}>
			<div className={styles.headerTopRow}>
				<label className={styles.headerField}>
					<span className={styles.headerFieldLabel}>Project</span>
					<select
						className={styles.headerSelect}
						value={selectedProjectId}
						onChange={(event) => onProjectChange(event.target.value)}
						disabled={loadingProjects}
					>
						<option value="">Select a project</option>
						{projectOptions.map((project) => (
							<option key={project.id} value={project.id}>
								{project.name}
							</option>
						))}
					</select>
				</label>
				<div className={styles.headerModeBlock}>
					<span className={styles.headerFieldLabel}>Review mode</span>
					<StandardsCheckerModeTabs mode={mode} onModeChange={onModeChange} />
				</div>
			</div>

			{mode === "standards" ? (
				<>
					<div className={styles.headerActionRow}>
						<div className={styles.headerSummaryStrip}>
							<span className={styles.headerSummaryPill}>{selectionSummary}</span>
							{resultsSummary ? (
								<span className={styles.headerSummaryPill}>
									{resultsSummary}
								</span>
							) : null}
						</div>
						<Button
							type="button"
							size="sm"
							iconLeft={<Play className={styles.iconSm} />}
							onClick={onRunChecks}
							disabled={!selectedProjectId || selectedCount === 0 || running}
						>
							{running ? "Running review…" : "Run review"}
						</Button>
					</div>

					<div className={styles.headerCategoryRow}>
						<span className={styles.headerFieldLabel}>Standards family</span>
						<div className={styles.categories}>
							{categories.map((category) => {
								const isActive = activeCategory === category;
								return (
									<button
										key={category}
										type="button"
										onClick={() => onCategoryChange(category)}
										className={cn(
											styles.categoryButton,
											isActive && styles.categoryButtonActive,
										)}
									>
										{category}
									</button>
								);
							})}
						</div>
					</div>
				</>
			) : (
				<div className={styles.headerNote}>
					Drawing evidence review ties the package to sheet-backed standards
					proof instead of the standards pack selector.
				</div>
			)}
		</section>
	);
}
