import { FileCheck2, FolderTree, FolderUp, Radar } from "lucide-react";
import { Link } from "react-router-dom";
import { Panel } from "@/components/primitives/Panel";
import { buildProjectScopedAppHref } from "@/lib/projectWorkflowNavigation";
import { buildWatchdogHref } from "@/lib/watchdogNavigation";
import { ProjectSetupReadinessPanel } from "./ProjectSetupReadinessPanel";
import styles from "./ProjectSetupWorkspace.module.css";
import type { Project, ViewMode } from "./projectmanagertypes";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";

interface ProjectSetupWorkspaceProps {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	onOpenViewMode: (mode: ViewMode) => void;
}

function resolveSetupAction(project: Project, telemetry: ProjectWatchdogTelemetry) {
	const projectRoot = project.watchdog_root_path?.trim() || "";
	if (!projectRoot) {
		return {
			title: "Set the tracked project root first.",
			detail:
				"Choose the drawing folder before scan, review, issue sets, and Watchdog can all use the same project context.",
			label: "Open files & telemetry",
			mode: "files" as ViewMode,
			icon: FolderUp,
		};
	}

	if (!telemetry.ruleConfigured) {
		return {
			title: "Confirm shared Watchdog coverage.",
			detail:
				"The root is saved, but the shared mapping rules still need to land before workstation activity rolls up cleanly to this project.",
			label: "Open Watchdog",
			href: buildWatchdogHref(project.id),
			icon: Radar,
		};
	}

	return {
		title: "Open readiness and clear blockers.",
		detail:
			"Project setup is in place. Open Readiness to clear blockers before the next issue set.",
		label: "Open Readiness",
		mode: "readiness" as ViewMode,
		icon: FileCheck2,
	};
}

function isLinkSetupAction(
	action: ReturnType<typeof resolveSetupAction>,
): action is Extract<ReturnType<typeof resolveSetupAction>, { href: string }> {
	return "href" in action;
}

export function ProjectSetupWorkspace({
	project,
	telemetry,
	onOpenViewMode,
}: ProjectSetupWorkspaceProps) {
	const setupAction = resolveSetupAction(project, telemetry);
	const drawingListHref = buildProjectScopedAppHref(
		"/app/apps/drawing-list-manager",
		project.id,
	);
	const watchdogHref = buildWatchdogHref(project.id);

	return (
		<section className={styles.root}>
			<div className={styles.header}>
				<div className={styles.headerCopy}>
					<p className={styles.eyebrow}>Setup</p>
					<h4 className={styles.title}>Project setup</h4>
					<p className={styles.description}>
						Keep the project root, title block defaults, and issue prep aligned
						before package work begins.
					</p>
				</div>
			</div>

			<Panel variant="feature" padding="lg" className={styles.summaryPanel}>
				<div className={styles.summaryHeader}>
					<div className={styles.summaryIconShell}>
						<FolderTree className={styles.summaryIcon} />
					</div>
					<div>
						<h5 className={styles.summaryTitle}>Next action</h5>
						<p className={styles.summaryText}>{setupAction.title}</p>
						<p className={styles.summaryDetail}>{setupAction.detail}</p>
					</div>
				</div>
				<div className={styles.summaryActions}>
					{isLinkSetupAction(setupAction) ? (
						<Link to={setupAction.href} className={styles.primaryLink}>
							<setupAction.icon className={styles.linkIcon} />
							<span>{setupAction.label}</span>
						</Link>
					) : (
						<button
							type="button"
							className={styles.primaryButton}
							onClick={() => onOpenViewMode(setupAction.mode)}
						>
							<setupAction.icon className={styles.linkIcon} />
							<span>{setupAction.label}</span>
						</button>
					)}
					<div className={styles.utilityLinks}>
						<Link to={drawingListHref} className={styles.utilityLink}>
							<FileCheck2 className={styles.linkIcon} />
							<span>Title block review</span>
						</Link>
						<Link to={watchdogHref} className={styles.utilityLink}>
							<Radar className={styles.linkIcon} />
							<span>Watchdog</span>
						</Link>
						<button
							type="button"
							className={styles.utilityButton}
							onClick={() => onOpenViewMode("files")}
						>
							<FolderUp className={styles.linkIcon} />
							<span>Files & activity</span>
						</button>
					</div>
				</div>
			</Panel>

			<ProjectSetupReadinessPanel project={project} telemetry={telemetry} />
		</section>
	);
}
