import {
	Activity,
	Archive,
	ArrowRight,
	Calendar,
	FileDown,
	Radar,
	TerminalSquare,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
	basenameFromPath,
	readWatchdogCollectorRuntimeState,
} from "@/lib/watchdogTelemetry";
import { buildDashboardWatchdogHref } from "@/lib/watchdogNavigation";
import styles from "./ProjectDetailHeader.module.css";
import type { Project, Task } from "./projectmanagertypes";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";
import { formatDateOnly } from "./projectmanagerutils";

interface ProjectDetailHeaderProps {
	project: Project;
	tasks: Task[];
	telemetry?: ProjectWatchdogTelemetry;
	onToggleArchive: (project: Project) => void;
	onExportMarkdown: () => void;
}

function formatRelativeTime(timestamp: number | string | null | undefined): string {
	if (!timestamp) return "—";
	const timeValue =
		typeof timestamp === "string"
			? new Date(timestamp).getTime()
			: Number(timestamp);
	if (!Number.isFinite(timeValue) || timeValue <= 0) return "—";

	const deltaMinutes = Math.round((Date.now() - timeValue) / 60000);
	if (Math.abs(deltaMinutes) < 1) return "just now";
	if (Math.abs(deltaMinutes) < 60) return `${deltaMinutes}m ago`;

	const deltaHours = Math.round(deltaMinutes / 60);
	if (Math.abs(deltaHours) < 24) return `${deltaHours}h ago`;

	return `${Math.round(deltaHours / 24)}d ago`;
}

function formatProjectStatus(status: Project["status"]): string {
	return (status === "completed" ? "archived" : status)
		.replace("-", " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getCategoryToneClass(category: string | null | undefined): string {
	const normalized =
		category === "QAQC"
			? "standards"
			: String(category || "")
					.trim()
					.toLowerCase();

	switch (normalized) {
		case "coding":
			return styles.categoryCoding;
		case "substation":
			return styles.categorySubstation;
		case "standards":
			return styles.categoryStandards;
		case "school":
			return styles.categorySchool;
		default:
			return styles.categoryGeneric;
	}
}

export function ProjectDetailHeader({
	project,
	tasks,
	telemetry,
	onToggleArchive,
	onExportMarkdown,
}: ProjectDetailHeaderProps) {
	const completionPercentage =
		tasks.length > 0
			? Math.round(
					(tasks.filter((task) => task.completed).length / tasks.length) * 100,
				)
			: 0;

	const completedTaskCount = tasks.filter((task) => task.completed).length;
	const openTaskCount = Math.max(tasks.length - completedTaskCount, 0);
	const overdueTaskCount = tasks.filter((task) => {
		if (task.completed || !task.due_date) return false;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const [year, month, day] = task.due_date
			.split("T")[0]
			.split("-")
			.map(Number);
		return new Date(year, month - 1, day) < today;
	}).length;
	const categoryToneClass = getCategoryToneClass(project.category);
	const dashboardLink = buildDashboardWatchdogHref(project.id);
	const leadSession = telemetry?.liveSessions[0] ?? telemetry?.latestSession ?? null;
	const leadAutoCadCollector =
		telemetry?.liveAutoCadCollectors[0] ?? telemetry?.autoCadCollectors[0] ?? null;
	const rule = telemetry?.rule ?? null;
	const leadRuntime = leadAutoCadCollector
		? readWatchdogCollectorRuntimeState(leadAutoCadCollector)
		: null;
	const ruleRootsCount = rule?.roots.length ?? 0;
	const rulePatternCount =
		(rule?.drawingPatterns.length ?? 0) + (rule?.includeGlobs.length ?? 0);
	const latestTrackedPath =
		leadRuntime?.activeDrawingPath ??
		leadSession?.drawingPath ??
		telemetry?.latestAutoCadEvent?.drawingPath ??
		telemetry?.latestAutoCadEvent?.path ??
		null;
	const latestTrackedLabel = latestTrackedPath
		? basenameFromPath(leadRuntime?.activeDrawingName || latestTrackedPath)
		: null;
	const commandCenterSummary =
		overdueTaskCount > 0
			? `${overdueTaskCount} overdue task${overdueTaskCount === 1 ? "" : "s"} need follow-up in the dashboard telemetry view.`
			: openTaskCount > 0
				? `${openTaskCount} active task${openTaskCount === 1 ? "" : "s"} remain for this project. Open dashboard telemetry to review recent file activity.`
				: "All tracked tasks are complete. Use the dashboard for telemetry, architecture, and exports.";
	const telemetrySummary = telemetry?.loading
		? "Checking collector and AutoCAD session telemetry for this project."
		: telemetry?.error
			? "Project telemetry is temporarily unavailable. Use the dashboard link for a retry."
			: telemetry?.activeCadSessionCount
				? `${telemetry.activeCadSessionCount} live AutoCAD session${telemetry.activeCadSessionCount === 1 ? "" : "s"} mapped to this project${latestTrackedLabel ? `, led by ${latestTrackedLabel}` : ""}${telemetry.totalCommandsInWindow ? ` with ${telemetry.totalCommandsInWindow} command${telemetry.totalCommandsInWindow === 1 ? "" : "s"} in range` : ""}.`
				: telemetry?.sessions.length
					? `${telemetry.sessions.length} recent AutoCAD session${telemetry.sessions.length === 1 ? "" : "s"} recorded for this project${latestTrackedLabel ? `, most recently around ${latestTrackedLabel}` : ""}.`
					: "No AutoCAD session telemetry has been attributed to this project yet.";
	const telemetryStatusLabel = telemetry?.loading
		? "Checking"
		: leadSession
			? leadSession.status === "completed"
				? "Idle"
				: leadSession.status === "paused"
					? "Paused"
					: "Live"
		: leadRuntime?.currentSessionId
			? leadRuntime.isPaused
				? "Paused"
				: "Live"
			: "Idle";
	const ruleSummary = telemetry?.loading
		? "Loading mapping rules"
		: rule
			? telemetry?.ruleConfigured
				? `${ruleRootsCount} root${ruleRootsCount === 1 ? "" : "s"}${rulePatternCount ? ` • ${rulePatternCount} pattern${rulePatternCount === 1 ? "" : "s"}` : ""}`
				: "Needs mapping rules"
			: "Rule status unavailable";

	const metrics = [
		{ label: "Tasks", value: String(tasks.length) },
		{ label: "Completed", value: String(completedTaskCount) },
		{ label: "Overdue", value: String(overdueTaskCount) },
		{ label: "Progress", value: `${completionPercentage}%` },
	];

	return (
		<section className={styles.root}>
			<div className={styles.top}>
				<div className={styles.main}>
					<h3 className={styles.title}>{project.name}</h3>
					<p className={styles.description}>{project.description}</p>

					<div className={styles.metaRow}>
						<span className={styles.statusBadge}>
							{formatProjectStatus(project.status)}
						</span>

						{project.deadline && (
							<div className={styles.deadline}>
								<Calendar className={styles.deadlineIcon} />
								<span>
									{project.status === "completed"
										? `Archived ${formatDateOnly(project.deadline)}`
										: `Due ${formatDateOnly(project.deadline)}`}
								</span>
							</div>
						)}

						{project.category && (
							<span className={`${styles.categoryBadge} ${categoryToneClass}`}>
								{project.category}
							</span>
						)}
					</div>

					<div className={styles.metrics}>
						{metrics.map((metric) => (
							<div key={metric.label} className={styles.metricCard}>
								<p className={styles.metricLabel}>{metric.label}</p>
								<p className={styles.metricValue}>{metric.value}</p>
							</div>
						))}
					</div>
				</div>

				<div className={styles.sideRail}>
					<div className={styles.commandCenterCard}>
						<div className={styles.commandCenterHead}>
							<div className={styles.commandCenterIcon}>
								<TerminalSquare className={styles.commandCenterIconGlyph} />
							</div>
							<div className={styles.commandCenterCopy}>
								<p className={styles.commandCenterEyebrow}>Project Ops</p>
								<h4 className={styles.commandCenterTitle}>Dashboard Telemetry</h4>
								<p className={styles.commandCenterSummary}>
									{commandCenterSummary}
								</p>
							</div>
						</div>

						<div className={styles.commandCenterStats}>
							<span className={styles.commandCenterStat}>
								{openTaskCount} open
							</span>
							<span className={styles.commandCenterStat}>
								{project.deadline
									? `Due ${formatDateOnly(project.deadline)}`
									: "No deadline"}
							</span>
						</div>

						<Link to={dashboardLink} className={styles.commandCenterLink}>
							<span>Open project telemetry</span>
							<ArrowRight className={styles.commandCenterLinkIcon} />
						</Link>
					</div>

					<div className={`${styles.commandCenterCard} ${styles.telemetryCard}`}>
						<div className={styles.commandCenterHead}>
							<div
								className={`${styles.commandCenterIcon} ${styles.telemetryIcon}`}
							>
								<Activity className={styles.commandCenterIconGlyph} />
							</div>
							<div className={styles.commandCenterCopy}>
								<p className={styles.commandCenterEyebrow}>Live CAD</p>
								<h4 className={styles.commandCenterTitle}>Project Telemetry</h4>
								<p className={styles.commandCenterSummary}>{telemetrySummary}</p>
							</div>
						</div>

						<div className={styles.commandCenterStats}>
							<span className={styles.commandCenterStat}>
								<Radar className={styles.telemetryStatIcon} />
								{telemetry?.onlineCollectorCount ?? 0} online
							</span>
							<span className={styles.commandCenterStat}>
								{telemetry?.overview?.events.inWindow ?? 0} events / 24h
							</span>
							<span className={styles.commandCenterStat}>{telemetryStatusLabel}</span>
							<span className={styles.commandCenterStat}>{ruleSummary}</span>
						</div>

						<div className={styles.telemetryBody}>
							<p className={styles.telemetryPrimary}>
								{latestTrackedLabel || "No active drawing mapped"}
							</p>
							<div className={styles.telemetryMeta}>
								{leadAutoCadCollector ? (
									<span>{leadAutoCadCollector.workstationId}</span>
								) : null}
								{telemetry?.latestTrackerUpdatedAt ? (
									<span>
										Tracker {formatRelativeTime(telemetry.latestTrackerUpdatedAt)}
									</span>
								) : null}
								{telemetry?.latestAutoCadEvent ? (
									<span>
										{telemetry.latestAutoCadEvent.eventType}{" "}
										{formatRelativeTime(telemetry.latestAutoCadEvent.timestamp)}
									</span>
								) : null}
							</div>
							<div className={styles.telemetryRuleList}>
								{telemetry?.ruleConfigured ? (
									<>
										<span className={styles.telemetryRuleChip}>
											{ruleRootsCount} root{ruleRootsCount === 1 ? "" : "s"}
										</span>
										<span className={styles.telemetryRuleChip}>
											{rulePatternCount} pattern{rulePatternCount === 1 ? "" : "s"}
										</span>
										{telemetry.ruleUpdatedAt ? (
											<span className={styles.telemetryRuleChip}>
												Updated {formatRelativeTime(telemetry.ruleUpdatedAt)}
											</span>
										) : null}
									</>
								) : (
									<span className={styles.telemetryRuleEmpty}>
										No project mapping rules configured yet.
									</span>
								)}
							</div>
						</div>

						<Link to={dashboardLink} className={styles.commandCenterLink}>
							<span>Open live telemetry in dashboard</span>
							<ArrowRight className={styles.commandCenterLinkIcon} />
						</Link>
					</div>

					<div className={styles.actions}>
						<button
							onClick={() => onToggleArchive(project)}
							className={styles.actionButton}
							title={
								project.status === "completed"
									? "Unarchive project"
									: "Archive project"
							}
							type="button"
						>
							<Archive className={styles.actionIcon} />
							<span>
								{project.status === "completed" ? "Unarchive" : "Archive"}
							</span>
						</button>
						<button
							onClick={onExportMarkdown}
							className={styles.actionButton}
							title="Copy project as Markdown"
							type="button"
						>
							<FileDown className={styles.actionIcon} />
							<span>Export</span>
						</button>
					</div>
				</div>
			</div>

			<div className={styles.progress}>
				<div className={styles.progressMeta}>
					<span className={styles.progressLabel}>Progress</span>
					<span className={styles.progressValue}>{completionPercentage}%</span>
				</div>
				<progress
					className={styles.progressTrack}
					max={100}
					value={completionPercentage}
					aria-label={`Project progress: ${completionPercentage}%`}
				/>
			</div>
		</section>
	);
}
