import { Activity, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/primitives/Badge";
import { basenameFromPath } from "@/lib/watchdogTelemetry";
import { buildWatchdogHref } from "@/lib/watchdogNavigation";
import {
	saveSharedProjectWatchdogRule,
	syncSharedProjectWatchdogRulesToLocalRuntime,
} from "@/services/projectWatchdogService";
import styles from "./ProjectTelemetryPanel.module.css";
import type {
	ProjectTrackedDrawingSummary,
	ProjectWatchdogTelemetry,
} from "./useProjectWatchdogTelemetry";

interface ProjectTelemetryPanelProps {
	projectId: string;
	telemetry: ProjectWatchdogTelemetry;
	onRootPathChange?: (rootPath: string | null) => void;
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

function formatDateLabel(value: string): string {
	if (!value) return "Unknown day";
	const parsed = new Date(`${value}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}
	return parsed.toLocaleDateString([], {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatClockTime(value: string): string {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}
	return parsed.toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
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
	onRootPathChange,
}: ProjectTelemetryPanelProps) {
	const watchdogLink = buildWatchdogHref(projectId);
	const [editingRules, setEditingRules] = useState(false);
	const [savingRules, setSavingRules] = useState(false);
	const [ruleError, setRuleError] = useState<string | null>(null);
	const [ruleRoots, setRuleRoots] = useState("");
	const [ruleIncludes, setRuleIncludes] = useState("");
	const [ruleExcludes, setRuleExcludes] = useState("");
	const [rulePatterns, setRulePatterns] = useState("");
	const [localRule, setLocalRule] = useState(telemetry.rule);
	const [expandedDrawings, setExpandedDrawings] = useState<Record<string, boolean>>({});

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
	const sessionTimeline = (telemetry.sessions.length
		? telemetry.sessions
		: telemetry.liveSessions
	).slice(0, 3);
	const loggedSessionCount = telemetry.sessions.length
		? telemetry.sessions.length
		: telemetry.liveSessions.length;

	const trackedDrawings = useMemo(
		() => telemetry.trackedDrawings.slice(0, 12),
		[telemetry.trackedDrawings],
	);

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
			const responseRule = await saveSharedProjectWatchdogRule(projectId, {
				roots: parseRuleLines(ruleRoots),
				includeGlobs: parseRuleLines(ruleIncludes),
				excludeGlobs: parseRuleLines(ruleExcludes),
				drawingPatterns: parseRuleLines(rulePatterns),
				metadata: effectiveRule?.metadata ?? {},
			});
			setLocalRule(responseRule);
			setEditingRules(false);
			onRootPathChange?.(responseRule.roots[0] ?? null);

			try {
				await syncSharedProjectWatchdogRulesToLocalRuntime();
			} catch (syncError) {
				setRuleError(
					syncError instanceof Error
						? `Rules saved, but local watchdog sync failed: ${syncError.message}`
						: "Rules saved, but local watchdog sync failed.",
				);
			}
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

	const toggleDrawingExpansion = (drawing: ProjectTrackedDrawingSummary) => {
		setExpandedDrawings((previous) => ({
			...previous,
			[drawing.drawingPath]: !previous[drawing.drawingPath],
		}));
	};

	return (
		<section className={styles.root}>
			<div className={styles.header}>
				<div>
					<div className={styles.headerTitle}>
						<Activity className={styles.headerIcon} />
						<h4>Project telemetry</h4>
					</div>
					<p className={styles.description}>
						Live AutoCAD sessions, shared project mapping, and drawing-day
						journals for this project.
					</p>
				</div>
				<Link to={watchdogLink} className={styles.link}>
					<span>Open Watchdog</span>
					<ArrowRight className={styles.linkIcon} />
				</Link>
			</div>

			<div className={styles.statsGrid}>
				<div className={styles.statCard}>
					<div className={styles.statLabel}>Active sessions</div>
					<div className={styles.statValue}>
						{telemetry.activeCadSessionCount}
					</div>
				</div>
				<div className={styles.statCard}>
					<div className={styles.statLabel}>Commands in window</div>
					<div className={styles.statValue}>
						{telemetry.totalCommandsInWindow}
					</div>
				</div>
				<div className={styles.statCard}>
					<div className={styles.statLabel}>Attribution</div>
					<div className={styles.statValue}>
						{ruleConfigured ? "Mapped" : "Needs rules"}
					</div>
				</div>
				<div className={styles.statCard}>
					<div className={styles.statLabel}>Tracked drawings</div>
					<div className={styles.statValue}>{telemetry.trackedDrawings.length}</div>
				</div>
			</div>

			<div className={styles.timeline}>
				<div className={styles.timelineHeader}>
					<div className={styles.timelineTitleRow}>
						<h5 className={styles.timelineTitle}>Recent CAD sessions</h5>
						<span>Session timeline</span>
					</div>
					<span>{loggedSessionCount} logged</span>
				</div>
				{sessionTimeline.length === 0 ? (
					<p className={styles.timelineEmpty}>No sessions to show yet.</p>
				) : (
					sessionTimeline.map((session) => (
						<div key={session.sessionId} className={styles.timelineItem}>
							<div className={styles.timelineMarker} />
							<div className={styles.timelineCopy}>
								<p className={styles.timelineLabel}>
									{basenameFromPath(session.drawingPath)}
								</p>
								<p className={styles.timelineMeta}>
									{formatDuration(session.durationMs)} •{" "}
									{formatRelativeTime(session.startedAt)}
								</p>
							</div>
							<Badge
								size="sm"
								color={session.status === "live" ? "success" : "default"}
							>
								{session.status.toUpperCase()}
							</Badge>
						</div>
					))
				)}
			</div>

			<section className={styles.rulePanel}>
				<div className={styles.ruleHeader}>
					<div>
						<h5 className={styles.ruleTitle}>Project mapping rules</h5>
						<p className={styles.ruleDescription}>
							Shared across workstations. Deepest matching root wins, then newest
							rule.
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
						<label htmlFor="project-rule-roots" className={styles.formField}>
							<span className={styles.formLabel}>Roots</span>
							<textarea
								id="project-rule-roots"
								name="project_rule_roots"
								className={styles.textArea}
								rows={3}
								value={ruleRoots}
								onChange={(event) => setRuleRoots(event.target.value)}
								placeholder="One path per line"
							/>
						</label>
						<label htmlFor="project-rule-include" className={styles.formField}>
							<span className={styles.formLabel}>Include globs</span>
							<textarea
								id="project-rule-include"
								name="project_rule_include_globs"
								className={styles.textArea}
								rows={3}
								value={ruleIncludes}
								onChange={(event) => setRuleIncludes(event.target.value)}
								placeholder="One glob per line"
							/>
						</label>
						<label htmlFor="project-rule-exclude" className={styles.formField}>
							<span className={styles.formLabel}>Exclude globs</span>
							<textarea
								id="project-rule-exclude"
								name="project_rule_exclude_globs"
								className={styles.textArea}
								rows={3}
								value={ruleExcludes}
								onChange={(event) => setRuleExcludes(event.target.value)}
								placeholder="One glob per line"
							/>
						</label>
						<label htmlFor="project-rule-patterns" className={styles.formField}>
							<span className={styles.formLabel}>Drawing patterns</span>
							<textarea
								id="project-rule-patterns"
								name="project_rule_drawing_patterns"
								className={styles.textArea}
								rows={3}
								value={rulePatterns}
								onChange={(event) => setRulePatterns(event.target.value)}
								placeholder="One drawing pattern per line"
							/>
						</label>
					</div>
				) : (
					<div className={styles.ruleDetails}>
						<div className={styles.ruleSummaryCard}>
							<div className={styles.detailLabel}>Roots</div>
							<div className={styles.detailValue}>
								{toDisplayList(effectiveRule?.roots)}
							</div>
						</div>
						<div className={styles.ruleSummaryCard}>
							<div className={styles.detailLabel}>Include</div>
							<div className={styles.detailValue}>
								{toDisplayList(effectiveRule?.includeGlobs)}
							</div>
						</div>
						<div className={styles.ruleSummaryCard}>
							<div className={styles.detailLabel}>Exclude</div>
							<div className={styles.detailValue}>
								{toDisplayList(effectiveRule?.excludeGlobs)}
							</div>
						</div>
						<div className={styles.ruleSummaryCard}>
							<div className={styles.detailLabel}>Drawing patterns</div>
							<div className={styles.detailValue}>
								{toDisplayList(effectiveRule?.drawingPatterns)}
							</div>
						</div>
						<div className={styles.ruleMeta}>
							Updated{" "}
							{effectiveRule?.updatedAt
								? formatRelativeTime(effectiveRule.updatedAt)
								: "—"}
						</div>
					</div>
				)}
			</section>

			<section className={styles.drawingsPanel}>
				<div className={styles.drawingsHeader}>
					<div>
						<h5 className={styles.ruleTitle}>Tracked drawings</h5>
						<p className={styles.ruleDescription}>
							Same-day returns append under the same drawing journal. Live local
							session time is merged into today immediately.
						</p>
					</div>
					<span className={styles.drawingsCount}>
						{telemetry.trackedDrawings.length} drawing
						{telemetry.trackedDrawings.length === 1 ? "" : "s"}
					</span>
				</div>

				{trackedDrawings.length === 0 ? (
					<div className={styles.emptyState}>
						No tracked drawings have synced for this project yet.
					</div>
				) : (
					<div className={styles.drawingsList}>
						{trackedDrawings.map((drawing) => {
							const expanded = Boolean(expandedDrawings[drawing.drawingPath]);
							return (
								<div key={drawing.drawingPath} className={styles.drawingCard}>
									<button
										type="button"
										className={styles.drawingSummaryButton}
										onClick={() => toggleDrawingExpansion(drawing)}
									>
										<div className={styles.drawingSummaryMain}>
											<div className={styles.drawingToggle}>
												{expanded ? (
													<ChevronDown className={styles.toggleIcon} />
												) : (
													<ChevronRight className={styles.toggleIcon} />
												)}
												<div>
													<div className={styles.drawingTitle}>
														{drawing.drawingName}
													</div>
													<div className={styles.drawingPath}>
														{drawing.drawingPath}
													</div>
												</div>
											</div>
											<div className={styles.drawingSummaryStats}>
												<span>Lifetime {formatDuration(drawing.lifetimeTrackedMs)}</span>
												<span>Today {formatDuration(drawing.todayTrackedMs)}</span>
												<span>{drawing.daysWorkedCount} day(s)</span>
												<span>
													Last worked {formatRelativeTime(drawing.lastWorkedAt)}
												</span>
												{drawing.liveTrackedMs > 0 ? (
													<Badge
														size="sm"
														color={
															drawing.liveStatus === "paused"
																? "warning"
																: "success"
														}
														variant="soft"
													>
														{drawing.liveStatus === "paused" ? "Paused" : "Live"}{" "}
														{formatDuration(drawing.liveTrackedMs)}
													</Badge>
												) : null}
											</div>
										</div>
									</button>

									{expanded ? (
										<div className={styles.drawingGroups}>
											{drawing.dateGroups.map((group) => (
												<div key={`${drawing.drawingPath}:${group.workDate}`} className={styles.dayGroup}>
													<div className={styles.dayGroupHeader}>
														<div>
															<div className={styles.dayGroupTitle}>
																{formatDateLabel(group.workDate)}
															</div>
															<div className={styles.dayGroupMeta}>
																{group.segmentCount} segment
																{group.segmentCount === 1 ? "" : "s"} •{" "}
																{formatDuration(group.trackedMs)} tracked
															</div>
														</div>
														<div className={styles.dayGroupAside}>
															<span>{formatDuration(group.idleMs)} idle</span>
															<span>
																{group.lastWorkedAt
																	? formatRelativeTime(group.lastWorkedAt)
																	: "—"}
															</span>
														</div>
													</div>
													<div className={styles.segmentList}>
														{group.segments.map((segment) => (
															<div key={segment.id} className={styles.segmentRow}>
																<div className={styles.segmentMain}>
																	<div className={styles.segmentTitle}>
																		{segment.isLive
																			? "Live session"
																			: `${formatClockTime(segment.startedAt)} → ${formatClockTime(segment.endedAt)}`}
																	</div>
																	<div className={styles.segmentMeta}>
																		<span>{segment.workstationId}</span>
																		<span>{segment.commandCount} command(s)</span>
																		<span>{formatDuration(segment.idleMs)} idle</span>
																	</div>
																</div>
																<div className={styles.segmentAside}>
																	<Badge
																		color={
																			segment.status === "live"
																				? "primary"
																				: segment.status === "paused"
																					? "warning"
																					: "accent"
																		}
																		variant="soft"
																	>
																		{segment.status}
																	</Badge>
																	<span>{formatDuration(segment.trackedMs)}</span>
																</div>
															</div>
														))}
													</div>
												</div>
											))}
										</div>
									) : null}
								</div>
							);
						})}
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
