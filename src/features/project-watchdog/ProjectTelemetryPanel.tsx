import { Activity, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/primitives/Badge";
import { cn } from "@/lib/utils";
import { basenameFromPath } from "@/lib/watchdogTelemetry";
import { buildWatchdogHref } from "@/lib/watchdogNavigation";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";
import { useProjectTelemetryPanelState } from "./useProjectTelemetryPanelState";
import styles from "./ProjectTelemetryPanel.module.css";

interface ProjectTelemetryPanelProps {
	projectId: string;
	telemetry: ProjectWatchdogTelemetry;
	onRootPathChange?: (rootPath: string | null) => void;
	compact?: boolean;
	embedded?: boolean;
}

function formatRelativeTime(timestamp: number | string | null | undefined): string {
	if (!timestamp) return "-";
	const timeValue =
		typeof timestamp === "string"
			? new Date(timestamp).getTime()
			: Number(timestamp);
	if (!Number.isFinite(timeValue) || timeValue <= 0) return "-";

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

function toDisplayList(values: string[] | undefined): string {
	const list = values ?? [];
	return list.length > 0 ? list.join(", ") : "None";
}

export function ProjectTelemetryPanel({
	projectId,
	telemetry,
	onRootPathChange,
	compact = false,
	embedded = false,
}: ProjectTelemetryPanelProps) {
	const watchdogLink = buildWatchdogHref(projectId);
	const {
		effectiveRule,
		sessionTimeline,
		loggedSessionCount,
		trackedDrawings,
		fallbackSessions,
		ruleSummaryItems,
		rulesExpanded,
		setRulesExpanded,
		editingRules,
		savingRules,
		ruleError,
		ruleRoots,
		setRuleRoots,
		ruleIncludes,
		setRuleIncludes,
		ruleExcludes,
		setRuleExcludes,
		rulePatterns,
		setRulePatterns,
		expandedDrawings,
		startEditingRules,
		cancelEditingRules,
		saveRules,
		toggleDrawingExpansion,
	} = useProjectTelemetryPanelState({
		projectId,
		telemetry,
		onRootPathChange,
	});

	return (
		<section className={cn(styles.root, compact && styles.compactRoot)}>
			{embedded ? (
				<div className={styles.embeddedHeader}>
					<div className={styles.embeddedHeaderCopy}>
						<p className={styles.embeddedEyebrow}>Tracking journals</p>
						<h4 className={styles.embeddedTitle}>Project activity</h4>
					</div>
					<Link to={watchdogLink} className={styles.embeddedLink}>
						<span>Watchdog</span>
						<ArrowRight className={styles.linkIcon} />
					</Link>
				</div>
			) : (
				<div className={cn(styles.header, compact && styles.compactHeader)}>
					<div>
						<div className={styles.headerTitle}>
							<Activity className={styles.headerIcon} />
							<h4>{compact ? "Tracking and journals" : "Project activity"}</h4>
						</div>
						<p className={cn(styles.description, compact && styles.compactDescription)}>
							{compact
								? "Watchdog sessions, shared mapping rules, and drawing journals for this project."
								: "Watchdog sessions, shared project mapping, and drawing-day journals for this project."}
						</p>
					</div>
					<Link to={watchdogLink} className={styles.link}>
						<span>Open Watchdog</span>
						<ArrowRight className={styles.linkIcon} />
					</Link>
				</div>
			)}

			<div className={cn(styles.statsGrid, compact && styles.compactStatsGrid)}>
				<div className={cn(styles.statCard, compact && styles.compactStatCard)}>
					<div className={styles.statLabel}>Active sessions</div>
					<div className={styles.statValue}>
						{telemetry.activeCadSessionCount}
					</div>
				</div>
				<div className={cn(styles.statCard, compact && styles.compactStatCard)}>
					<div className={styles.statLabel}>Last tracker update</div>
					<div className={styles.statValue}>
						{telemetry.latestTrackerUpdatedAt
							? formatRelativeTime(telemetry.latestTrackerUpdatedAt)
							: "-"}
					</div>
				</div>
				<div className={cn(styles.statCard, compact && styles.compactStatCard)}>
					<div className={styles.statLabel}>Drawing journals</div>
					<div className={styles.statValue}>{telemetry.trackedDrawings.length}</div>
				</div>
			</div>

			<section className={styles.timeline}>
				<div className={styles.timelineHeader}>
					<h5 className={styles.timelineTitle}>Recent CAD sessions</h5>
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
									{formatDuration(session.durationMs)} |{" "}
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
			</section>

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
					<>
						<button
							type="button"
							className={styles.ruleSummaryButton}
							onClick={() => setRulesExpanded((current) => !current)}
							aria-expanded={rulesExpanded}
						>
							<div className={styles.ruleSummaryMain}>
								<span className={styles.detailLabel}>Primary root</span>
								<span className={styles.ruleSummaryValue}>
									{effectiveRule?.roots?.[0] ?? "No roots configured"}
								</span>
							</div>
							<div className={styles.ruleSummaryMeta}>
								<span>
									{ruleSummaryItems.length} configured section
									{ruleSummaryItems.length === 1 ? "" : "s"}
								</span>
								<span>
									Updated{" "}
									{effectiveRule?.updatedAt
										? formatRelativeTime(effectiveRule.updatedAt)
										: "-"}
								</span>
								<span>{rulesExpanded ? "Hide details" : "Show details"}</span>
							</div>
						</button>
						{rulesExpanded ? (
							<div className={styles.ruleDetails}>
								{ruleSummaryItems.map((item) => (
									<div key={item.label} className={styles.ruleSummaryCard}>
										<div className={styles.detailLabel}>{item.label}</div>
										<div className={styles.detailValue}>
											{toDisplayList(item.values)}
										</div>
									</div>
								))}
							</div>
						) : null}
					</>
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

				{telemetry.loading ? (
					<div className={styles.emptyState}>Loading project telemetry...</div>
				) : telemetry.error ? (
					<div className={styles.emptyState}>{telemetry.error}</div>
				) : trackedDrawings.length === 0 && fallbackSessions.length > 0 ? (
					<div className={styles.sessionFallback}>
						<p className={styles.sessionFallbackCopy}>
							Drawing journals have not synced yet, but recent AutoCAD sessions
							are already attributed to this project.
						</p>
						<div className={styles.sessionList}>
							{fallbackSessions.map((session) => (
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
					</div>
				) : trackedDrawings.length === 0 ? (
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
																{group.segmentCount === 1 ? "" : "s"} |{" "}
																{formatDuration(group.trackedMs)} tracked
															</div>
														</div>
														<div className={styles.dayGroupAside}>
															<span>{formatDuration(group.idleMs)} idle</span>
															<span>
																{group.lastWorkedAt
																	? formatRelativeTime(group.lastWorkedAt)
																	: "-"}
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
		</section>
	);
}

