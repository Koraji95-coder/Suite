import { ArrowUpRight, LayoutDashboard, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
	AGENT_PROFILE_IDS,
	AGENT_PROFILES,
	type AgentProfileId,
} from "@/components/agent/agentProfiles";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
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
	type WatchdogCollector,
	type WatchdogCollectorEvent,
	type WatchdogOverviewResponse,
	type WatchdogSessionSummary,
	watchdogService,
} from "@/services/watchdogService";
import styles from "./DashboardOverviewPanel.module.css";
import {
	DashboardArchitectureSection,
	DashboardMemorySection,
	DashboardOverviewStatsGrid,
	DashboardProjectOperationsSection,
	DashboardWatchdogSection,
} from "./DashboardOverviewSections";
import { buildDashboardWatchdogViewModel } from "./dashboardWatchdogSelectors";
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

type FocusPillOption = DashboardFocus | "all";

const FOCUS_PILL_OPTIONS: ReadonlyArray<{ value: FocusPillOption; label: string }> = [
	{ value: "all", label: "Unified view" },
	{ value: "watchdog", label: "Watchdog" },
	{ value: "architecture", label: "Architecture" },
	{ value: "memory", label: "Agent memory" },
	{ value: "projects", label: "Project ops" },
];

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
		let cancelled = false;

		const run = async () => {
			setTelemetryLoading(true);
			setWatchdogError(null);
			setMemoryError(null);

			const projectId =
				selectedProjectId !== "all" ? selectedProjectId : undefined;
			const collectorId =
				selectedCollectorId !== "all" ? selectedCollectorId : undefined;

			const [
				overviewResult,
				eventsResult,
				sessionsResult,
				collectorsResult,
				memoriesResult,
			] = await Promise.allSettled([
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
	const {
		filteredCollectorOptions,
		visibleCollectors,
		liveSessionCards,
		activeCadSessionCount,
		sessionTimelineRows,
	} = useMemo(
		() =>
			buildDashboardWatchdogViewModel({
				allProjectsMap,
				collectors,
				selectedCollectorId,
				selectedProjectId,
				selectedWindowMs,
				watchdogEvents,
				watchdogSessions,
			}),
		[
			allProjectsMap,
			collectors,
			selectedCollectorId,
			selectedProjectId,
			selectedWindowMs,
			watchdogEvents,
			watchdogSessions,
		],
	);

	const trendMax = Math.max(
		1,
		...(watchdogOverview?.trendBuckets ?? []).map((bucket) => bucket.eventCount),
	);
	const telemetryHotspotProjects = (watchdogOverview?.projects.top ?? []).slice(
		0,
		4,
	);
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
	const selectedWindowLabel =
		TIME_WINDOW_OPTIONS.find((option) => option.value === selectedWindowHours)
			?.label ?? `${selectedWindowHours} hours`;

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

			<div className={styles.commandFrame}>
				<section className={styles.filterPanel}>
					<div className={styles.filterHeader}>
						<div>
							<Text size="xs" weight="semibold">
								Focus filters
							</Text>
							<Text size="xs" color="muted">
								Search across telemetry, architecture, memory, and project data.
							</Text>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setRefreshKey((value) => value + 1)}
							iconLeft={<RefreshCw size={12} />}
						>
							Resync
						</Button>
					</div>

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
							<label
								htmlFor="dashboard-collector-filter"
								className={styles.filterLabel}
							>
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

					<div className={styles.focusPills}>
						{FOCUS_PILL_OPTIONS.map((option) => {
							const isActive =
								(option.value === "all" && !selectedFocus) ||
								(option.value !== "all" && selectedFocus === option.value);
							return (
								<button
									key={option.value}
									type="button"
									className={`${styles.focusPill} ${
										isActive ? styles.focusPillActive : ""
									}`}
									onClick={() =>
										updateFilter(
											"focus",
											option.value === "all" ? "" : option.value,
										)
									}
								>
									{option.label}
								</button>
							);
						})}
					</div>
				</section>

				<DashboardOverviewStatsGrid
					projectsCount={projects.length}
					openTasks={openTasks}
					collectorsOnline={watchdogOverview?.collectors.online ?? 0}
					eventsInWindow={watchdogOverview?.events.inWindow ?? 0}
					memoryCount={filteredMemories.length}
					storageUsed={storageUsed}
				/>

				<div className={styles.moduleGrid}>
					<DashboardWatchdogSection
						panelRef={watchdogSectionRef}
						className={watchdogPanelClassName}
						telemetryLoading={telemetryLoading}
						watchdogError={watchdogError}
						selectedProject={selectedProject}
						selectedWindowLabel={selectedWindowLabel}
						overdueProjects={overdueProjects}
						activeCadSessionCount={activeCadSessionCount}
						liveSessionCards={liveSessionCards}
						watchdogOverview={watchdogOverview}
						trendMax={trendMax}
						watchdogEvents={watchdogEvents}
						visibleCollectors={visibleCollectors}
						sessionTimelineRows={sessionTimelineRows}
						selectedProjectId={selectedProjectId}
						selectedCollectorId={selectedCollectorId}
						watchdogSessions={watchdogSessions}
						telemetryHotspotProjects={telemetryHotspotProjects}
						allProjectsMap={allProjectsMap}
						updateFilter={updateFilter}
						updateFilters={updateFilters}
					/>

					<DashboardArchitectureSection
						panelRef={architectureSectionRef}
						className={architecturePanelClassName}
						filteredDomains={filteredDomains}
						filteredHotspots={filteredHotspots}
						filteredFixCandidates={filteredFixCandidates}
						onDeepDive={() => navigate("/app/apps/graph")}
					/>

					<DashboardMemorySection
						panelRef={memorySectionRef}
						className={memoryPanelClassName}
						memoryError={memoryError}
						sharedMemoryCount={sharedMemoryCount}
						privateMemoryCount={privateMemoryCount}
						filteredMemories={filteredMemories}
					/>

					<DashboardProjectOperationsSection
						panelRef={projectSectionRef}
						className={projectPanelClassName}
						isLoading={isLoading}
						loadMessage={loadMessage}
						loadProgress={loadProgress}
						filteredProjects={filteredProjects}
						projectTaskCounts={projectTaskCounts}
						telemetryHotspotProjects={telemetryHotspotProjects}
						allProjectsMap={allProjectsMap}
						filteredActivities={filteredActivities}
						handleNavigateToProject={handleNavigateToProject}
						updateFilters={updateFilters}
					/>
				</div>
			</div>
		</div>
	);
}
