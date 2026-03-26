import {
	Activity,
	ArrowRight,
	Calendar,
	Radar,
	Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
	basenameFromPath,
	readWatchdogCollectorRuntimeState,
} from "@/lib/watchdogTelemetry";
import { buildWatchdogHref } from "@/lib/watchdogNavigation";
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
	const watchdogLink = buildWatchdogHref(project.id);
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
	const workflowSummary =
		overdueTaskCount > 0
			? `${overdueTaskCount} at-risk work item${overdueTaskCount === 1 ? "" : "s"} still needs follow-up before the next package.`
			: openTaskCount > 0
				? `${openTaskCount} open work item${openTaskCount === 1 ? "" : "s"} remains in the project. Use Review, Issue Sets, and Watchdog to clear the next delivery.`
				: "The delivery lane is clear. Use Review, Issue Sets, and Watchdog to confirm the next package.";
	const telemetrySummary = telemetry?.loading
		? "Checking collector and AutoCAD session telemetry for this project."
		: telemetry?.error
			? "Project telemetry is temporarily unavailable. Use the Watchdog page for a retry."
			: telemetry?.activeCadSessionCount
				? `${telemetry.activeCadSessionCount} live AutoCAD session${telemetry.activeCadSessionCount === 1 ? "" : "s"} mapped to this project${latestTrackedLabel ? `, led by ${latestTrackedLabel}` : ""}.`
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
		{ label: "Open work", value: String(openTaskCount) },
		{ label: "At risk", value: String(overdueTaskCount) },
		{ label: "Completion", value: `${completionPercentage}%` },
	];

	return (
		<section className={styles.root}>
			<div className={styles.primary}>
				<div className={styles.infoBlock}>
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
							<div key={metric.label} className={styles.metricItem}>
								<span className={styles.metricLabel}>{metric.label}</span>
								<strong className={styles.metricValue}>{metric.value}</strong>
							</div>
						))}
					</div>
				</div>

				<div className={styles.actions}>
					<button
						type="button"
						className={styles.secondaryAction}
						onClick={() => onToggleArchive(project)}
					>
						{project.status === "completed" ? "Reopen" : "Archive"}
					</button>
					<button
						type="button"
						className={styles.primaryAction}
						onClick={onExportMarkdown}
					>
						Export summary
					</button>
				</div>
			</div>

			<div className={styles.signalGrid}>
				<div className={styles.signalRow}>
					<div className={styles.signalLead}>
						<div className={styles.signalIconShell}>
							<Workflow className={styles.signalIcon} />
						</div>
						<div>
							<p className={styles.signalEyebrow}>Delivery path</p>
							<h4 className={styles.signalTitle}>Delivery flow</h4>
						</div>
					</div>
					<div className={styles.signalContent}>
						<p className={styles.signalSummary}>{workflowSummary}</p>
						<div className={styles.signalMeta}>
							<span>{openTaskCount} open</span>
							<span>
								{project.deadline
									? `Due ${formatDateOnly(project.deadline)}`
									: "No deadline"}
							</span>
						</div>
					</div>
					<Link to={watchdogLink} className={styles.signalLink}>
						<span>Open Watchdog</span>
						<ArrowRight className={styles.signalLinkIcon} />
					</Link>
				</div>

				<div className={styles.signalRow}>
					<div className={styles.signalLead}>
						<div
							className={`${styles.signalIconShell} ${styles.telemetryIconShell}`}
						>
							<Activity className={styles.signalIcon} />
						</div>
						<div>
							<p className={styles.signalEyebrow}>Live CAD</p>
							<h4 className={styles.signalTitle}>Project telemetry</h4>
						</div>
					</div>
					<div className={styles.signalContent}>
						<p className={styles.signalSummary}>{telemetrySummary}</p>
						<div className={styles.signalMeta}>
							<span>
								<Radar className={styles.telemetryStatIcon} />
								{telemetry?.onlineCollectorCount ?? 0} online
							</span>
							<span>{telemetryStatusLabel}</span>
							<span>{ruleSummary}</span>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
