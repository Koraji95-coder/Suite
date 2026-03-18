import { Activity, ArrowRight, Radar, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/primitives/Badge";
import { basenameFromPath } from "@/lib/watchdogTelemetry";
import { buildDashboardWatchdogHref } from "@/lib/watchdogNavigation";
import styles from "./ProjectTelemetryPanel.module.css";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";

interface ProjectTelemetryPanelProps {
	projectId: string;
	telemetry: ProjectWatchdogTelemetry;
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

function formatDuration(durationMs: number | null | undefined): string {
	if (!durationMs || durationMs <= 0) return "0m";
	const totalMinutes = Math.max(1, Math.round(durationMs / 60000));
	if (totalMinutes < 60) return `${totalMinutes}m`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function ProjectTelemetryPanel({
	projectId,
	telemetry,
}: ProjectTelemetryPanelProps) {
	const dashboardLink = buildDashboardWatchdogHref(projectId);

	return (
		<section className={styles.root}>
			<div className={styles.header}>
				<div className={styles.headerCopy}>
					<div className={styles.iconWrap}>
						<Activity className={styles.icon} />
					</div>
					<div>
						<h4 className={styles.title}>Recent CAD sessions</h4>
						<p className={styles.description}>
							Project-scoped session summaries from the Watchdog session ledger.
						</p>
					</div>
				</div>
				<Link to={dashboardLink} className={styles.link}>
					<span>Open full telemetry</span>
					<ArrowRight className={styles.linkIcon} />
				</Link>
			</div>

			<div className={styles.stats}>
				<div className={styles.statCard}>
					<Radar className={styles.statIcon} />
					<div>
						<div className={styles.statValue}>
							{telemetry.activeCadSessionCount}
						</div>
						<div className={styles.statLabel}>Active sessions</div>
					</div>
				</div>
				<div className={styles.statCard}>
					<Wrench className={styles.statIcon} />
					<div>
						<div className={styles.statValue}>
							{telemetry.totalCommandsInWindow}
						</div>
						<div className={styles.statLabel}>Commands in range</div>
					</div>
				</div>
				<div className={styles.statCard}>
					<div>
						<div className={styles.statValue}>
							{telemetry.ruleConfigured ? "Mapped" : "Needs rules"}
						</div>
						<div className={styles.statLabel}>Project attribution</div>
					</div>
				</div>
			</div>

			{telemetry.loading ? (
				<div className={styles.emptyState}>Loading project telemetry...</div>
			) : telemetry.error ? (
				<div className={styles.emptyState}>{telemetry.error}</div>
			) : telemetry.sessions.length === 0 ? (
				<div className={styles.emptyState}>
					No recent AutoCAD sessions have been attributed to this project.
				</div>
			) : (
				<div className={styles.sessionList}>
					{telemetry.sessions.slice(0, 4).map((session) => (
						<div key={session.sessionId} className={styles.sessionRow}>
							<div className={styles.sessionMain}>
								<div className={styles.sessionTitle}>
									{basenameFromPath(session.drawingPath)}
								</div>
								<div className={styles.sessionMeta}>
									<span>{session.workstationId}</span>
									<span>Started {formatRelativeTime(session.startedAt)}</span>
									<span>{session.commandCount} command(s)</span>
									<span>{formatDuration(session.durationMs)}</span>
								</div>
							</div>
							<div className={styles.sessionAside}>
								<Badge
									color={
										session.status === "live"
											? "primary"
											: session.status === "paused"
												? "warning"
												: "accent"
									}
									variant="soft"
								>
									{session.status}
								</Badge>
								<div className={styles.sessionAge}>
									{session.lastActivityAt
										? `Activity ${formatRelativeTime(session.lastActivityAt)}`
										: `Updated ${formatRelativeTime(session.latestEventAt)}`}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</section>
	);
}
