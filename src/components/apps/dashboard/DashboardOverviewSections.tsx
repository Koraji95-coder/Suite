import {
	Activity,
	ArrowUpRight,
	ClipboardCheck,
	FileCheck2,
	FolderKanban,
	type LucideIcon,
} from "lucide-react";
import type { RefObject } from "react";
import { TrustStateBadge } from "@/components/apps/ui/TrustStateBadge";
import { Badge } from "@/components/primitives/Badge";
import { Panel } from "@/components/primitives/Panel";
import { Text } from "@/components/primitives/Text";
import type { ActivityLogRow } from "@/services/activityService";
import type {
	WatchdogCollector,
	WatchdogCollectorEvent,
	WatchdogOverviewResponse,
} from "@/services/watchdogService";
import styles from "./DashboardOverviewPanel.module.css";
import { formatDuration, formatRelativeTime } from "./dashboardOverviewFormatters";
import type {
	DashboardLiveAutoCadSessionCard,
	DashboardSessionTimelineRow,
} from "./dashboardWatchdogSelectors";
import type { DashboardProject } from "./useDashboardOverviewData";
import type {
	DashboardDeliveryProjectSummary,
	DashboardDeliverySummaryMetrics,
} from "./useDashboardDeliverySummary";
import { presentWatchdogOperatorFeed } from "@/routes/watchdog/watchdogPresentation";

export interface DashboardOverviewStatCard {
	key: string;
	icon: LucideIcon;
	value: string | number;
	label: string;
}

function formatCalendarDate(value: string | null): string {
	if (!value) {
		return "No deadline";
	}
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}
	return parsed.toLocaleDateString([], {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function DashboardOverviewStatsGrid({
	stats,
}: {
	stats: DashboardOverviewStatCard[];
}) {
	return (
		<section className={styles.statsGrid}>
			{stats.map((item) => {
				const Icon = item.icon;
				return (
					<Panel
						key={item.key}
						variant="support"
						padding="md"
						className={styles.statCard}
					>
						<div className={styles.statIcon}>
							<Icon size={16} />
						</div>
						<div className={styles.statValue}>{item.value}</div>
						<div className={styles.statLabel}>{item.label}</div>
					</Panel>
				);
			})}
		</section>
	);
}

interface DashboardDeliveryBoardSectionProps {
	panelRef: RefObject<HTMLDivElement | null>;
	className: string;
	isLoading: boolean;
	deliveryLoading: boolean;
	deliveryError: string | null;
	deliveryProjects: DashboardDeliveryProjectSummary[];
	deliveryMetrics: DashboardDeliverySummaryMetrics;
	watchdogEventCountByProject: ReadonlyMap<string, number>;
	filteredActivities: ActivityLogRow[];
	handleNavigateToProject: (projectId: string) => void;
}

export function DashboardDeliveryBoardSection({
	panelRef,
	className,
	isLoading,
	deliveryLoading,
	deliveryError,
	deliveryProjects,
	deliveryMetrics,
	watchdogEventCountByProject,
	filteredActivities,
	handleNavigateToProject,
}: DashboardDeliveryBoardSectionProps) {
	return (
		<Panel
			variant="feature"
			padding="lg"
			className={className}
			ref={panelRef}
			data-focus-target="projects"
		>
			<div className={styles.panelHeader}>
				<div>
					<Text size="sm" weight="semibold" block>
						Delivery board
					</Text>
					<Text size="xs" color="muted" block>
						Package readiness, review pressure, and next deadlines for the
						current workspace scope.
					</Text>
				</div>
			</div>

			<div className={styles.deliverySummaryGrid}>
				<div className={styles.deliverySummaryCard}>
					<span className={styles.metaLabel}>Review queue</span>
					<strong>{deliveryMetrics.reviewPressureCount}</strong>
					<p className={styles.deliverySummaryCopy}>
						{deliveryMetrics.reviewProjectCount > 0
							? `${deliveryMetrics.reviewProjectCount} project${deliveryMetrics.reviewProjectCount === 1 ? "" : "s"} still have package blockers.`
							: "No active review blockers are holding the current scope."}
					</p>
				</div>
				<div className={styles.deliverySummaryCard}>
					<span className={styles.metaLabel}>Packages ready</span>
					<strong>{deliveryMetrics.readyCount}</strong>
					<p className={styles.deliverySummaryCopy}>
						{deliveryMetrics.readyCount > 0
							? `${deliveryMetrics.readyCount} package${deliveryMetrics.readyCount === 1 ? "" : "s"} are ready to move into issue.`
							: "No package is fully ready yet."}
					</p>
				</div>
				<div className={styles.deliverySummaryCard}>
					<span className={styles.metaLabel}>Transmittal queue</span>
					<strong>{deliveryMetrics.transmittalQueueCount}</strong>
					<p className={styles.deliverySummaryCopy}>
						{deliveryMetrics.transmittalQueueCount > 0
							? `${deliveryMetrics.transmittalQueueCount} project${deliveryMetrics.transmittalQueueCount === 1 ? "" : "s"} are in transmittal prep or pending review.`
							: "No project is currently waiting in the transmittal queue."}
					</p>
				</div>
				<div className={styles.deliverySummaryCard}>
					<span className={styles.metaLabel}>Near-term dates</span>
					<strong>
						{deliveryMetrics.overdueCount + deliveryMetrics.dueSoonCount}
					</strong>
					<p className={styles.deliverySummaryCopy}>
						{deliveryMetrics.overdueCount > 0
							? `${deliveryMetrics.overdueCount} project${deliveryMetrics.overdueCount === 1 ? "" : "s"} are already overdue.`
							: deliveryMetrics.dueSoonCount > 0
								? `${deliveryMetrics.dueSoonCount} project${deliveryMetrics.dueSoonCount === 1 ? "" : "s"} have deadlines in the next 7 days.`
								: "No project deadlines are pressing in the next 7 days."}
					</p>
				</div>
			</div>

			{deliveryProjects.length === 0 && filteredActivities.length === 0 ? (
				<div className={styles.emptyState}>
					{isLoading || deliveryLoading
						? "Delivery readiness settles here as project scope becomes available."
						: "No project delivery work matched the current scope."}
				</div>
			) : (
				<>
					<div className={styles.sectionBlock}>
						<Text size="xs" color="muted" className={styles.subpanelLabel}>
							Project package readiness
						</Text>
						<div className={styles.rowList}>
							{deliveryProjects.slice(0, 5).map((project) => {
								const watchdogEventCount =
									watchdogEventCountByProject.get(project.projectId) ?? 0;
								return (
									<button
										key={project.projectId}
										type="button"
										className={styles.projectRow}
										onClick={() => handleNavigateToProject(project.projectId)}
									>
										<div className={styles.deliveryRowBody}>
											<div>
												<div className={styles.dataRowTitle}>
													{project.name}
												</div>
												<div className={styles.dataRowMeta}>
													{project.summary}
												</div>
												<div className={styles.deliveryMetaList}>
													{project.issueTag ? (
														<span className={styles.deliveryMetaChip}>
															<FileCheck2 size={12} />
															{project.issueTag}
														</span>
													) : null}
													{project.transmittalNumber ? (
														<span className={styles.deliveryMetaChip}>
															<ClipboardCheck size={12} />
															{project.transmittalNumber}
														</span>
													) : null}
													{watchdogEventCount > 0 ? (
														<span className={styles.deliveryMetaChip}>
															<Activity size={12} />
															{watchdogEventCount} event
															{watchdogEventCount === 1 ? "" : "s"}
														</span>
													) : null}
													{project.selectedDrawingCount > 0 ? (
														<span className={styles.deliveryMetaChip}>
															<FolderKanban size={12} />
															{project.selectedDrawingCount} drawing
															{project.selectedDrawingCount === 1 ? "" : "s"}
														</span>
													) : null}
												</div>
											</div>
											<div className={styles.deliveryRowStatus}>
												<TrustStateBadge
													state={project.state}
													label={project.stateLabel}
													size="sm"
													variant="outline"
												/>
												<div className={styles.projectRowAside}>
													{project.deadline ? (
														<span>{formatCalendarDate(project.deadline)}</span>
													) : project.nextDue ? (
														<span>
															{formatCalendarDate(project.nextDue.date)}
														</span>
													) : (
														<span>No deadline</span>
													)}
													<ArrowUpRight size={14} />
												</div>
											</div>
										</div>
										<div className={styles.deliveryRowFootnote}>
											<span>{project.detail}</span>
										</div>
									</button>
								);
							})}
						</div>
					</div>

					<div className={styles.sectionBlock}>
						<div className={styles.deliverySectionHeader}>
							<Text size="xs" color="muted" className={styles.subpanelLabel}>
								Recent delivery activity
							</Text>
							{deliveryError ? (
								<Badge color="warning" variant="soft">
									Partial data
								</Badge>
							) : null}
						</div>
						<div className={styles.rowList}>
							{filteredActivities.length === 0 ? (
								<div className={styles.emptyStateCompact}>
									Recent delivery activity appears here when project work is
									recorded in the selected scope.
								</div>
							) : (
								filteredActivities.slice(0, 6).map((activity) => (
									<div key={activity.id} className={styles.dataRow}>
										<div>
											<div className={styles.dataRowTitle}>
												{activity.description}
											</div>
											<div className={styles.dataRowMeta}>
												{formatRelativeTime(activity.timestamp)}
											</div>
										</div>
										<div className={styles.dataRowAside}>
											{activity.project_id ? "Project linked" : "Workspace"}
										</div>
									</div>
								))
							)}
						</div>
					</div>
				</>
			)}
		</Panel>
	);
}

interface DashboardWatchdogSectionProps {
	panelRef: RefObject<HTMLDivElement | null>;
	className: string;
	watchdogError: string | null;
	selectedProject: DashboardProject | null;
	selectedWindowLabel: string;
	activeCadSessionCount: number;
	liveSessionCards: DashboardLiveAutoCadSessionCard[];
	watchdogOverview: WatchdogOverviewResponse | null;
	trendMax: number;
	watchdogEvents: WatchdogCollectorEvent[];
	visibleCollectors: WatchdogCollector[];
	sessionTimelineRows: DashboardSessionTimelineRow[];
	selectedProjectId: string;
	selectedCollectorId: string;
	telemetryHotspotProjects: Array<{ projectId: string; eventCount: number }>;
	allProjectsMap: ReadonlyMap<string, DashboardProject>;
	updateFilter: (key: string, value: string) => void;
	updateFilters: (updates: Record<string, string>) => void;
}

export function DashboardWatchdogSection({
	panelRef,
	className,
	watchdogError,
	selectedProject,
	selectedWindowLabel,
	activeCadSessionCount,
	liveSessionCards,
	watchdogOverview,
	trendMax,
	watchdogEvents,
	visibleCollectors,
	sessionTimelineRows,
	selectedProjectId,
	selectedCollectorId,
	telemetryHotspotProjects,
	allProjectsMap,
	updateFilter,
	updateFilters,
}: DashboardWatchdogSectionProps) {
	const watchdogProjectNameMap = new Map(
		Array.from(allProjectsMap.entries()).map(([projectId, project]) => [
			projectId,
			{ name: project.name },
		]),
	);
	const watchdogActivityRows = presentWatchdogOperatorFeed(
		watchdogEvents,
		watchdogProjectNameMap,
	).slice(0, 8);
	const onlineCollectors = visibleCollectors.filter(
		(collector) => collector.status === "online",
	).length;
	const hasTrendData = (watchdogOverview?.trendBuckets ?? []).some(
		(bucket) => bucket.eventCount > 0,
	);
	const showRecentActivityPanel = watchdogActivityRows.length > 0;
	const showCollectorsPanel = visibleCollectors.length > 0;
	const showTimelinePanel = sessionTimelineRows.length > 0;
	const showProjectActivityPanel = telemetryHotspotProjects.length > 0;
	const showWatchdogDetailPanels =
		showRecentActivityPanel ||
		showCollectorsPanel ||
		showTimelinePanel ||
		showProjectActivityPanel;

	return (
		<Panel
			variant="feature"
			padding="lg"
			className={className}
			ref={panelRef}
			data-focus-target="watchdog"
		>
			<div className={styles.panelHeader}>
				<div>
					<Text size="sm" weight="semibold" block>
						Watchdog summary
					</Text>
					<Text size="xs" color="muted" block>
						Drawing activity, tracker health, and recent CAD sessions in the
						current scope.
					</Text>
				</div>
			</div>

			{watchdogError ? (
				<div className={styles.emptyState}>{watchdogError}</div>
			) : (
				<>
					<div className={styles.watchdogMeta}>
						<div>
							<span className={styles.metaLabel}>Project</span>
							<strong>{selectedProject?.name || "All projects"}</strong>
						</div>
						<div>
							<span className={styles.metaLabel}>Time range</span>
							<strong>{selectedWindowLabel}</strong>
						</div>
						<div>
							<span className={styles.metaLabel}>CAD trackers online</span>
							<strong>
								{onlineCollectors}/{visibleCollectors.length}
							</strong>
						</div>
						<div>
							<span className={styles.metaLabel}>Live sessions</span>
							<strong>{activeCadSessionCount}</strong>
						</div>
					</div>

					<div className={styles.sectionBlock}>
						<Text size="xs" color="muted" className={styles.subpanelLabel}>
							Live CAD sessions
						</Text>
						<div className={styles.sessionGrid}>
							{liveSessionCards.length === 0 ? (
								<div className={styles.emptyStateCompact}>
									No live CAD sessions matched the current scope.
								</div>
							) : (
								liveSessionCards.slice(0, 4).map((card) => {
									const { session } = card;
									return (
										<div key={session.sessionId} className={styles.sessionCard}>
											<div className={styles.sessionCardHead}>
												<div>
													<div className={styles.dataRowTitle}>
														{card.collectorName}
													</div>
													<div className={styles.dataRowMeta}>
														{session.workstationId} • {session.collectorType}
													</div>
												</div>
												<div className={styles.sessionBadges}>
													<Badge
														color={card.collectorStatusTone}
														variant="soft"
													>
														{card.collectorStatus}
													</Badge>
													<Badge color={card.trackingTone} variant="soft">
														{card.trackingLabel}
													</Badge>
												</div>
											</div>
											<div className={styles.sessionDrawing}>
												{card.drawingLabel}
											</div>
											<div className={styles.sessionMeta}>
												<span>
													Started {formatRelativeTime(session.startedAt)}
												</span>
												<span>
													Tracker {formatRelativeTime(card.trackerAt)}
												</span>
												{session.lastActivityAt ? (
													<span>
														Activity{" "}
														{formatRelativeTime(session.lastActivityAt)}
													</span>
												) : null}
												<span>{formatDuration(session.durationMs)}</span>
												<span>{session.commandCount} command(s)</span>
											</div>
										</div>
									);
								})
							)}
						</div>
					</div>

					{hasTrendData ? (
						<div className={styles.trendChart}>
							{(watchdogOverview?.trendBuckets ?? []).map((bucket) => (
								<div key={bucket.bucketStartMs} className={styles.trendBarWrap}>
									<div
										className={styles.trendBar}
										style={{
											height: `${Math.max(10, (bucket.eventCount / trendMax) * 100)}%`,
										}}
									/>
								</div>
							))}
						</div>
					) : null}

					{showWatchdogDetailPanels ? (
						<div className={styles.watchdogSubgrid}>
							{showRecentActivityPanel ? (
								<div
									className={`${styles.subpanel} ${styles.watchdogActivityPanel}`}
								>
									<Text size="xs" color="muted" className={styles.subpanelLabel}>
										Recent activity
									</Text>
									<div className={styles.rowList}>
										{watchdogActivityRows.map((event) => (
											<div key={event.eventId} className={styles.dataRow}>
												<div>
													<div className={styles.dataRowTitle}>
														{event.label}
													</div>
													<div className={styles.dataRowMeta}>
														{event.detail}
													</div>
													<div className={styles.dataRowMeta}>
														{event.context}
													</div>
												</div>
												<div className={styles.dataRowAside}>
													<span>{formatRelativeTime(event.timestamp)}</span>
												</div>
											</div>
										))}
									</div>
								</div>
							) : null}

							{showCollectorsPanel ? (
								<div
									className={`${styles.subpanel} ${styles.watchdogCoveragePanel}`}
								>
									<Text size="xs" color="muted" className={styles.subpanelLabel}>
										Tracker status
									</Text>
									<div className={styles.rowList}>
										{visibleCollectors.slice(0, 6).map((collector) => (
											<div key={collector.collectorId} className={styles.dataRow}>
												<div>
													<div className={styles.dataRowTitle}>
														{collector.name}
													</div>
													<div className={styles.dataRowMeta}>
														{collector.workstationId} • {collector.collectorType}
													</div>
												</div>
												<div className={styles.dataRowAside}>
													<Badge
														color={
															collector.status === "online"
																? "success"
																: "warning"
														}
														variant="soft"
													>
														{collector.status}
													</Badge>
												</div>
											</div>
										))}
									</div>
								</div>
							) : null}

							{showTimelinePanel ? (
								<div
									className={`${styles.subpanel} ${styles.watchdogTimelinePanel}`}
								>
									<Text size="xs" color="muted" className={styles.subpanelLabel}>
										Session timeline
									</Text>
									<div className={styles.sessionTimeline}>
										{sessionTimelineRows.map((row) => {
											const { session } = row;
											const canDrillProject = Boolean(
												session.projectId &&
													session.projectId !== selectedProjectId,
											);
											const canDrillCollector =
												selectedCollectorId !== session.collectorId;
											const sessionStatusClass =
												session.status === "live"
													? styles.sessionTimelineBarLive
													: session.status === "paused"
														? styles.sessionTimelineBarPaused
														: styles.sessionTimelineBarCompleted;
											return (
												<div
													key={session.sessionId}
													className={styles.sessionTimelineRow}
												>
													<div className={styles.sessionTimelineHeader}>
														<div className={styles.sessionTimelineHeading}>
															<span className={styles.sessionSequenceBadge}>
																Seq {row.sequence}
															</span>
															<div>
																<div className={styles.dataRowTitle}>
																	{row.drawingLabel}
																</div>
																<div className={styles.dataRowMeta}>
																	{row.collectorName} •{" "}
																	{row.projectName || "Unassigned"}
																</div>
															</div>
														</div>
														<div className={styles.sessionTimelineActions}>
															<Badge color={row.statusTone} variant="soft">
																{session.status}
															</Badge>
															{canDrillProject && session.projectId ? (
																<button
																	type="button"
																	className={styles.sessionActionButton}
																	onClick={() =>
																		updateFilters({
																			project: session.projectId || "",
																			focus: "watchdog",
																		})
																	}
																>
																	Project
																</button>
															) : null}
															{canDrillCollector ? (
																<button
																	type="button"
																	className={styles.sessionActionButton}
																	onClick={() =>
																		updateFilters({
																			collector: session.collectorId,
																			focus: "watchdog",
																		})
																	}
																>
																	Collector
																</button>
															) : null}
														</div>
													</div>
													<div className={styles.sessionTimelineTrack}>
														<div
															className={`${styles.sessionTimelineBar} ${sessionStatusClass}`}
															style={{
																left: `${row.leftPercent}%`,
																width: `${row.widthPercent}%`,
															}}
														/>
													</div>
													<div className={styles.sessionTimelineMeta}>
														<span>
															Started {formatRelativeTime(session.startedAt)}
														</span>
														<span>
															Activity{" "}
															{formatRelativeTime(
																session.lastActivityAt || session.latestEventAt,
															)}
														</span>
														<span>{formatDuration(session.durationMs)}</span>
														<span>{session.commandCount} command(s)</span>
														<span>
															Tracker {formatRelativeTime(row.trackerAt)}
														</span>
													</div>
												</div>
											);
										})}
									</div>
								</div>
							) : null}

							{showProjectActivityPanel ? (
								<div
									className={`${styles.subpanel} ${styles.watchdogProjectPanel}`}
								>
									<Text size="xs" color="muted" className={styles.subpanelLabel}>
										Project rollup
									</Text>
									<div className={styles.rowList}>
										{telemetryHotspotProjects.map((entry) => (
											<button
												key={entry.projectId}
												type="button"
												className={styles.projectRow}
												onClick={() => updateFilter("project", entry.projectId)}
											>
												<div>
													<div className={styles.dataRowTitle}>
														{allProjectsMap.get(entry.projectId)?.name ||
															entry.projectId}
													</div>
													<div className={styles.dataRowMeta}>
														Recent tracked drawing activity in this scope
													</div>
												</div>
												<div className={styles.projectRowAside}>
													<span>{entry.eventCount} event(s)</span>
													<ArrowUpRight size={14} />
												</div>
											</button>
										))}
									</div>
								</div>
							) : null}
						</div>
					) : (
						<div className={styles.emptyStateCompact}>
							Tracked drawing activity appears here once Watchdog sees project
							work in the selected scope.
						</div>
					)}
				</>
			)}
		</Panel>
	);
}
