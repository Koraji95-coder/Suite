import { type ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";
import { type Task } from "./projectmanagertypes";
import { useEffect, useMemo, useState } from "react";
import { activityService } from "@/services/activityService";
import styles from "./ProjectHealthScoreCard.module.css";

interface ProjectHealthScoreCardProps {
	tasks: Task[];
	telemetry?: ProjectWatchdogTelemetry;
	deadline?: string | null;
	projectId: string;
}

type HealthStatus = "on-track" | "monitoring" | "at-risk";

function computeHealthStatus(score: number, overdue: number): HealthStatus {
	if (overdue >= 3 || score < 45) {
		return "at-risk";
	}
	if (score < 70) {
		return "monitoring";
	}
	return "on-track";
}

function formatStatusCopy(status: HealthStatus): string {
	switch (status) {
		case "on-track":
			return "On track: Active monitoring is clear.";
		case "monitoring":
			return "Monitoring: Some items need attention.";
		default:
			return "Alert: Immediate follow-up recommended.";
	}
}

function minutesAgo(timestamp: string | null): number | null {
	if (!timestamp) return null;
	const candidate = Date.parse(timestamp);
	if (!Number.isFinite(candidate)) return null;
	return Math.round((Date.now() - candidate) / 60000);
}

export function ProjectHealthScoreCard({
	tasks,
	telemetry,
	deadline,
	projectId,
}: ProjectHealthScoreCardProps) {
	const completedCount = tasks.filter((task) => task.completed).length;
	const totalTasks = tasks.length;
	const overdueTasks = tasks.filter((task) => {
		if (task.completed || !task.due_date) return false;
		const due = Date.parse(task.due_date);
		if (!Number.isFinite(due)) return false;
		return due < Date.now();
	}).length;

	const completionRate =
		totalTasks === 0 ? 0 : Math.round((completedCount / totalTasks) * 100);
	const deadlineMs = deadline ? Date.parse(deadline) : NaN;
	const daysUntilDeadline = Number.isFinite(deadlineMs)
		? Math.max(0, Math.floor((deadlineMs - Date.now()) / (1000 * 60 * 60 * 24)))
		: null;

	const [lastActivityMinutes, setLastActivityMinutes] = useState<number | null>(null);

	useEffect(() => {
		let cancelled = false;
		if (!projectId) {
			setLastActivityMinutes(null);
			return;
		}
		activityService.fetchRecentActivity(3).then((result) => {
			if (cancelled) return;
			const row = result.data.find((entry) => entry.project_id === projectId);
			if (row) {
				const minutes = minutesAgo(row.timestamp);
				setLastActivityMinutes(minutes);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [projectId]);

	const sessionAgeMinutes = telemetry?.latestSession
		? minutesAgo(new Date(telemetry.latestSession.latestEventAt).toISOString())
		: null;
	const eventAgeMinutes = telemetry?.latestAutoCadEvent
		? minutesAgo(new Date(telemetry.latestAutoCadEvent.timestamp).toISOString())
		: null;
	const freshestSignalMinutes = [lastActivityMinutes, sessionAgeMinutes, eventAgeMinutes]
		.filter((value): value is number => typeof value === "number" && value >= 0)
		.sort((left, right) => left - right)[0] ?? null;

	const signalScore = useMemo(() => {
		const telemetryScore =
			telemetry && telemetry.activeCadSessionCount > 0 ? 25 : 10;
		const activityScore =
			lastActivityMinutes === null
				? 10
				: lastActivityMinutes < 60
					? 20
					: lastActivityMinutes < 240
						? 10
						: 0;
		const completionScore =
			totalTasks === 0 ? 30 : Math.min(30, completionRate / 4);
		const deadlineScore =
			daysUntilDeadline === null
				? 15
				: daysUntilDeadline > 14
					? 15
					: daysUntilDeadline > 4
						? 10
						: 0;
		return Math.min(
			100,
			Math.max(0, telemetryScore + activityScore + completionScore + deadlineScore),
		);
	}, [telemetry, completionRate, totalTasks, lastActivityMinutes, daysUntilDeadline]);

	const healthStatus = computeHealthStatus(signalScore, overdueTasks);

	return (
		<section className={styles.root}>
			<div className={styles.header}>
				<div>
					<p className={styles.title}>Health score</p>
				</div>
				<span
					className={`${styles.status} ${
						healthStatus === "on-track"
							? styles.statusOnTrack
							: healthStatus === "monitoring"
								? styles.statusMonitor
								: styles.statusAlert
					}`}
				>
					{healthStatus.replace("-", " ")}
				</span>
			</div>
			<p className={styles.summary}>{formatStatusCopy(healthStatus)}</p>
			<div className={styles.metrics}>
				<div className={styles.metricCard}>
					<p className={styles.metricLabel}>Score</p>
					<p className={styles.metricValue}>{signalScore}%</p>
				</div>
				<div className={styles.metricCard}>
					<p className={styles.metricLabel}>Overdue</p>
					<p className={styles.metricValue}>{overdueTasks}</p>
				</div>
				<div className={styles.metricCard}>
					<p className={styles.metricLabel}>Completion</p>
					<p className={styles.metricValue}>{completionRate}%</p>
				</div>
				<div className={styles.metricCard}>
					<p className={styles.metricLabel}>Last activity</p>
					<p className={styles.metricValue}>
						{freshestSignalMinutes === null
							? "n/a"
							: freshestSignalMinutes < 60
								? `${freshestSignalMinutes}m ago`
								: `${Math.floor(freshestSignalMinutes / 60)}h ago`}
					</p>
				</div>
			</div>
		</section>
	);
}
