import { ArrowUpRight, LayoutDashboard } from "lucide-react";
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
import { buildChangelogSearchParams } from "@/lib/workLedgerNavigation";
import {
	type WorkLedgerLifecycleState,
	type WorkLedgerPublishJobRow,
	type WorkLedgerPublishState,
	type WorkLedgerRow,
	type WorktaleReadinessResponse,
	workLedgerService,
} from "@/services/workLedgerService";
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
	DashboardWorkLedgerSection,
	DashboardWatchdogSection,
} from "./DashboardOverviewSections";
import { buildDashboardWorkLedgerViewModel } from "./dashboardWorkLedgerSelectors";
import { buildDashboardWatchdogViewModel } from "./dashboardWatchdogSelectors";
import { useDashboardOverviewData } from "./useDashboardOverviewData";

interface DashboardOverviewPanelProps {
	onNavigateToProject?: (projectId: string) => void;
	onNavigateToProjectsHub?: () => void;
}

type DomainFilter = "all" | ArchitectureDomainId;
type AgentFilter = "all" | AgentProfileId;
type DashboardFocus =
	| "watchdog"
	| "architecture"
	| "ledger"
	| "memory"
	| "projects";

type DashboardStatusCard = {
	key: string;
	label: string;
	tone: "success" | "warning" | "danger" | "primary";
	detail: string;
};

function normalizeLedgerPublishState(
	value: string | null,
): WorkLedgerPublishState | "all" {
	if (value === "draft" || value === "ready" || value === "published") {
		return value;
	}
	return "all";
}

function normalizeLedgerLifecycleState(
	value: string | null,
): WorkLedgerLifecycleState | "all" {
	if (
		value === "planned" ||
		value === "active" ||
		value === "completed" ||
		value === "archived"
	) {
		return value;
	}
	return "all";
}

const TIME_WINDOW_OPTIONS = [
	{ value: "4", label: "4 hours" },
	{ value: "24", label: "24 hours" },
	{ value: "72", label: "72 hours" },
	{ value: "168", label: "7 days" },
] as const;

type FocusPillOption = DashboardFocus | "all";

const FOCUS_PILL_OPTIONS: ReadonlyArray<{ value: FocusPillOption; label: string }> = [
	{ value: "all", label: "Overview" },
	{ value: "watchdog", label: "Watchdog" },
	{ value: "architecture", label: "Architecture" },
	{ value: "ledger", label: "Work ledger" },
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
		case "ledger":
		case "memory":
		case "projects":
			return value;
		default:
			return null;
	}
}

function isExternalAdvancedPath(pathValue: string): boolean {
	const normalizedPath = String(pathValue || "")
		.toLowerCase()
		.replace(/\\/g, "/");
	return normalizedPath.startsWith("zeroclaw-main/");
}

function classifyStatusCard(
	key: string,
	label: string,
	errorMessage: string | null,
	connectedDetail: string,
	loadingDetail?: string,
	isLoading?: boolean,
): DashboardStatusCard {
	if (errorMessage) {
		const normalizedMessage = errorMessage.toLowerCase();
		if (
			normalizedMessage.includes("missing `work_ledger_entries`") ||
			normalizedMessage.includes("table is missing")
		) {
			return {
				key,
				label,
				tone: "warning",
				detail:
					"Hosted schema is behind the repo. Apply the latest Supabase migration or use the local fallback.",
			};
		}
		if (
			normalizedMessage.includes("route") &&
			normalizedMessage.includes("unavailable")
		) {
			return {
				key,
				label,
				tone: "danger",
				detail:
					"Running backend is behind the repo route set. Restart the API from this checkout.",
			};
		}
		if (
			normalizedMessage.includes("unreachable") ||
			normalizedMessage.includes("failed to fetch") ||
			normalizedMessage.includes("cors")
		) {
			return {
				key,
				label,
				tone: "danger",
				detail:
					"Frontend cannot reach the current backend target. Check Vite proxy and backend startup.",
			};
		}
		if (normalizedMessage.includes("sign in")) {
			return {
				key,
				label,
				tone: "warning",
				detail: "This surface requires an authenticated session before it can load.",
			};
		}
		return {
			key,
			label,
			tone: "warning",
			detail: errorMessage,
		};
	}

	if (isLoading && loadingDetail) {
		return {
			key,
			label,
			tone: "primary",
			detail: loadingDetail,
		};
	}

	return {
		key,
		label,
		tone: "success",
		detail: connectedDetail,
	};
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
	const [workLedgerEntries, setWorkLedgerEntries] = useState<WorkLedgerRow[]>([]);
	const [workLedgerJobsByEntry, setWorkLedgerJobsByEntry] = useState<
		Record<string, WorkLedgerPublishJobRow[]>
	>({});
	const [watchdogError, setWatchdogError] = useState<string | null>(null);
	const [memoryError, setMemoryError] = useState<string | null>(null);
	const [workLedgerError, setWorkLedgerError] = useState<string | null>(null);
	const [worktaleReadiness, setWorktaleReadiness] =
		useState<WorktaleReadinessResponse | null>(null);
	const [worktaleReadinessError, setWorktaleReadinessError] =
		useState<string | null>(null);
	const [telemetryLoading, setTelemetryLoading] = useState(true);
	const watchdogSectionRef = useRef<HTMLDivElement | null>(null);
	const architectureSectionRef = useRef<HTMLDivElement | null>(null);
	const ledgerSectionRef = useRef<HTMLDivElement | null>(null);
	const memorySectionRef = useRef<HTMLDivElement | null>(null);
	const projectSectionRef = useRef<HTMLDivElement | null>(null);

	const selectedProjectId = searchParams.get("project") || "all";
	const selectedDomain = (searchParams.get("domain") || "all") as DomainFilter;
	const selectedAgent = (searchParams.get("agent") || "all") as AgentFilter;
	const selectedCollectorId = searchParams.get("collector") || "all";
	const selectedIncludeAdvanced = searchParams.get("includeAdvanced") === "1";
	const selectedWindowHours = searchParams.get("window") || "24";
	const selectedFocus = parseDashboardFocus(searchParams.get("focus"));
	const selectedLedgerPublishState = normalizeLedgerPublishState(
		searchParams.get("publishState"),
	);
	const selectedLedgerLifecycleState = normalizeLedgerLifecycleState(
		searchParams.get("lifecycleState"),
	);
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
			setWorkLedgerError(null);

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
				workLedgerResult,
				worktaleReadinessResult,
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
				workLedgerService.fetchEntries({
					projectId,
					lifecycleState: selectedLedgerLifecycleState,
					limit: 16,
				}),
				workLedgerService.fetchWorktaleReadiness(),
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

			if (workLedgerResult.status === "fulfilled") {
				setWorkLedgerEntries(workLedgerResult.value.data ?? []);
				if (workLedgerResult.value.error) {
					setWorkLedgerError(String(workLedgerResult.value.error.message || ""));
				}
			} else {
				setWorkLedgerEntries([]);
				setWorkLedgerError(
					workLedgerResult.reason instanceof Error
						? workLedgerResult.reason.message
						: "Work ledger is unavailable.",
				);
			}

			if (worktaleReadinessResult.status === "fulfilled") {
				setWorktaleReadiness(worktaleReadinessResult.value.data);
				setWorktaleReadinessError(
					worktaleReadinessResult.value.error
						? String(worktaleReadinessResult.value.error.message || "")
						: null,
				);
			} else {
				setWorktaleReadiness(null);
				setWorktaleReadinessError(
					worktaleReadinessResult.reason instanceof Error
						? worktaleReadinessResult.reason.message
						: "Worktale readiness is unavailable.",
				);
			}

			const candidateEntries =
				workLedgerResult.status === "fulfilled"
					? (workLedgerResult.value.data ?? [])
							.filter(
								(entry) =>
									entry.user_id !== "local" &&
									(entry.publish_state === "ready" ||
										entry.publish_state === "published"),
							)
							.slice(0, 8)
					: [];

			if (candidateEntries.length > 0) {
				const publishJobResults = await Promise.all(
					candidateEntries.map(async (entry) => ({
						entryId: entry.id,
						result: await workLedgerService.listPublishJobs(entry.id, 1),
					})),
				);
				if (cancelled) return;
				setWorkLedgerJobsByEntry(
					publishJobResults.reduce<Record<string, WorkLedgerPublishJobRow[]>>(
						(acc, item) => {
							if (!item.result.error && item.result.data.length > 0) {
								acc[item.entryId] = item.result.data;
							}
							return acc;
						},
						{},
					),
				);
			} else {
				setWorkLedgerJobsByEntry({});
			}

			setTelemetryLoading(false);
		};

		void run();
		return () => {
			cancelled = true;
		};
	}, [
		selectedCollectorId,
		selectedLedgerLifecycleState,
		selectedProjectId,
		selectedWindowMs,
	]);

	useEffect(() => {
		const focusMap = {
			watchdog: watchdogSectionRef,
			architecture: architectureSectionRef,
			ledger: ledgerSectionRef,
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
				.filter(
					(hotspot) =>
						selectedIncludeAdvanced || !isExternalAdvancedPath(hotspot.path),
				)
				.filter((hotspot) => includesDomainPath(hotspot.path, selectedDomain))
				.filter((hotspot) => matchesQuery(query, [hotspot.path]))
				.slice(0, 6),
		[query, selectedDomain, selectedIncludeAdvanced],
	);

	const filteredFixCandidates = useMemo(
		() =>
			ARCHITECTURE_FIX_CANDIDATES.filter((candidate) => {
				if (
					!selectedIncludeAdvanced &&
					candidate.paths.every((pathValue) => isExternalAdvancedPath(pathValue))
				) {
					return false;
				}
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
		[query, selectedDomain, selectedIncludeAdvanced],
	);

	const filteredWorkLedgerEntries = useMemo(
		() =>
			workLedgerEntries
				.filter((entry) => {
					if (
						selectedProjectId !== "all" &&
						entry.project_id !== selectedProjectId
					) {
						return false;
					}
					if (
						selectedDomain !== "all" &&
						!entry.architecture_paths.some((pathValue) =>
							includesDomainPath(pathValue, selectedDomain),
						)
					) {
						return false;
					}
					if (
						selectedLedgerPublishState !== "all" &&
						entry.publish_state !== selectedLedgerPublishState
					) {
						return false;
					}
					if (
						selectedLedgerLifecycleState !== "all" &&
						entry.lifecycle_state !== selectedLedgerLifecycleState
					) {
						return false;
					}
					return matchesQuery(query, [
						entry.title,
						entry.summary,
						entry.source_kind,
						entry.app_area,
						entry.project_id,
						...entry.commit_refs,
						...entry.architecture_paths,
						...entry.hotspot_ids,
					]);
				})
				.slice(0, 6),
		[
			query,
			selectedDomain,
			selectedLedgerLifecycleState,
			selectedLedgerPublishState,
			selectedProjectId,
			workLedgerEntries,
		],
	);
	const workLedgerViewModel = useMemo(
		() =>
			buildDashboardWorkLedgerViewModel({
				entries: filteredWorkLedgerEntries,
				jobsByEntry: workLedgerJobsByEntry,
				readiness: worktaleReadiness,
				readinessError: worktaleReadinessError,
			}),
		[
			filteredWorkLedgerEntries,
			workLedgerJobsByEntry,
			worktaleReadiness,
			worktaleReadinessError,
		],
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
	const ledgerPanelClassName =
		selectedFocus === "ledger"
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

	const statusCards = useMemo<DashboardStatusCard[]>(
		() => {
			const publisherStatusCard = worktaleReadinessError
				? classifyStatusCard(
						"publisher",
						"Worktale publisher",
						worktaleReadinessError,
						"Publisher tooling is ready on this workstation.",
					)
				: worktaleReadiness?.ready
					? {
							key: "publisher",
							label: "Worktale publisher",
							tone: "success" as const,
							detail: "Publisher tooling is ready on this workstation.",
						}
					: worktaleReadiness
						? {
								key: "publisher",
								label: "Worktale publisher",
								tone: "warning" as const,
								detail:
									worktaleReadiness.issues[0] ||
									"Publisher setup is available but still needs bootstrap.",
							}
						: {
								key: "publisher",
								label: "Worktale publisher",
								tone: "primary" as const,
								detail:
									"Publisher readiness will load after auth and backend routes are available.",
							};

			return [
				classifyStatusCard(
					"watchdog",
					"Watchdog routes",
					watchdogError,
					"Collector sessions, events, and project telemetry are loading from the current backend.",
					"Refreshing collector sessions and event summaries.",
					telemetryLoading,
				),
				classifyStatusCard(
					"ledger",
					"Work Ledger storage",
					workLedgerError,
					"Ledger rows are available for roadmap and changelog summaries.",
				),
				publisherStatusCard,
			];
		},
		[
			telemetryLoading,
			watchdogError,
			workLedgerError,
			worktaleReadiness,
			worktaleReadinessError,
		],
	);

	const openChangelog = () => {
		let rootPath: string | null = null;
		if (selectedDomain !== "all") {
			const domain = ARCHITECTURE_DOMAINS.find(
				(item) => item.id === selectedDomain,
			);
			rootPath = domain?.repoRoots[0] ?? null;
		}
		const next = buildChangelogSearchParams({
			projectId: selectedProjectId !== "all" ? selectedProjectId : null,
			query: query ? searchValue : null,
			path: rootPath,
			lifecycleState: selectedLedgerLifecycleState,
			publishState: selectedLedgerPublishState,
		});
		navigate(`/app/changelog${next.toString() ? `?${next.toString()}` : ""}`);
	};

	const openWorkLedgerReceipt = (entry: WorkLedgerRow) => {
		const next = buildChangelogSearchParams({
			projectId: entry.project_id,
			query: entry.external_reference || entry.title,
			lifecycleState: entry.lifecycle_state,
			publishState:
				entry.publish_state === "published" ? "published" : "ready",
		});
		navigate(`/app/changelog${next.toString() ? `?${next.toString()}` : ""}`);
	};

	const openHotspotLinkedEntry = (entry: WorkLedgerRow) => {
		const publishState = normalizeLedgerPublishState(entry.publish_state);
		const next = buildChangelogSearchParams({
			projectId:
				selectedProjectId !== "all" ? selectedProjectId : entry.project_id,
			query: entry.title,
			path: entry.architecture_paths[0] || null,
			hotspot: entry.hotspot_ids[0] || null,
			lifecycleState: entry.lifecycle_state,
			publishState,
		});
		navigate(`/app/changelog${next.toString() ? `?${next.toString()}` : ""}`);
	};

	return (
		<div className={styles.root}>
			<section className={styles.masthead}>
				<div className={styles.mastheadBody}>
					<div className={styles.heroMark}>
						<LayoutDashboard size={24} />
					</div>
					<div className={styles.heroCopy}>
						<Badge color="primary" variant="soft" className={styles.kicker}>
							Operations overview
						</Badge>
						<Heading level={1} className={styles.title}>
							One workspace for operations, repo health, and agent context
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
				</div>
			</section>

			<div className={styles.commandFrame}>
				<section className={styles.statusStrip}>
					{statusCards.map((card) => (
						<div key={card.key} className={styles.statusCard}>
							<div className={styles.statusCardHeader}>
								<Text size="xs" weight="semibold">
									{card.label}
								</Text>
								<Badge color={card.tone} variant="soft" size="sm">
									{card.tone === "success"
										? "ok"
										: card.tone === "primary"
											? "loading"
											: card.tone}
								</Badge>
							</div>
							<Text size="xs" color="muted" className={styles.statusCardDetail}>
								{card.detail}
							</Text>
						</div>
					))}
				</section>

				<section className={styles.filterPanel}>
					<div className={styles.filterHeader}>
						<div>
							<Text size="xs" weight="semibold">
								Focus filters
							</Text>
							<Text size="xs" color="muted">
								Filter one command surface instead of jumping across separate pages.
							</Text>
						</div>
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
						includeAdvancedModules={selectedIncludeAdvanced}
						snapshotGeneratedAt={ARCHITECTURE_AUTOGEN.generatedAt}
						onDeepDive={() => navigate("/app/apps/graph")}
						onToggleAdvancedModules={() =>
							updateFilter(
								"includeAdvanced",
								selectedIncludeAdvanced ? "" : "1",
							)
						}
					/>

					<DashboardWorkLedgerSection
						panelRef={ledgerSectionRef}
						className={ledgerPanelClassName}
						entries={filteredWorkLedgerEntries}
						viewModel={workLedgerViewModel}
						error={workLedgerError}
						onOpenChangelog={openChangelog}
						onOpenLatestReceipt={openWorkLedgerReceipt}
						onOpenHotspotEntry={openHotspotLinkedEntry}
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
