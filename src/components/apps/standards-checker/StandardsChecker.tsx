import { useEffect, useState } from "react";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { ProjectWorkflowLinks } from "@/components/apps/ui/ProjectWorkflowLinks";
import {
	type TrustState,
	TrustStateBadge,
} from "@/components/apps/ui/TrustStateBadge";
import { Badge } from "@/components/primitives/Badge";
import { buildProjectDetailHref } from "@/lib/projectWorkflowNavigation";
import {
	type ProjectIssueSetRecord,
	projectIssueSetService,
} from "@/services/projectIssueSetService";
import styles from "./StandardsChecker.module.css";
import { StandardsCheckerHeaderPanel } from "./StandardsCheckerHeaderPanel";
import { StandardsCheckerStandardsList } from "./StandardsCheckerStandardsList";
import { StandardsDrawingChecker } from "./StandardsDrawingPanel";
import { useStandardsCheckerState } from "./useStandardsCheckerState";

interface StandardsReviewStage {
	state: TrustState;
	label: string;
	step: string;
	title: string;
	detail: string;
}

function resolveStandardsReviewStage(args: {
	mode: "standards" | "standards-drawing";
	hasProject: boolean;
	selectedCount: number;
	selectedProjectName: string | null;
	running: boolean;
	resultsCount: number;
	passCount: number;
	warningCount: number;
	failCount: number;
}) {
	const {
		mode,
		hasProject,
		selectedCount,
		selectedProjectName,
		running,
		resultsCount,
		passCount,
		warningCount,
		failCount,
	} = args;
	const projectLabel = selectedProjectName ?? "this package";

	if (!hasProject) {
		return {
			state: "needs-attention",
			label: "Select project",
			step: "Setup",
			title: "Choose the project you want to clear for issue.",
			detail:
				"Start with the project first so standards review, issue-set follow-up, and package evidence stay tied together.",
		} satisfies StandardsReviewStage;
	}

	if (mode === "standards-drawing") {
		return {
			state: "background",
			label: "Drawing review",
			step: "Evidence",
			title: `Review drawing-backed standards evidence for ${projectLabel}.`,
			detail:
				"Use drawing-backed review when the current package needs standards proof tied to a standards sheet or annotated plan.",
		} satisfies StandardsReviewStage;
	}

	if (running) {
		return {
			state: "background",
			label: "Running checks",
			step: "Run",
			title: `Running the selected standards checks for ${projectLabel}.`,
			detail:
				"Suite is evaluating the current standards pack and preparing the review summary.",
		} satisfies StandardsReviewStage;
	}

	if (selectedCount === 0) {
		return {
			state: "background",
			label: "Pick standards",
			step: "Select",
			title: `Choose the standards family for ${projectLabel}.`,
			detail:
				"Start with the code family that applies to the current package, then run only the checks that matter right now.",
		} satisfies StandardsReviewStage;
	}

	if (resultsCount === 0) {
		return {
			state: "background",
			label: "Run review",
			step: "Run",
			title: `${selectedCount} standard${selectedCount === 1 ? "" : "s"} are staged for ${projectLabel}.`,
			detail:
				"Run the selected checks to see blockers, warnings, and package-ready passes in one result set.",
		} satisfies StandardsReviewStage;
	}

	if (failCount > 0) {
		return {
			state: "needs-attention",
			label: "Blockers found",
			step: "Resolve",
			title: `${failCount} blocker${failCount === 1 ? " needs" : " need"} follow-up before issue.`,
			detail:
				warningCount > 0
					? `${warningCount} warning${warningCount === 1 ? " also needs" : " also need"} review before the package is cleared.`
					: "Resolve the failed standards checks or document a waiver before moving forward.",
		} satisfies StandardsReviewStage;
	}

	if (warningCount > 0) {
		return {
			state: "background",
			label: "Warnings to review",
			step: "Review",
			title: `${warningCount} warning${warningCount === 1 ? " still needs" : " still need"} a decision.`,
			detail:
				"Warnings do not block the package by themselves, but they should be reviewed before issue.",
		} satisfies StandardsReviewStage;
	}

	return {
		state: "ready",
		label: "Checks passed",
		step: "Ready",
		title: `${passCount} selected standard${passCount === 1 ? "" : "s"} passed.`,
		detail:
			"The current standards pack is clear and ready to be attached to the project review flow.",
	} satisfies StandardsReviewStage;
}

interface StandardsCheckerProps {
	preferredProjectId?: string;
	preferredIssueSetId?: string;
}

export function StandardsChecker({
	preferredProjectId,
	preferredIssueSetId,
}: StandardsCheckerProps) {
	const {
		activeCategory,
		failCount,
		filteredStandards,
		getResultForStandard,
		loadingProjects,
		mode,
		passCount,
		projectOptions,
		results,
		running,
		selectedProjectId,
		selectedProjectName,
		selectedStandards,
		setSelectedProjectId,
		setActiveCategory,
		setMode,
		toggleStandard,
		runChecks,
		warningCount,
	} = useStandardsCheckerState(preferredProjectId);
	const [preferredIssueSet, setPreferredIssueSet] =
		useState<ProjectIssueSetRecord | null>(null);

	useEffect(() => {
		if (!selectedProjectId || !preferredIssueSetId) {
			setPreferredIssueSet(null);
			return;
		}

		let cancelled = false;
		const loadIssueSet = async () => {
			const result = await projectIssueSetService.fetchIssueSet(
				selectedProjectId,
				preferredIssueSetId,
			);
			if (!cancelled) {
				setPreferredIssueSet(result.data);
			}
		};

		void loadIssueSet();
		return () => {
			cancelled = true;
		};
	}, [preferredIssueSetId, selectedProjectId]);
	const selectedCount = selectedStandards.size;
	const stage = resolveStandardsReviewStage({
		mode,
		hasProject: Boolean(selectedProjectId),
		selectedCount,
		selectedProjectName,
		running,
		resultsCount: results.length,
		passCount,
		warningCount,
		failCount,
	});
	const workflowLinks = selectedProjectId
		? [
				{
					label: "Setup",
					to: buildProjectDetailHref(selectedProjectId, "setup"),
				},
				{
					label: "Review",
					to: buildProjectDetailHref(selectedProjectId, "review", {
						issueSet: preferredIssueSet?.id ?? null,
					}),
				},
				{
					label: "Issue Sets",
					to: buildProjectDetailHref(selectedProjectId, "issue-sets", {
						issueSet: preferredIssueSet?.id ?? null,
					}),
				},
			]
		: [];

	return (
		<div className={styles.page}>
			<PageContextBand
				eyebrow="Standards review"
				summary={
					<div className={styles.contextCopy}>
						<p className={styles.contextTitle}>{stage.title}</p>
						<p className={styles.contextSummary}>{stage.detail}</p>
					</div>
				}
				meta={
					<div className={styles.contextMeta}>
						<TrustStateBadge state={stage.state} label={stage.label} />
						<Badge variant="outline" color="default">
							{selectedProjectName ?? "No project selected"}
						</Badge>
						{preferredIssueSet ? (
							<Badge variant="soft" color="warning">
								{preferredIssueSet.issueTag}
							</Badge>
						) : null}
						<Badge variant="soft" color="info">
							{stage.step}
						</Badge>
					</div>
				}
			>
				{preferredIssueSet ? (
					<div className={styles.headerSummaryStrip}>
						<span className={styles.headerSummaryPill}>
							Package scope {preferredIssueSet.issueTag} •{" "}
							{preferredIssueSet.selectedDrawingPaths.length} drawing
							{preferredIssueSet.selectedDrawingPaths.length === 1 ? "" : "s"}
						</span>
					</div>
				) : null}
				<ProjectWorkflowLinks links={workflowLinks} />
			</PageContextBand>

			<StandardsCheckerHeaderPanel
				activeCategory={activeCategory}
				availableCount={filteredStandards.length}
				failCount={failCount}
				loadingProjects={loadingProjects}
				mode={mode}
				onModeChange={setMode}
				onProjectChange={setSelectedProjectId}
				selectedCount={selectedCount}
				onCategoryChange={setActiveCategory}
				onRunChecks={runChecks}
				passCount={passCount}
				projectOptions={projectOptions}
				resultsCount={results.length}
				running={running}
				selectedProjectId={selectedProjectId}
				warningCount={warningCount}
			/>

			{mode === "standards-drawing" ? (
				<StandardsDrawingChecker />
			) : (
				<>
					<StandardsCheckerStandardsList
						activeCategory={activeCategory}
						filteredStandards={filteredStandards}
						selectedStandards={selectedStandards}
						onToggleStandard={toggleStandard}
						getResultForStandard={getResultForStandard}
					/>
				</>
			)}
		</div>
	);
}
