import {
	Activity,
	ArrowUpRight,
	BrainCircuit,
	FolderKanban,
	GitBranch,
	HardDrive,
	LayoutDashboard,
	RefreshCw,
	Radar,
	ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AgentPixelMark } from "@/components/agent/AgentPixelMark";
import {
	AGENT_PROFILE_IDS,
	AGENT_PROFILES,
	type AgentProfileId,
} from "@/components/agent/agentProfiles";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { Heading, Text } from "@/components/primitives/Text";
import {
	ARCHITECTURE_AUTOGEN,
	ARCHITECTURE_DOMAINS,
	ARCHITECTURE_FIX_CANDIDATES,
	type ArchitectureDomainId,
} from "@/data/architectureModel";
import { loadMemories } from "@/lib/agent-memory/service";
import type { Memory } from "@/lib/agent-memory/types";
import {
	basenameFromPath,
	readWatchdogCollectorRuntimeState,
	summarizeWatchdogTarget,
} from "@/lib/watchdogTelemetry";
import {
	type WatchdogCollector,
	type WatchdogCollectorEvent,
	type WatchdogOverviewResponse,
	type WatchdogSessionSummary,
	watchdogService,
} from "@/services/watchdogService";
import styles from "./DashboardOverviewPanel.module.css";
import { useDashboardOverviewData } from "./useDashboardOverviewData";

interface DashboardOverviewPanelProps {
	onNavigateToProject?: (projectId: string) => void;
	onNavigateToProjectsHub?: () => void;
}

type DomainFilter = "all" | ArchitectureDomainId;
type AgentFilter = "all" | AgentProfileId;
type DashboardFocus = "watchdog" | "architecture" | "memory" | "projects";

const TIME_WINDOW_OPTIONS = [
	{ value: "4", label: "4 hours" },
	{ value: "24", label: "24 hours" },
	{ value: "72", label: "72 hours" },
	{ value: "168", label: "7 days" },
] as const;

function matchesQuery(query: string, values: Array<string | undefined | null>) {
	if (!query) return true;
	return values.some((value) =>
		String(value || "")
			.toLowerCase()
			.includes(query),
	);
}

function includesDomainPath(pathValue: string, domainId: DomainFilter): boolean {
	if (domainId === "all") return true;
	const domain = ARCHITECTURE_DOMAINS.find((item) => item.id === domainId);
	if (!domain) return true;
	const normalizedPath = pathValue.toLowerCase().replace(/\\/g, "/");
	return domain.repoRoots.some((root) =>
		normalizedPath.includes(root.toLowerCase().replace(/\\/g, "/")),
	);
}

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatRelativeTime(timestamp: number | string | null | undefined): string {
	if (!timestamp) return "—";
	const timeValue =
		typeof timestamp === "string"
			? new Date(timestamp).getTime()
			: Number(timestamp);
	if (!Number.isFinite(timeValue) || timeValue <= 0) return "—";

	const deltaMs = Date.now() - timeValue;
	const deltaMinutes = Math.round(deltaMs / 60000);
	if (Math.abs(deltaMinutes) < 1) return "just now";
	if (Math.abs(deltaMinutes) < 60) return `${deltaMinutes}m ago`;

	const deltaHours = Math.round(deltaMinutes / 60);
	if (Math.abs(deltaHours) < 24) return `${deltaHours}h ago`;

	const deltaDays = Math.round(deltaHours / 24);
	return `${deltaDays}d ago`;
}

function formatDuration(durationMs: number | null | undefined): string {
	if (!durationMs || durationMs <= 0) return "0m";
	const totalMinutes = Math.max(1, Math.round(durationMs / 60000));
	if (totalMinutes < 60) return `${totalMinutes}m`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function clampPercentage(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, value));
}

function parseDashboardFocus(value: string | null): DashboardFocus | null {
	switch (value) {
		case "watchdog":
		case "architecture":
		case "memory":
		case "projects":
			return value;
		default:
			return null;
	}
}

export function DashboardOverviewPanel({
	onNavigateToProject,
	onNavigateToProjectsHub,
}: DashboardOverviewPanelProps) {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const {
		projects,
		activities,
		storageUsed,
		isLoading,
		loadMessage,
		loadProgress,
		projectTaskCounts,
		allProjectsMap,
	} = useDashboardOverviewData();

	const [watchdogOverview, setWatchdogOverview] =
		useState<WatchdogOverviewResponse | null>(null);
	const [watchdogEvents, setWatchdogEvents] = useState<WatchdogCollectorEvent[]>([]);
	const [watchdogSessions, setWatchdogSessions] = useState<
		WatchdogSessionSummary[]
	>([]);
	const [collectors, setCollectors] = useState<WatchdogCollector[]>([]);
	const [memories, setMemories] = useState<Memory[]>([]);
	const [watchdogError, setWatchdogError] = useState<string | null>(null);
	const [memoryError, setMemoryError] = useState<string | null>(null);
	const [telemetryLoading, setTelemetryLoading] = useState(true);
	const [refreshKey, setRefreshKey] = useState(0);
	const watchdogSectionRef = useRef<HTMLDivElement | null>(null);
	const architectureSectionRef = useRef<HTMLDivElement | null>(null);
	const memorySectionRef = useRef<HTMLDivElement | null>(null);
	const projectSectionRef = useRef<HTMLDivElement | null>(null);

	const selectedProjectId = searchParams.get("project") || "all";
	const selectedDomain = (searchParams.get("domain") || "all") as DomainFilter;
	const selectedAgent = (searchParams.get("agent") || "all") as AgentFilter;
	const selectedCollectorId = searchParams.get("collector") || "all";
	const selectedWindowHours = searchParams.get("window") || "24";
	const selectedFocus = parseDashboardFocus(searchParams.get("focus"));
	const searchValue = searchParams.get("query") || "";
	const query = searchValue.trim().toLowerCase();

	const selectedWindowMs =
		Math.max(1, Number.parseInt(selectedWindowHours, 10) || 24) *
		60 *
		60 *
		1000;

	const updateFilters = (updates: Record<string, string>) => {
		const next = new URLSearchParams(searchParams);
		for (const [key, value] of Object.entries(updates)) {
			if (!value || value === "all") {
				next.delete(key);
			} else {
				next.set(key, value);
			}
		}
		setSearchParams(next, { replace: true });
	};

	const updateFilter = (key: string, value: string) => {
		updateFilters({ [key]: value });
	};

	useEffect(() => {
		void refreshKey;
		let cancelled = false;

		const run = async () => {
			setTelemetryLoading(true);
			setWatchdogError(null);
			setMemoryError(null);

			const projectId =
				selectedProjectId !== "all" ? selectedProjectId : undefined;
			const collectorId =
				selectedCollectorId !== "all" ? selectedCollectorId : undefined;

			const [overviewResult, eventsResult, sessionsResult, collectorsResult, memoriesResult] =
				await Promise.allSettled([
					watchdogService.getOverview({
						projectId,
						timeWindowMs: selectedWindowMs,
					}),
					watchdogService.listEvents({
						projectId,
						collectorId,
						limit: 8,
						sinceMs: Date.now() - selectedWindowMs,
					}),
					watchdogService.listSessions({
						projectId,
						collectorId,
						limit: 8,
						timeWindowMs: selectedWindowMs,
					}),
					watchdogService.listCollectors(),
					loadMemories(),
				]);

			if (cancelled) return;

			if (overviewResult.status === "fulfilled") {
				setWatchdogOverview(overviewResult.value);
			} else {
				setWatchdogOverview(null);
				setWatchdogError(
					overviewResult.reason instanceof Error
						? overviewResult.reason.message
						: "Watchdog overview is unavailable.",
				);
			}

			setWatchdogEvents(
				eventsResult.status === "fulfilled" ? eventsResult.value.events ?? [] : [],
			);
			setWatchdogSessions(
				sessionsResult.status === "fulfilled"
					? sessionsResult.value.sessions ?? []
					: [],
			);
			setCollectors(
				collectorsResult.status === "fulfilled"
					? collectorsResult.value.collectors ?? []
					: [],
			);

			if (memoriesResult.status === "fulfilled") {
				setMemories(memoriesResult.value);
			} else {
				setMemories([]);
				setMemoryError(
					memoriesResult.reason instanceof Error
						? memoriesResult.reason.message
						: "Agent memory is unavailable.",
				);
			}

			setTelemetryLoading(false);
		};

		void run();
		return () => {
			cancelled = true;
		};
	}, [refreshKey, selectedCollectorId, selectedProjectId, selectedWindowMs]);

	useEffect(() => {
		const focusMap = {
			watchdog: watchdogSectionRef,
			architecture: architectureSectionRef,
			memory: memorySectionRef,
			projects: projectSectionRef,
		};
		const targetRef = selectedFocus ? focusMap[selectedFocus] : null;
		if (!targetRef?.current) return;
		const frame = window.requestAnimationFrame(() => {
			targetRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "start",
			});
		});
		return () => window.cancelAnimationFrame(frame);
	}, [selectedFocus]);

	const handleNavigateToProject =
		onNavigateToProject ??
		((projectId: string) => navigate(`/app/projects/${projectId}`));
	const handleNavigateToProjectsHub =
		onNavigateToProjectsHub ?? (() => navigate("/app/projects"));

	const selectedProject =
		selectedProjectId !== "all"
			? projects.find((project) => project.id === selectedProjectId) || null
			: null;

	const filteredProjects = useMemo(
		() =>
			projects.filter((project) => {
				if (selectedProjectId !== "all" && project.id !== selectedProjectId) {
					return false;
				}
				return matchesQuery(query, [
					project.name,
					project.status,
					project.priority,
					project.category,
				]);
			}),
		[projects, query, selectedProjectId],
	);

	const filteredActivities = useMemo(
		() =>
			activities.filter((activity) => {
				if (
					selectedProjectId !== "all" &&
					activity.project_id !== selectedProjectId
				) {
					return false;
				}
				return matchesQuery(query, [
					activity.action,
					activity.description,
					activity.project_id,
				]);
			}),
		[activities, query, selectedProjectId],
	);

	const filteredMemories = useMemo(
		() =>
			memories.filter((memory) => {
				if (
					selectedProjectId !== "all" &&
					memory.project_id &&
					memory.project_id !== selectedProjectId
				) {
					return false;
				}
				if (
					selectedAgent !== "all" &&
					memory.agent_profile_id !== selectedAgent &&
					!memory.content.toLowerCase().includes(selectedAgent)
				) {
					return false;
				}
				return matchesQuery(query, [
					memory.content,
					memory.memory_type,
					memory.agent_profile_id,
					memory.project_id,
				]);
			}),
		[memories, query, selectedAgent, selectedProjectId],
	);

	const filteredDomains = useMemo(
		() =>
			ARCHITECTURE_DOMAINS.filter(
				(domain) => selectedDomain === "all" || domain.id === selectedDomain,
			).filter((domain) =>
				matchesQuery(query, [domain.label, domain.summary, ...domain.repoRoots]),
			),
		[query, selectedDomain],
	);

	const filteredHotspots = useMemo(
		() =>
			ARCHITECTURE_AUTOGEN.hotspots
				.filter((hotspot) => includesDomainPath(hotspot.path, selectedDomain))
				.filter((hotspot) => matchesQuery(query, [hotspot.path]))
				.slice(0, 6),
		[query, selectedDomain],
	);

	const filteredFixCandidates = useMemo(
		() =>
			ARCHITECTURE_FIX_CANDIDATES.filter((candidate) => {
				if (selectedDomain === "all") return true;
				return candidate.paths.some((pathValue) =>
					includesDomainPath(pathValue, selectedDomain),
				);
			})
				.filter((candidate) =>
					matchesQuery(query, [
						candidate.title,
						candidate.detail,
						...candidate.paths,
					]),
				)
				.slice(0, 4),
		[query, selectedDomain],
	);

	const openTasks = Array.from(projectTaskCounts.values()).reduce(
		(total, counts) => total + Math.max(counts.total - counts.completed, 0),
		0,
	);
	const overdueProjects = Array.from(projectTaskCounts.values()).filter(
		(counts) => counts.hasOverdue,
	).length;
	const collectorById = useMemo(
		() =>
			new Map(
				collectors.map((collector) => [collector.collectorId, collector] as const),
			),
		[collectors],
	);
	const visibleCollectorIds = useMemo(() => {
		if (selectedProjectId === "all") {
			return null;
		}
		const ids = new Set<string>();
		for (const event of watchdogEvents) {
			if (event.projectId === selectedProjectId) {
				ids.add(event.collectorId);
			}
		}
		for (const session of watchdogSessions) {
			if (session.projectId === selectedProjectId) {
				ids.add(session.collectorId);
			}
		}
		return ids;
	}, [selectedProjectId, watchdogEvents, watchdogSessions]);
	const filteredCollectorOptions = useMemo(
		() =>
			collectors.filter((collector) => {
				if (selectedProjectId === "all") {
					return true;
				}
				return Boolean(visibleCollectorIds?.has(collector.collectorId));
			}),
		[collectors, selectedProjectId, visibleCollectorIds],
	);
	const visibleCollectors = useMemo(() => {
		return collectors.filter((collector) => {
			if (
				selectedCollectorId !== "all" &&
				collector.collectorId !== selectedCollectorId
			) {
				return false;
			}
			if (selectedProjectId === "all") {
				return true;
			}
			if (!visibleCollectorIds || visibleCollectorIds.size === 0) {
				return false;
			}
			return visibleCollectorIds.has(collector.collectorId);
		});
	}, [collectors, selectedCollectorId, selectedProjectId, visibleCollectorIds]);
	const liveAutoCadSessions = useMemo(
		() =>
			watchdogSessions.filter(
				(session) => session.active || session.status !== "completed",
			),
		[watchdogSessions],
	);
	const activeCadSessionCount = useMemo(
		() => liveAutoCadSessions.filter((session) => session.active).length,
		[liveAutoCadSessions],
	);
	const trendMax = Math.max(
		1,
		...(watchdogOverview?.trendBuckets ?? []).map((bucket) => bucket.eventCount),
	);
	const telemetryHotspotProjects = (watchdogOverview?.projects.top ?? []).slice(0, 4);
	const sessionTimelineRows = useMemo(() => {
		const windowEnd = Date.now();
		const windowStart = windowEnd - selectedWindowMs;
		const safeWindow = Math.max(1, selectedWindowMs);
		return watchdogSessions.slice(0, 8).map((session, index) => {
			const collector = collectorById.get(session.collectorId) ?? null;
			const trackerAt =
				session.trackerUpdatedAt ??
				collector?.lastHeartbeatAt ??
				session.latestEventAt;
			const rawEnd =
				session.endedAt ??
				Math.max(
					session.latestEventAt,
					session.startedAt + Math.max(0, session.durationMs),
				);
			const boundedStart = Math.max(windowStart, session.startedAt);
			const boundedEnd = Math.min(windowEnd, Math.max(boundedStart, rawEnd));
			const leftPercent = clampPercentage(
				((boundedStart - windowStart) / safeWindow) * 100,
			);
			const widthPercent = Math.max(
				2,
				clampPercentage(((boundedEnd - boundedStart) / safeWindow) * 100),
			);
			return {
				sequence: index + 1,
				session,
				collector,
				trackerAt,
				leftPercent,
				widthPercent,
				projectName: session.projectId
					? allProjectsMap.get(session.projectId)?.name ?? session.projectId
					: null,
			};
		});
	}, [allProjectsMap, collectorById, selectedWindowMs, watchdogSessions]);
	const privateMemoryCount = filteredMemories.filter(
		(memory) => memory.scope === "private",
	).length;
	const sharedMemoryCount = filteredMemories.length - privateMemoryCount;
	const watchdogPanelClassName =
		selectedFocus === "watchdog"
			? `${styles.primaryPanel} ${styles.focusedPanel}`
			: styles.primaryPanel;
	const architecturePanelClassName =
		selectedFocus === "architecture"
			? `${styles.secondaryPanel} ${styles.focusedPanel}`
			: styles.secondaryPanel;
	const memoryPanelClassName =
		selectedFocus === "memory"
			? `${styles.secondaryPanel} ${styles.focusedPanel}`
			: styles.secondaryPanel;
	const projectPanelClassName =
		selectedFocus === "projects"
			? `${styles.secondaryPanel} ${styles.focusedPanel}`
			: styles.secondaryPanel;

	return (
		<div className={styles.root}>
			<section className={styles.masthead}>
				<div className={styles.mastheadBody}>
					<div className={styles.heroMark}>
						<LayoutDashboard size={24} />
					</div>
					<div className={styles.heroCopy}>
						<Badge color="primary" variant="soft" className={styles.kicker}>
							Command Center
						</Badge>
						<Heading level={1} className={styles.title}>
							One dashboard for operations, repo health, and agent context
						</Heading>
						<Text size="sm" color="muted" className={styles.subtitle}>
							Watchdog telemetry, architecture hotspots, long-term agent memory,
							and project operations now share the same filter model.
						</Text>
					</div>
				</div>

				<div className={styles.mastheadActions}>
					<Button
						variant="outline"
						size="sm"
						onClick={() => navigate("/app/apps/graph")}
						iconRight={<ArrowUpRight size={14} />}
					>
						Graph Explorer
					</Button>
					<Button
						variant="secondary"
						size="sm"
						onClick={handleNavigateToProjectsHub}
					>
						Project Manager
					</Button>
					<Button
						variant="primary"
						size="sm"
						onClick={() => setRefreshKey((value) => value + 1)}
						iconLeft={<RefreshCw size={14} />}
					>
						Refresh
					</Button>
				</div>
			</section>

			<section className={styles.filters}>
				<div className={styles.filterField}>
					<label htmlFor="dashboard-project-filter" className={styles.filterLabel}>
						Project
					</label>
					<select
						id="dashboard-project-filter"
						value={selectedProjectId}
						onChange={(event) => updateFilter("project", event.target.value)}
						className={styles.select}
						name="dashboard_project_filter"
					>
						<option value="all">All projects</option>
						{projects.map((project) => (
							<option key={project.id} value={project.id}>
								{project.name}
							</option>
						))}
					</select>
				</div>

				<div className={styles.filterField}>
					<label htmlFor="dashboard-domain-filter" className={styles.filterLabel}>
						Repo area
					</label>
					<select
						id="dashboard-domain-filter"
						value={selectedDomain}
						onChange={(event) => updateFilter("domain", event.target.value)}
						className={styles.select}
						name="dashboard_domain_filter"
					>
						<option value="all">All domains</option>
						{ARCHITECTURE_DOMAINS.map((domain) => (
							<option key={domain.id} value={domain.id}>
								{domain.label}
							</option>
						))}
					</select>
				</div>

				<div className={styles.filterField}>
					<label htmlFor="dashboard-agent-filter" className={styles.filterLabel}>
						Agent
					</label>
					<select
						id="dashboard-agent-filter"
						value={selectedAgent}
						onChange={(event) => updateFilter("agent", event.target.value)}
						className={styles.select}
						name="dashboard_agent_filter"
					>
						<option value="all">All agents</option>
						{AGENT_PROFILE_IDS.map((profileId) => (
							<option key={profileId} value={profileId}>
								{AGENT_PROFILES[profileId].name}
							</option>
						))}
					</select>
				</div>

				<div className={styles.filterField}>
					<label htmlFor="dashboard-collector-filter" className={styles.filterLabel}>
						Collector
					</label>
					<select
						id="dashboard-collector-filter"
						value={selectedCollectorId}
						onChange={(event) => updateFilter("collector", event.target.value)}
						className={styles.select}
						name="dashboard_collector_filter"
					>
						<option value="all">All collectors</option>
						{filteredCollectorOptions.map((collector) => (
							<option key={collector.collectorId} value={collector.collectorId}>
								{collector.name}
							</option>
						))}
					</select>
				</div>

				<div className={styles.filterField}>
					<label htmlFor="dashboard-window-filter" className={styles.filterLabel}>
						Time range
					</label>
					<select
						id="dashboard-window-filter"
						value={selectedWindowHours}
						onChange={(event) => updateFilter("window", event.target.value)}
						className={styles.select}
						name="dashboard_window_filter"
					>
						{TIME_WINDOW_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</div>

				<div className={styles.filterFieldWide}>
					<label htmlFor="dashboard-query-filter" className={styles.filterLabel}>
						Search
					</label>
					<input
						id="dashboard-query-filter"
						type="search"
						value={searchValue}
						onChange={(event) => updateFilter("query", event.target.value)}
						placeholder="Search projects, files, memories, and actions..."
						className={styles.searchInput}
						name="dashboard_query_filter"
					/>
				</div>
			</section>

			<section className={styles.statsGrid}>
				<Panel variant="default" padding="md" className={styles.statCard}>
					<div className={styles.statIcon}>
						<FolderKanban size={16} />
					</div>
					<div className={styles.statValue}>{projects.length}</div>
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
					<div className={styles.statValue}>
						{watchdogOverview?.collectors.online ?? 0}
					</div>
					<div className={styles.statLabel}>Collectors online</div>
				</Panel>
				<Panel variant="default" padding="md" className={styles.statCard}>
					<div className={styles.statIcon}>
						<Activity size={16} />
					</div>
					<div className={styles.statValue}>
						{watchdogOverview?.events.inWindow ?? 0}
					</div>
					<div className={styles.statLabel}>Events in window</div>
				</Panel>
				<Panel variant="default" padding="md" className={styles.statCard}>
					<div className={styles.statIcon}>
						<BrainCircuit size={16} />
					</div>
					<div className={styles.statValue}>{filteredMemories.length}</div>
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

			<div className={styles.commandGrid}>
				<Panel
					variant="default"
					padding="lg"
					className={watchdogPanelClassName}
					ref={watchdogSectionRef}
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
									<strong>
										{
											TIME_WINDOW_OPTIONS.find(
												(option) => option.value === selectedWindowHours,
											)?.label
										}
									</strong>
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
									{liveAutoCadSessions.length === 0 ? (
										<div className={styles.emptyStateCompact}>
											No live AutoCAD sessions matched the current filters.
										</div>
									) : (
										liveAutoCadSessions.slice(0, 4).map((session) => {
											const collector =
												collectorById.get(session.collectorId) ?? null;
											const runtime = collector
												? readWatchdogCollectorRuntimeState(collector)
												: null;
											const drawingLabel = basenameFromPath(
												session.drawingPath ||
													runtime?.activeDrawingName ||
													runtime?.activeDrawingPath,
											);
											const trackingLabel =
												session.status === "completed"
													? "Idle"
													: session.status === "paused"
														? "Paused"
														: "Live";
											const trackerUpdatedAt =
												session.trackerUpdatedAt ||
												runtime?.trackerUpdatedAt ||
												collector?.lastHeartbeatAt ||
												session.latestEventAt;
											return (
												<div key={session.sessionId} className={styles.sessionCard}>
													<div className={styles.sessionCardHead}>
														<div>
															<div className={styles.dataRowTitle}>
																{collector?.name || session.collectorId}
															</div>
															<div className={styles.dataRowMeta}>
																{session.workstationId} • {session.collectorType}
															</div>
														</div>
														<div className={styles.sessionBadges}>
															<Badge
																color={
																	collector?.status === "online"
																		? "success"
																		: "warning"
																}
																variant="soft"
															>
																{collector?.status || "unknown"}
															</Badge>
															<Badge
																color={
																	trackingLabel === "Live"
																		? "primary"
																		: trackingLabel === "Paused"
																			? "warning"
																			: "accent"
																}
																variant="soft"
															>
																{trackingLabel}
															</Badge>
														</div>
													</div>
													<div className={styles.sessionDrawing}>
														{session.drawingPath ? drawingLabel : "No active drawing"}
													</div>
													<div className={styles.sessionMeta}>
														<span>
															Started {formatRelativeTime(session.startedAt)}
														</span>
														<span>
															Tracker {formatRelativeTime(trackerUpdatedAt)}
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
												height: `${Math.max(
													10,
													(bucket.eventCount / trendMax) * 100,
												)}%`,
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
												const { session, collector } = row;
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
																		{basenameFromPath(session.drawingPath)}
																	</div>
																	<div className={styles.dataRowMeta}>
																		{collector?.name || session.collectorId}
																		{" • "}
																		{row.projectName || "Unassigned"}
																	</div>
																</div>
															</div>
															<div className={styles.sessionTimelineActions}>
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
										Top telemetry projects
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
															{allProjectsMap.get(entry.projectId)?.name ||
																entry.projectId}
														</div>
														<div className={styles.dataRowMeta}>
															{entry.projectId}
														</div>
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

				<Panel
					variant="default"
					padding="lg"
					className={architecturePanelClassName}
					ref={architectureSectionRef}
					data-focus-target="architecture"
				>
					<div className={styles.panelHeader}>
						<div>
							<Text size="sm" weight="semibold">
								Repository Architecture
							</Text>
							<Text size="xs" color="muted">
								Hotspots, domains, and refactor checkpoints from the repo scan.
							</Text>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => navigate("/app/apps/graph")}
							iconRight={<ArrowUpRight size={14} />}
						>
							Deep dive
						</Button>
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
							{filteredHotspots.map((hotspot) => (
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
							))}
						</div>
					</div>

					<div className={styles.sectionBlock}>
						<Text size="xs" color="muted" className={styles.subpanelLabel}>
							Refactor checkpoints
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

				<Panel
					variant="default"
					padding="lg"
					className={memoryPanelClassName}
					ref={memorySectionRef}
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
							<div className={styles.memoryStatValue}>
								{
									filteredMemories.filter(
										(memory) => memory.memory_type === "pattern",
									).length
								}
							</div>
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

				<Panel
					variant="default"
					padding="lg"
					className={projectPanelClassName}
					ref={projectSectionRef}
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
									Telemetry hotspots
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
													onClick={() => {
														updateFilters({
															project: entry.projectId,
															focus: "watchdog",
														});
													}}
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
			</div>
		</div>
	);
}
