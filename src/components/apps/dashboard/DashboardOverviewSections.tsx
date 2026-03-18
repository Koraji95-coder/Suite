import {
	Activity,
	ArrowUpRight,
	BrainCircuit,
	FolderKanban,
	GitBranch,
	HardDrive,
	Radar,
	ShieldCheck,
} from "lucide-react";
import type { RefObject } from "react";
import { AgentPixelMark } from "@/components/agent/AgentPixelMark";
import type { AgentProfileId } from "@/components/agent/agentProfiles";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { Text } from "@/components/primitives/Text";
import type {
	ArchitectureDomain,
	ArchitectureFixCandidate,
} from "@/data/architectureModel";
import type { Memory } from "@/lib/agent-memory/types";
import {
	basenameFromPath,
	summarizeWatchdogTarget,
} from "@/lib/watchdogTelemetry";
import type { ActivityLogRow } from "@/services/activityService";
import type { WorkLedgerRow } from "@/services/workLedgerService";
import type {
	WatchdogCollector,
	WatchdogCollectorEvent,
	WatchdogOverviewResponse,
	WatchdogSessionSummary,
} from "@/services/watchdogService";
import type { DashboardProject, DashboardTaskCount } from "./useDashboardOverviewData";
import type {
	DashboardLiveAutoCadSessionCard,
	DashboardSessionTimelineRow,
} from "./dashboardWatchdogSelectors";
import type { DashboardWorkLedgerViewModel } from "./dashboardWorkLedgerSelectors";
import {
	formatBytes,
	formatDuration,
	formatRelativeTime,
} from "./dashboardOverviewFormatters";
import styles from "./DashboardOverviewPanel.module.css";

function formatGeneratedAt(value: string): string {
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) {
		return "Unknown";
	}
	return new Date(timestamp).toLocaleString([], {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

interface DashboardOverviewStatsGridProps {
	projectsCount: number;
	openTasks: number;
	collectorsOnline: number;
	eventsInWindow: number;
	memoryCount: number;
	storageUsed: number;
}

export function DashboardOverviewStatsGrid({
	projectsCount,
	openTasks,
	collectorsOnline,
	eventsInWindow,
	memoryCount,
	storageUsed,
}: DashboardOverviewStatsGridProps) {
	return (
		<section className={styles.statsGrid}>
			<Panel variant="default" padding="md" className={styles.statCard}>
				<div className={styles.statIcon}>
					<FolderKanban size={16} />
				</div>
				<div className={styles.statValue}>{projectsCount}</div>
				<div className={styles.statLabel}>Active projects</div>
			</Panel>
			<Panel variant="default" padding="md" className={styles.statCard}>
				<div className={styles.statIcon}>
					<ShieldCheck size={16} />
				</div>
				<div className={styles.statValue}>{openTasks}</div>
				<div className={styles.statLabel}>Open tasks</div>
			</Panel>
			<Panel variant="default" padding="md" className={styles.statCard}>
				<div className={styles.statIcon}>
					<Radar size={16} />
				</div>
				<div className={styles.statValue}>{collectorsOnline}</div>
				<div className={styles.statLabel}>Collectors online</div>
			</Panel>
			<Panel variant="default" padding="md" className={styles.statCard}>
				<div className={styles.statIcon}>
					<Activity size={16} />
				</div>
				<div className={styles.statValue}>{eventsInWindow}</div>
				<div className={styles.statLabel}>Events in window</div>
			</Panel>
			<Panel variant="default" padding="md" className={styles.statCard}>
				<div className={styles.statIcon}>
					<BrainCircuit size={16} />
				</div>
				<div className={styles.statValue}>{memoryCount}</div>
				<div className={styles.statLabel}>Memory notes</div>
			</Panel>
			<Panel variant="default" padding="md" className={styles.statCard}>
				<div className={styles.statIcon}>
					<HardDrive size={16} />
				</div>
				<div className={styles.statValue}>{formatBytes(storageUsed)}</div>
				<div className={styles.statLabel}>Tracked storage</div>
			</Panel>
		</section>
	);
}

interface DashboardWatchdogSectionProps {
	panelRef: RefObject<HTMLDivElement | null>;
	className: string;
	telemetryLoading: boolean;
	watchdogError: string | null;
	selectedProject: DashboardProject | null;
	selectedWindowLabel: string;
	overdueProjects: number;
	activeCadSessionCount: number;
	liveSessionCards: DashboardLiveAutoCadSessionCard[];
	watchdogOverview: WatchdogOverviewResponse | null;
	trendMax: number;
	watchdogEvents: WatchdogCollectorEvent[];
	visibleCollectors: WatchdogCollector[];
	sessionTimelineRows: DashboardSessionTimelineRow[];
	selectedProjectId: string;
	selectedCollectorId: string;
	watchdogSessions: WatchdogSessionSummary[];
	telemetryHotspotProjects: Array<{ projectId: string; eventCount: number }>;
	allProjectsMap: ReadonlyMap<string, DashboardProject>;
	updateFilter: (key: string, value: string) => void;
	updateFilters: (updates: Record<string, string>) => void;
}

export function DashboardWatchdogSection({
	panelRef,
	className,
	telemetryLoading,
	watchdogError,
	selectedProject,
	selectedWindowLabel,
	overdueProjects,
	activeCadSessionCount,
	liveSessionCards,
	watchdogOverview,
	trendMax,
	watchdogEvents,
	visibleCollectors,
	sessionTimelineRows,
	selectedProjectId,
	selectedCollectorId,
	watchdogSessions,
	telemetryHotspotProjects,
	allProjectsMap,
	updateFilter,
	updateFilters,
}: DashboardWatchdogSectionProps) {
	return (
		<Panel
			variant="default"
			padding="lg"
			className={className}
			ref={panelRef}
			data-focus-target="watchdog"
		>
			<div className={styles.panelHeader}>
				<div>
					<Text size="sm" weight="semibold">
						Operations and Watchdog
					</Text>
					<Text size="xs" color="muted">
						Collector health, recent file activity, and telemetry trends.
					</Text>
				</div>
				{telemetryLoading && (
					<Badge color="warning" variant="soft">
						Loading
					</Badge>
				)}
			</div>

			{watchdogError ? (
				<div className={styles.emptyState}>{watchdogError}</div>
			) : (
				<>
					<div className={styles.watchdogMeta}>
						<div>
							<span className={styles.metaLabel}>Project focus</span>
							<strong>{selectedProject?.name || "All projects"}</strong>
						</div>
						<div>
							<span className={styles.metaLabel}>Time range</span>
							<strong>{selectedWindowLabel}</strong>
						</div>
						<div>
							<span className={styles.metaLabel}>Overdue projects</span>
							<strong>{overdueProjects}</strong>
						</div>
						<div>
							<span className={styles.metaLabel}>Live CAD sessions</span>
							<strong>{activeCadSessionCount}</strong>
						</div>
					</div>

					<div className={styles.sectionBlock}>
						<Text size="xs" color="muted" className={styles.subpanelLabel}>
							Live AutoCAD sessions
						</Text>
						<div className={styles.sessionGrid}>
							{liveSessionCards.length === 0 ? (
								<div className={styles.emptyStateCompact}>
									No live AutoCAD sessions matched the current filters.
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
													<Badge color={card.collectorStatusTone} variant="soft">
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
														Activity {formatRelativeTime(session.lastActivityAt)}
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

					<div className={styles.panelSubgrid}>
						<div className={styles.subpanel}>
							<Text size="xs" color="muted" className={styles.subpanelLabel}>
								Recent events
							</Text>
							<div className={styles.rowList}>
								{watchdogEvents.length === 0 ? (
									<div className={styles.emptyStateCompact}>
										No collector events in the selected window.
									</div>
								) : (
									watchdogEvents.map((event) => (
										<div key={event.eventId} className={styles.dataRow}>
											<div>
												<div className={styles.dataRowTitle}>
													{event.eventType}
												</div>
												<div className={styles.dataRowMeta}>
													{summarizeWatchdogTarget(event)}
												</div>
											</div>
											<div className={styles.dataRowAside}>
												<span>{formatRelativeTime(event.timestamp)}</span>
											</div>
										</div>
									))
								)}
							</div>
						</div>

						<div className={styles.subpanel}>
							<Text size="xs" color="muted" className={styles.subpanelLabel}>
								Collectors
							</Text>
							<div className={styles.rowList}>
								{visibleCollectors.length === 0 ? (
									<div className={styles.emptyStateCompact}>
										No collectors registered yet.
									</div>
								) : (
									visibleCollectors.slice(0, 6).map((collector) => (
										<div key={collector.collectorId} className={styles.dataRow}>
											<div>
												<div className={styles.dataRowTitle}>{collector.name}</div>
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
									))
								)}
							</div>
						</div>

						<div className={styles.subpanel}>
							<Text size="xs" color="muted" className={styles.subpanelLabel}>
								Session timeline
							</Text>
							<div className={styles.sessionTimeline}>
								{sessionTimelineRows.length === 0 ? (
									<div className={styles.emptyStateCompact}>
										No session timeline data in the selected window.
									</div>
								) : (
									sessionTimelineRows.map((row) => {
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
									})
								)}
							</div>
						</div>

						<div className={styles.subpanel}>
							<Text size="xs" color="muted" className={styles.subpanelLabel}>
								Recent CAD sessions
							</Text>
							<div className={styles.rowList}>
								{watchdogSessions.length === 0 ? (
									<div className={styles.emptyStateCompact}>
										No AutoCAD sessions were summarized in the selected window.
									</div>
								) : (
									watchdogSessions.slice(0, 6).map((session) => (
										<div key={session.sessionId} className={styles.dataRow}>
											<div>
												<div className={styles.dataRowTitle}>
													{basenameFromPath(session.drawingPath)}
												</div>
												<div className={styles.dataRowMeta}>
													{session.workstationId} • {session.commandCount} command(s)
													{" • "}
													{session.lastEventType || session.status}
												</div>
											</div>
											<div className={styles.dataRowAside}>
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
												<span>{formatDuration(session.durationMs)}</span>
											</div>
										</div>
									))
								)}
							</div>
						</div>

						<div className={styles.subpanel}>
							<Text size="xs" color="muted" className={styles.subpanelLabel}>
								High-activity projects
							</Text>
							<div className={styles.rowList}>
								{telemetryHotspotProjects.length === 0 ? (
									<div className={styles.emptyStateCompact}>
										No project attribution has been recorded yet.
									</div>
								) : (
									telemetryHotspotProjects.map((entry) => (
										<button
											key={entry.projectId}
											type="button"
											className={styles.projectRow}
											onClick={() => updateFilter("project", entry.projectId)}
										>
											<div>
												<div className={styles.dataRowTitle}>
													{allProjectsMap.get(entry.projectId)?.name || entry.projectId}
												</div>
												<div className={styles.dataRowMeta}>{entry.projectId}</div>
											</div>
											<div className={styles.projectRowAside}>
												<span>{entry.eventCount} event(s)</span>
												<ArrowUpRight size={14} />
											</div>
										</button>
									))
								)}
							</div>
						</div>
					</div>
				</>
			)}
		</Panel>
	);
}

interface DashboardArchitectureSectionProps {
	panelRef: RefObject<HTMLDivElement | null>;
	className: string;
	filteredDomains: ArchitectureDomain[];
	filteredHotspots: Array<{ path: string; lines: number }>;
	filteredFixCandidates: ArchitectureFixCandidate[];
	includeAdvancedModules: boolean;
	snapshotGeneratedAt: string;
	onDeepDive: () => void;
	onToggleAdvancedModules: () => void;
}

export function DashboardArchitectureSection({
	panelRef,
	className,
	filteredDomains,
	filteredHotspots,
	filteredFixCandidates,
	includeAdvancedModules,
	snapshotGeneratedAt,
	onDeepDive,
	onToggleAdvancedModules,
}: DashboardArchitectureSectionProps) {
	return (
		<Panel
			variant="default"
			padding="lg"
			className={className}
			ref={panelRef}
			data-focus-target="architecture"
		>
			<div className={styles.panelHeader}>
				<div>
					<Text size="sm" weight="semibold">
						Repository Architecture
					</Text>
					<Text size="xs" color="muted">
						Hotspots, domains, and generated checkpoint candidates from the latest repo scan.
					</Text>
				</div>
				<div className={styles.architectureActions}>
					<button
						type="button"
						className={styles.sessionActionButton}
						onClick={onToggleAdvancedModules}
					>
						{includeAdvancedModules
							? "Hide external modules"
							: "Include external modules"}
					</button>
					<Button
						variant="ghost"
						size="sm"
						onClick={onDeepDive}
						iconRight={<ArrowUpRight size={14} />}
					>
						Deep dive
					</Button>
				</div>
			</div>

			<div className={styles.architectureSummary}>
				<Badge color="accent" variant="soft" size="sm">
					Generated {formatGeneratedAt(snapshotGeneratedAt)}
				</Badge>
				<Badge color="default" variant="outline" size="sm">
					{includeAdvancedModules
						? "Advanced modules included"
						: "Advanced modules hidden"}
				</Badge>
			</div>

			<div className={styles.domainGrid}>
				{filteredDomains.slice(0, 4).map((domain) => (
					<div key={domain.id} className={styles.domainCard}>
						<div className={styles.domainTitle}>{domain.label}</div>
						<div className={styles.domainSummary}>{domain.summary}</div>
						<div className={styles.domainMeta}>{domain.repoRoots[0]}</div>
					</div>
				))}
			</div>

			<div className={styles.sectionBlock}>
				<Text size="xs" color="muted" className={styles.subpanelLabel}>
					Largest hotspots
				</Text>
				<div className={styles.rowList}>
					{filteredHotspots.length === 0 ? (
						<div className={styles.emptyStateCompact}>
							No hotspots matched the current filters.
						</div>
					) : (
						filteredHotspots.map((hotspot) => (
							<div key={hotspot.path} className={styles.dataRow}>
								<div>
									<div className={styles.dataRowTitle}>{hotspot.path}</div>
									<div className={styles.dataRowMeta}>
										{hotspot.lines.toLocaleString()} lines
									</div>
								</div>
								<div className={styles.dataRowAside}>
									<GitBranch size={14} />
								</div>
							</div>
						))
					)}
				</div>
			</div>

			<div className={styles.sectionBlock}>
				<Text size="xs" color="muted" className={styles.subpanelLabel}>
					Generated checkpoint candidates
				</Text>
				<div className={styles.rowList}>
					{filteredFixCandidates.map((candidate) => (
						<div key={candidate.id} className={styles.dataRow}>
							<div>
								<div className={styles.dataRowTitle}>{candidate.title}</div>
								<div className={styles.dataRowMeta}>{candidate.detail}</div>
							</div>
							<div className={styles.dataRowAside}>
								<Badge
									color={candidate.priority === "high" ? "danger" : "accent"}
									variant="soft"
								>
									{candidate.priority}
								</Badge>
							</div>
						</div>
					))}
				</div>
			</div>
		</Panel>
	);
}

interface DashboardWorkLedgerSectionProps {
	panelRef: RefObject<HTMLDivElement | null>;
	className: string;
	entries: WorkLedgerRow[];
	viewModel: DashboardWorkLedgerViewModel;
	error: string | null;
	onOpenChangelog: () => void;
	onOpenLatestReceipt: (entry: WorkLedgerRow) => void;
	onOpenHotspotEntry: (entry: WorkLedgerRow) => void;
}

export function DashboardWorkLedgerSection({
	panelRef,
	className,
	entries,
	viewModel,
	error,
	onOpenChangelog,
	onOpenLatestReceipt,
	onOpenHotspotEntry,
}: DashboardWorkLedgerSectionProps) {
	return (
		<Panel
			variant="default"
			padding="lg"
			className={className}
			ref={panelRef}
			data-focus-target="ledger"
		>
			<div className={styles.panelHeader}>
				<div>
					<Text size="sm" weight="semibold">
						Work Ledger
					</Text>
					<Text size="xs" color="muted">
						Private roadmap plus changelog milestones linked to repo areas and publish receipts.
					</Text>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={onOpenChangelog}
					iconRight={<ArrowUpRight size={14} />}
				>
					Open ledger
				</Button>
			</div>

			{error ? (
				<div className={styles.emptyState}>{error}</div>
			) : (
				<div className={styles.sectionBlock}>
					<div className={styles.ledgerSummaryRow}>
						<div className={styles.ledgerReadinessCard}>
							<div className={styles.ledgerReadinessHeader}>
								<Text size="xs" color="muted" className={styles.subpanelLabel}>
									Publisher readiness
								</Text>
								<Badge color={viewModel.readinessTone} variant="soft">
									{viewModel.readinessLabel}
								</Badge>
							</div>
							<div className={styles.ledgerReadinessDetail}>
								{viewModel.readinessDetail}
							</div>
						</div>
					<div className={styles.ledgerKpiGrid}>
						<div className={styles.ledgerKpiCard}>
							<div className={styles.ledgerKpiValue}>
								{viewModel.plannedCount}
							</div>
							<div className={styles.ledgerKpiLabel}>Planned</div>
						</div>
						<div className={styles.ledgerKpiCard}>
							<div className={styles.ledgerKpiValue}>
								{viewModel.activeCount}
							</div>
							<div className={styles.ledgerKpiLabel}>In progress</div>
						</div>
						<div className={styles.ledgerKpiCard}>
							<div className={styles.ledgerKpiValue}>
								{viewModel.completedCount}
							</div>
							<div className={styles.ledgerKpiLabel}>Completed</div>
						</div>
						<div className={styles.ledgerKpiCard}>
							<div className={styles.ledgerKpiValue}>
								{viewModel.archivedCount}
							</div>
							<div className={styles.ledgerKpiLabel}>Archived</div>
						</div>
						<div className={styles.ledgerKpiCard}>
							<div className={styles.ledgerKpiValue}>{viewModel.readyCount}</div>
							<div className={styles.ledgerKpiLabel}>Ready</div>
						</div>
							<div className={styles.ledgerKpiCard}>
								<div className={styles.ledgerKpiValue}>
									{viewModel.publishedCount}
								</div>
								<div className={styles.ledgerKpiLabel}>Published</div>
							</div>
							<div className={styles.ledgerKpiCard}>
								<div className={styles.ledgerKpiValue}>
									{viewModel.blockerCount}
								</div>
								<div className={styles.ledgerKpiLabel}>Blockers</div>
							</div>
							<div className={styles.ledgerKpiCard}>
								<div className={styles.ledgerKpiValue}>
									{viewModel.hotspotLinkedCount}
								</div>
								<div className={styles.ledgerKpiLabel}>Hotspot links</div>
							</div>
						</div>
					</div>

					<div className={styles.sectionBlock}>
						<Text size="xs" color="muted" className={styles.subpanelLabel}>
							Latest milestones
						</Text>
						<div className={styles.rowList}>
							{viewModel.latestReadyEntry ? (
								<div className={styles.dataRow}>
									<div>
										<div className={styles.dataRowTitle}>
											Ready: {viewModel.latestReadyEntry.title}
										</div>
										<div className={styles.dataRowMeta}>
											{viewModel.latestReadyEntry.summary}
										</div>
									</div>
									<div className={styles.dataRowAside}>
										<Badge color="accent" variant="soft">
											ready
										</Badge>
										<button
											type="button"
											className={styles.sessionActionButton}
											onClick={() =>
												onOpenHotspotEntry(viewModel.latestReadyEntry!)
											}
										>
											Open entry
										</button>
									</div>
								</div>
							) : null}
							{viewModel.latestActiveEntry ? (
								<div className={styles.dataRow}>
									<div>
										<div className={styles.dataRowTitle}>
											In progress: {viewModel.latestActiveEntry.title}
										</div>
										<div className={styles.dataRowMeta}>
											{viewModel.latestActiveEntry.summary}
										</div>
									</div>
									<div className={styles.dataRowAside}>
										<Badge color="primary" variant="soft">
											active
										</Badge>
										<button
											type="button"
											className={styles.sessionActionButton}
											onClick={() =>
												onOpenHotspotEntry(viewModel.latestActiveEntry!)
											}
										>
											Open entry
										</button>
									</div>
								</div>
							) : null}
							{viewModel.latestCompletedEntry ? (
								<div className={styles.dataRow}>
									<div>
										<div className={styles.dataRowTitle}>
											Completed: {viewModel.latestCompletedEntry.title}
										</div>
										<div className={styles.dataRowMeta}>
											{viewModel.latestCompletedEntry.summary}
										</div>
									</div>
									<div className={styles.dataRowAside}>
										<Badge color="success" variant="soft">
											completed
										</Badge>
										<button
											type="button"
											className={styles.sessionActionButton}
											onClick={() =>
												onOpenHotspotEntry(viewModel.latestCompletedEntry!)
											}
										>
											Open entry
										</button>
									</div>
								</div>
							) : null}
							{viewModel.latestPublishedEntry ? (
								<div className={styles.dataRow}>
									<div>
										<div className={styles.dataRowTitle}>
											Published: {viewModel.latestPublishedEntry.title}
										</div>
										<div className={styles.dataRowMeta}>
											{viewModel.latestPublishedEntry.summary}
										</div>
									</div>
									<div className={styles.dataRowAside}>
										<Badge color="success" variant="soft">
											published
										</Badge>
										<button
											type="button"
											className={styles.sessionActionButton}
											onClick={() =>
												onOpenLatestReceipt(viewModel.latestPublishedEntry!)
											}
										>
											Open latest receipt
										</button>
									</div>
								</div>
							) : null}
							{!viewModel.latestReadyEntry &&
							!viewModel.latestActiveEntry &&
							!viewModel.latestCompletedEntry &&
							!viewModel.latestPublishedEntry ? (
								<div className={styles.emptyStateCompact}>
									No roadmap or changelog milestones matched the current filters.
								</div>
							) : null}
						</div>
					</div>

					{viewModel.latestSuccessfulReceipt ? (
						<div className={styles.sectionBlock}>
							<Text size="xs" color="muted" className={styles.subpanelLabel}>
								Latest receipt
							</Text>
							<div className={styles.dataRow}>
								<div>
									<div className={styles.dataRowTitle}>
										{viewModel.latestSuccessfulReceipt.entry.title}
									</div>
									<div className={styles.dataRowMeta}>
										{viewModel.latestSuccessfulReceipt.job.external_reference ||
											viewModel.latestSuccessfulReceipt.job.artifact_dir ||
											"Successful publish receipt"}
									</div>
								</div>
								<div className={styles.dataRowAside}>
									<Badge color="success" variant="soft">
										succeeded
									</Badge>
									<button
										type="button"
										className={styles.sessionActionButton}
										onClick={() =>
											onOpenLatestReceipt(
												viewModel.latestSuccessfulReceipt!.entry,
											)
										}
									>
										Open latest receipt
									</button>
								</div>
							</div>
						</div>
					) : null}

					{viewModel.latestFailedReceipt ? (
						<div className={styles.sectionBlock}>
							<Text size="xs" color="muted" className={styles.subpanelLabel}>
								Latest blocker
							</Text>
							<div className={styles.dataRow}>
								<div>
									<div className={styles.dataRowTitle}>
										{viewModel.latestFailedReceipt.entry.title}
									</div>
									<div className={styles.dataRowMeta}>
										{viewModel.latestFailedReceipt.job.error_text ||
											viewModel.latestFailedReceipt.job.stderr_excerpt ||
											"Publish failed"}
									</div>
								</div>
								<div className={styles.dataRowAside}>
									<Badge color="danger" variant="soft">
										failed
									</Badge>
									<button
										type="button"
										className={styles.sessionActionButton}
										onClick={() =>
											onOpenLatestReceipt(viewModel.latestFailedReceipt!.entry)
										}
									>
										Open latest receipt
									</button>
								</div>
							</div>
						</div>
					) : null}

					<div className={styles.sectionBlock}>
						<Text size="xs" color="muted" className={styles.subpanelLabel}>
							Hotspot-linked entries
						</Text>
						<div className={styles.rowList}>
							{viewModel.hotspotLinkedEntries.length === 0 ? (
								<div className={styles.emptyStateCompact}>
									No hotspot-linked entries matched the current filters.
								</div>
							) : (
								viewModel.hotspotLinkedEntries.map((entry) => (
									<div key={entry.id} className={styles.dataRow}>
										<div>
											<div className={styles.dataRowTitle}>{entry.title}</div>
											<div className={styles.dataRowMeta}>
												{entry.source_kind} • {entry.publish_state}
												{entry.app_area ? ` • ${entry.app_area}` : ""}
											</div>
										</div>
										<div className={styles.dataRowAside}>
											<Badge
												color={
													entry.publish_state === "published"
														? "success"
														: entry.publish_state === "ready"
															? "accent"
															: "primary"
												}
												variant="soft"
											>
												{entry.publish_state}
											</Badge>
											<button
												type="button"
												className={styles.sessionActionButton}
												onClick={() => onOpenHotspotEntry(entry)}
											>
												Open hotspot-linked entry
											</button>
										</div>
									</div>
								))
							)}
						</div>
					</div>

					<div className={styles.sectionBlock}>
						<Text size="xs" color="muted" className={styles.subpanelLabel}>
							Recent ledger entries
						</Text>
						<div className={styles.rowList}>
							{entries.length === 0 ? (
								<div className={styles.emptyStateCompact}>
									No work ledger entries matched the current filters.
								</div>
							) : (
								entries.slice(0, 4).map((entry) => (
									<div key={entry.id} className={styles.dataRow}>
										<div>
											<div className={styles.dataRowTitle}>{entry.title}</div>
											<div className={styles.dataRowMeta}>
												{entry.summary}
											</div>
										</div>
										<div className={styles.dataRowAside}>
											<Badge
												color={
													entry.publish_state === "published"
														? "success"
														: entry.publish_state === "ready"
															? "accent"
															: "primary"
												}
												variant="soft"
											>
												{entry.publish_state}
											</Badge>
										</div>
									</div>
								))
							)}
						</div>
					</div>
				</div>
			)}
		</Panel>
	);
}

interface DashboardMemorySectionProps {
	panelRef: RefObject<HTMLDivElement | null>;
	className: string;
	memoryError: string | null;
	sharedMemoryCount: number;
	privateMemoryCount: number;
	filteredMemories: Memory[];
}

export function DashboardMemorySection({
	panelRef,
	className,
	memoryError,
	sharedMemoryCount,
	privateMemoryCount,
	filteredMemories,
}: DashboardMemorySectionProps) {
	const patternMemoryCount = filteredMemories.filter(
		(memory) => memory.memory_type === "pattern",
	).length;

	return (
		<Panel
			variant="default"
			padding="lg"
			className={className}
			ref={panelRef}
			data-focus-target="memory"
		>
			<div className={styles.panelHeader}>
				<div>
					<Text size="sm" weight="semibold">
						Agent Memory
					</Text>
					<Text size="xs" color="muted">
						Private and shared notes attached to the current workspace.
					</Text>
				</div>
				{memoryError && (
					<Badge color="warning" variant="soft">
						Offline
					</Badge>
				)}
			</div>

			<div className={styles.memoryStats}>
				<div className={styles.memoryStatCard}>
					<div className={styles.memoryStatValue}>{sharedMemoryCount}</div>
					<div className={styles.memoryStatLabel}>Shared</div>
				</div>
				<div className={styles.memoryStatCard}>
					<div className={styles.memoryStatValue}>{privateMemoryCount}</div>
					<div className={styles.memoryStatLabel}>Private</div>
				</div>
				<div className={styles.memoryStatCard}>
					<div className={styles.memoryStatValue}>{patternMemoryCount}</div>
					<div className={styles.memoryStatLabel}>Patterns</div>
				</div>
			</div>

			<div className={styles.rowList}>
				{filteredMemories.slice(0, 6).map((memory) => (
					<div key={memory.id} className={styles.memoryRow}>
						<div className={styles.memoryAvatar}>
							{memory.agent_profile_id ? (
								<AgentPixelMark
									profileId={memory.agent_profile_id as AgentProfileId}
									size={28}
									detailLevel="hero"
								/>
							) : (
								<div className={styles.sharedMemoryBadge}>
									<BrainCircuit size={14} />
								</div>
							)}
						</div>
						<div className={styles.memoryBody}>
							<div className={styles.memoryMeta}>
								<Badge
									color={memory.scope === "private" ? "accent" : "primary"}
									variant="soft"
								>
									{memory.scope === "private" ? "Private" : "Shared"}
								</Badge>
								<span className={styles.memoryType}>{memory.memory_type}</span>
								<span className={styles.memoryTime}>
									{formatRelativeTime(memory.created_at)}
								</span>
							</div>
							<div className={styles.memoryContent}>{memory.content}</div>
						</div>
					</div>
				))}
				{filteredMemories.length === 0 && (
					<div className={styles.emptyStateCompact}>
						No memory notes matched the current filters.
					</div>
				)}
			</div>
		</Panel>
	);
}

interface DashboardProjectOperationsSectionProps {
	panelRef: RefObject<HTMLDivElement | null>;
	className: string;
	isLoading: boolean;
	loadMessage: string;
	loadProgress: number;
	filteredProjects: DashboardProject[];
	projectTaskCounts: ReadonlyMap<string, DashboardTaskCount>;
	telemetryHotspotProjects: Array<{ projectId: string; eventCount: number }>;
	allProjectsMap: ReadonlyMap<string, DashboardProject>;
	filteredActivities: ActivityLogRow[];
	handleNavigateToProject: (projectId: string) => void;
	updateFilters: (updates: Record<string, string>) => void;
}

export function DashboardProjectOperationsSection({
	panelRef,
	className,
	isLoading,
	loadMessage,
	loadProgress,
	filteredProjects,
	projectTaskCounts,
	telemetryHotspotProjects,
	allProjectsMap,
	filteredActivities,
	handleNavigateToProject,
	updateFilters,
}: DashboardProjectOperationsSectionProps) {
	return (
		<Panel
			variant="default"
			padding="lg"
			className={className}
			ref={panelRef}
			data-focus-target="projects"
		>
			<div className={styles.panelHeader}>
				<div>
					<Text size="sm" weight="semibold">
						Project Operations
					</Text>
					<Text size="xs" color="muted">
						Deadlines, task health, and recent activity for the selected scope.
					</Text>
				</div>
				{isLoading && (
					<Badge color="warning" variant="soft">
						Loading
					</Badge>
				)}
			</div>

			{isLoading ? (
				<div className={styles.emptyState}>
					{loadMessage} ({loadProgress}%)
				</div>
			) : (
				<>
					<div className={styles.rowList}>
						{filteredProjects.slice(0, 4).map((project) => {
							const counts = projectTaskCounts.get(project.id);
							return (
								<button
									key={project.id}
									type="button"
									className={styles.projectRow}
									onClick={() => handleNavigateToProject(project.id)}
								>
									<div>
										<div className={styles.dataRowTitle}>{project.name}</div>
										<div className={styles.dataRowMeta}>
											{project.status} • {project.priority}
											{project.category ? ` • ${project.category}` : ""}
										</div>
									</div>
									<div className={styles.projectRowAside}>
										<span>{counts?.completed ?? 0}/{counts?.total ?? 0}</span>
										<ArrowUpRight size={14} />
									</div>
								</button>
							);
						})}
					</div>

					<div className={styles.sectionBlock}>
						<Text size="xs" color="muted" className={styles.subpanelLabel}>
							High-activity projects
						</Text>
						<div className={styles.rowList}>
							{telemetryHotspotProjects.length === 0 ? (
								<div className={styles.emptyStateCompact}>
									No project telemetry hotspots matched the current filters.
								</div>
							) : (
								telemetryHotspotProjects.map((entry) => {
									const hotspotProject =
										allProjectsMap.get(entry.projectId) ?? null;
									return (
										<button
											key={entry.projectId}
											type="button"
											className={styles.projectRow}
											onClick={() =>
												updateFilters({
													project: entry.projectId,
													focus: "watchdog",
												})
											}
										>
											<div>
												<div className={styles.dataRowTitle}>
													{hotspotProject?.name ?? entry.projectId}
												</div>
												<div className={styles.dataRowMeta}>
													{hotspotProject
														? `${hotspotProject.status} • ${hotspotProject.priority}`
														: "Project telemetry focus"}
												</div>
											</div>
											<div className={styles.projectRowAside}>
												<span>{entry.eventCount} events</span>
												<ArrowUpRight size={14} />
											</div>
										</button>
									);
								})
							)}
						</div>
					</div>

					<div className={styles.sectionBlock}>
						<Text size="xs" color="muted" className={styles.subpanelLabel}>
							Recent activity
						</Text>
						<div className={styles.rowList}>
							{filteredActivities.slice(0, 6).map((activity) => (
								<div key={activity.id} className={styles.dataRow}>
									<div>
										<div className={styles.dataRowTitle}>
											{activity.description}
										</div>
										<div className={styles.dataRowMeta}>
											{activity.project_id
												? allProjectsMap.get(activity.project_id)?.name ||
													activity.project_id
												: "Workspace"}
										</div>
									</div>
									<div className={styles.dataRowAside}>
										{formatRelativeTime(activity.timestamp)}
									</div>
								</div>
							))}
						</div>
					</div>
				</>
			)}
		</Panel>
	);
}
