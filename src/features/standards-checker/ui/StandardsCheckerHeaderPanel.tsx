import { Play } from "lucide-react";
import {
	categories,
	type StandardsCategory,
	type StandardsCheckerMode,
} from "@/features/standards-checker/standardsCheckerModels";
import { Button } from "@/components/system/base/Button";
import { cn } from "@/lib/utils";
import styles from "./StandardsChecker.module.css";
import { StandardsCheckerModeTabs } from "./StandardsCheckerModeTabs";

interface StandardsCheckerHeaderPanelProps {
	activeCategory: StandardsCategory;
	availableCount: number;
	cadFamilyOptions: Array<{
		id: string;
		label: string;
		kind: string;
	}>;
	cadReferenceSummary: string | null;
	failCount: number;
	loadingProjects: boolean;
	loadingProjectProfile: boolean;
	mode: StandardsCheckerMode;
	onCadFamilyChange: (cadFamilyId: string) => void;
	onModeChange: (mode: StandardsCheckerMode) => void;
	selectedCount: number;
	onProjectChange: (projectId: string) => void;
	onCategoryChange: (category: StandardsCategory) => void;
	onRunChecks: () => void;
	onSaveProjectDefaults: () => void;
	passCount: number;
	projectProfileStatus: string | null;
	reviewStatus: string | null;
	projectOptions: Array<{
		id: string;
		name: string;
	}>;
	resultsCount: number;
	running: boolean;
	savingProjectProfile: boolean;
	selectedCadFamilyId: string;
	selectedProjectId: string;
	warningCount: number;
}

export function StandardsCheckerHeaderPanel({
	activeCategory,
	availableCount,
	cadFamilyOptions,
	cadReferenceSummary,
	failCount,
	loadingProjects,
	loadingProjectProfile,
	mode,
	onCadFamilyChange,
	onModeChange,
	selectedCount,
	onProjectChange,
	onCategoryChange,
	onRunChecks,
	onSaveProjectDefaults,
	passCount,
	projectProfileStatus,
	reviewStatus,
	projectOptions,
	resultsCount,
	running,
	savingProjectProfile,
	selectedCadFamilyId,
	selectedProjectId,
	warningCount,
}: StandardsCheckerHeaderPanelProps) {
	const selectionSummary =
		selectedCount > 0
			? `${selectedCount} selected of ${availableCount}`
			: `${availableCount} available in this family`;
	const resultsSummary =
		resultsCount > 0
			? `${passCount} pass / ${warningCount} warning / ${failCount} blocker${failCount === 1 ? "" : "s"}`
			: null;

	return (
		<section className={styles.panel}>
			<div className={styles.headerTopRow}>
				<label className={styles.headerField}>
					<span className={styles.headerFieldLabel}>Project</span>
					<select
						className={styles.headerSelect}
						name="standards-project"
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
							{running ? "Running review..." : "Run review"}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={onSaveProjectDefaults}
							disabled={
								!selectedProjectId || loadingProjectProfile || savingProjectProfile
							}
						>
							{savingProjectProfile ? "Saving defaults..." : "Save defaults"}
						</Button>
					</div>

					<div className={styles.headerCategoryRow}>
						<span className={styles.headerFieldLabel}>CAD family</span>
						<select
							className={styles.headerSelect}
							name="standards-cad-family"
							value={selectedCadFamilyId}
							onChange={(event) => onCadFamilyChange(event.target.value)}
							disabled={!selectedProjectId || loadingProjectProfile}
							aria-label="CAD family"
						>
							<option value="">Select a CAD family</option>
							{cadFamilyOptions.map((family) => (
								<option key={family.id} value={family.id}>
									{family.label}
									{family.kind ? ` (${family.kind})` : ""}
								</option>
							))}
						</select>
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

					{projectProfileStatus ? (
						<div className={styles.headerNote}>{projectProfileStatus}</div>
					) : null}
					{reviewStatus ? (
						<div className={styles.headerNote}>{reviewStatus}</div>
					) : null}
					{cadReferenceSummary ? (
						<div className={styles.headerNote}>{cadReferenceSummary}</div>
					) : null}
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
