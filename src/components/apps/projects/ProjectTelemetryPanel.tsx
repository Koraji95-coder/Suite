import { Activity, ArrowRight, Radar, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/primitives/Badge";
import { basenameFromPath } from "@/lib/watchdogTelemetry";
import { buildDashboardWatchdogHref } from "@/lib/watchdogNavigation";
import { watchdogService } from "@/services/watchdogService";
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

function joinRuleLines(values: string[] | undefined): string {
	return (values ?? []).join("\n");
}

function parseRuleLines(rawValue: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const part of rawValue.split(/[\n,]/)) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(trimmed);
	}
	return out;
}

function hasRuleValues(
	rule:
		| {
				roots?: string[];
				includeGlobs?: string[];
				excludeGlobs?: string[];
				drawingPatterns?: string[];
		  }
		| null
		| undefined,
): boolean {
	if (!rule) return false;
	return Boolean(
		(rule.roots ?? []).length ||
			(rule.includeGlobs ?? []).length ||
			(rule.excludeGlobs ?? []).length ||
			(rule.drawingPatterns ?? []).length,
	);
}

function toDisplayList(values: string[] | undefined): string {
	const list = values ?? [];
	return list.length > 0 ? list.join(", ") : "None";
}

export function ProjectTelemetryPanel({
	projectId,
	telemetry,
}: ProjectTelemetryPanelProps) {
	const dashboardLink = buildDashboardWatchdogHref(projectId);
	const [editingRules, setEditingRules] = useState(false);
	const [savingRules, setSavingRules] = useState(false);
	const [ruleError, setRuleError] = useState<string | null>(null);
	const [ruleRoots, setRuleRoots] = useState("");
	const [ruleIncludes, setRuleIncludes] = useState("");
	const [ruleExcludes, setRuleExcludes] = useState("");
	const [rulePatterns, setRulePatterns] = useState("");
	const [localRule, setLocalRule] = useState(telemetry.rule);

	useEffect(() => {
		if (editingRules) {
			return;
		}
		const incomingRule = telemetry.rule;
		const currentUpdatedAt = localRule?.updatedAt ?? 0;
		const incomingUpdatedAt = incomingRule?.updatedAt ?? 0;
		const nextRule =
			!localRule || incomingUpdatedAt > currentUpdatedAt
				? incomingRule
				: localRule;
		if (nextRule !== localRule) {
			setLocalRule(nextRule);
		}
		setRuleRoots(joinRuleLines(nextRule?.roots));
		setRuleIncludes(joinRuleLines(nextRule?.includeGlobs));
		setRuleExcludes(joinRuleLines(nextRule?.excludeGlobs));
		setRulePatterns(joinRuleLines(nextRule?.drawingPatterns));
	}, [editingRules, localRule, telemetry.rule]);

	const effectiveRule = localRule ?? telemetry.rule;
	const ruleConfigured = hasRuleValues(effectiveRule);

	const startEditingRules = () => {
		setRuleError(null);
		setEditingRules(true);
		setRuleRoots(joinRuleLines(effectiveRule?.roots));
		setRuleIncludes(joinRuleLines(effectiveRule?.includeGlobs));
		setRuleExcludes(joinRuleLines(effectiveRule?.excludeGlobs));
		setRulePatterns(joinRuleLines(effectiveRule?.drawingPatterns));
	};

	const cancelEditingRules = () => {
		setEditingRules(false);
		setRuleError(null);
		setRuleRoots(joinRuleLines(effectiveRule?.roots));
		setRuleIncludes(joinRuleLines(effectiveRule?.includeGlobs));
		setRuleExcludes(joinRuleLines(effectiveRule?.excludeGlobs));
		setRulePatterns(joinRuleLines(effectiveRule?.drawingPatterns));
	};

	const saveRules = async () => {
		if (savingRules) {
			return;
		}
		setSavingRules(true);
		setRuleError(null);
		try {
			const response = await watchdogService.putProjectRule(projectId, {
				roots: parseRuleLines(ruleRoots),
				includeGlobs: parseRuleLines(ruleIncludes),
				excludeGlobs: parseRuleLines(ruleExcludes),
				drawingPatterns: parseRuleLines(rulePatterns),
				metadata: effectiveRule?.metadata ?? {},
			});
			setLocalRule(response.rule);
			setEditingRules(false);
		} catch (error) {
			setRuleError(
				error instanceof Error
					? error.message
					: "Unable to update project mapping rules.",
			);
		} finally {
			setSavingRules(false);
		}
	};

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
							{ruleConfigured ? "Mapped" : "Needs rules"}
						</div>
						<div className={styles.statLabel}>Project attribution</div>
					</div>
				</div>
			</div>

			<section className={styles.rulePanel}>
				<div className={styles.ruleHeader}>
					<div>
						<h5 className={styles.ruleTitle}>Project mapping rules</h5>
						<p className={styles.ruleDescription}>
							Define roots and pattern filters used for telemetry attribution.
						</p>
					</div>
					{editingRules ? (
						<div className={styles.ruleActions}>
							<button
								type="button"
								className={styles.secondaryButton}
								onClick={cancelEditingRules}
								disabled={savingRules}
							>
								Cancel
							</button>
							<button
								type="button"
								className={styles.primaryButton}
								onClick={() => {
									void saveRules();
								}}
								disabled={savingRules}
							>
								{savingRules ? "Saving..." : "Save rules"}
							</button>
						</div>
					) : (
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={startEditingRules}
						>
							Edit rules
						</button>
					)}
				</div>

				{ruleError ? <div className={styles.ruleError}>{ruleError}</div> : null}

				{editingRules ? (
					<div className={styles.ruleEditorGrid}>
						<label htmlFor="project-rule-roots" className={styles.ruleField}>
							<span className={styles.ruleFieldLabel}>Roots</span>
							<textarea
								id="project-rule-roots"
								name="project_rule_roots"
								className={styles.ruleTextArea}
								rows={3}
								value={ruleRoots}
								onChange={(event) => setRuleRoots(event.target.value)}
								placeholder="One path per line"
							/>
						</label>
						<label htmlFor="project-rule-include" className={styles.ruleField}>
							<span className={styles.ruleFieldLabel}>Include globs</span>
							<textarea
								id="project-rule-include"
								name="project_rule_include_globs"
								className={styles.ruleTextArea}
								rows={3}
								value={ruleIncludes}
								onChange={(event) => setRuleIncludes(event.target.value)}
								placeholder="One glob per line"
							/>
						</label>
						<label htmlFor="project-rule-exclude" className={styles.ruleField}>
							<span className={styles.ruleFieldLabel}>Exclude globs</span>
							<textarea
								id="project-rule-exclude"
								name="project_rule_exclude_globs"
								className={styles.ruleTextArea}
								rows={3}
								value={ruleExcludes}
								onChange={(event) => setRuleExcludes(event.target.value)}
								placeholder="One glob per line"
							/>
						</label>
						<label htmlFor="project-rule-patterns" className={styles.ruleField}>
							<span className={styles.ruleFieldLabel}>Drawing patterns</span>
							<textarea
								id="project-rule-patterns"
								name="project_rule_drawing_patterns"
								className={styles.ruleTextArea}
								rows={3}
								value={rulePatterns}
								onChange={(event) => setRulePatterns(event.target.value)}
								placeholder="One drawing pattern per line"
							/>
						</label>
					</div>
				) : (
					<div className={styles.ruleSummaryGrid}>
						<div className={styles.ruleSummaryCard}>
							<div className={styles.ruleSummaryLabel}>Roots</div>
							<div className={styles.ruleSummaryValue}>
								{toDisplayList(effectiveRule?.roots)}
							</div>
						</div>
						<div className={styles.ruleSummaryCard}>
							<div className={styles.ruleSummaryLabel}>Include</div>
							<div className={styles.ruleSummaryValue}>
								{toDisplayList(effectiveRule?.includeGlobs)}
							</div>
						</div>
						<div className={styles.ruleSummaryCard}>
							<div className={styles.ruleSummaryLabel}>Exclude</div>
							<div className={styles.ruleSummaryValue}>
								{toDisplayList(effectiveRule?.excludeGlobs)}
							</div>
						</div>
						<div className={styles.ruleSummaryCard}>
							<div className={styles.ruleSummaryLabel}>Drawing patterns</div>
							<div className={styles.ruleSummaryValue}>
								{toDisplayList(effectiveRule?.drawingPatterns)}
							</div>
						</div>
						<div className={styles.ruleSummaryMeta}>
							Updated{" "}
							{effectiveRule?.updatedAt
								? formatRelativeTime(effectiveRule.updatedAt)
								: "—"}
						</div>
					</div>
				)}
			</section>

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
