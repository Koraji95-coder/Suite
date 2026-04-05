import {
	ArrowUpRight,
	CalendarDays,
	Clock3,
	FolderKanban,
	PencilRuler,
	Replace,
	ShieldCheck,
	SquareLibrary,
	TerminalSquare,
	Workflow,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { Badge } from "@/components/system/base/Badge";
import { Panel } from "@/components/system/base/Panel";
import { Text } from "@/components/system/base/Text";
import { PageContextBand } from "@/components/system/PageContextBand";
import { Section } from "@/components/system/PageFrame";
import {
	type TrustState,
	TrustStateBadge,
} from "@/components/system/TrustStateBadge";
import { useDashboardDeliverySummary } from "@/features/project-overview/useDashboardDeliverySummary";
import { useDashboardOverviewData } from "@/features/project-overview/useDashboardOverviewData";
import { useSuiteRuntimeDoctor } from "@/hooks/useSuiteRuntimeDoctor";
import { isDevAudience } from "@/lib/audience";
import { buildProjectDetailHref } from "@/lib/projectWorkflowNavigation";
import styles from "./HomeWorkspace.module.css";

type ProductLane = {
	id: string;
	title: string;
	summary: string;
	to: string;
	icon: typeof FolderKanban;
	points: string[];
	ctaLabel: string;
	audience: "customer" | "dev";
};

type RuntimeOwnershipLane = {
	id: string;
	label: string;
	title: string;
	summary: string;
};

const PRODUCT_LANES: readonly ProductLane[] = [
	{
		id: "projects",
		title: "Projects",
		summary:
			"Project notebook for notes, calendar work, files, stage status, and release context.",
		to: "/app/projects",
		icon: FolderKanban,
		points: [
			"Notes, meetings, and stage stay in one project-aware workspace.",
			"Release and transmittal context stay tied to the project record.",
			"Calendar work is folded directly into project operations.",
		],
		ctaLabel: "Open Projects",
		audience: "customer",
	},
	{
		id: "draft",
		title: "Draft",
		summary:
			"Released drafting surfaces for drawing indexes, reusable assets, and customer-ready authoring support.",
		to: "/app/draft",
		icon: PencilRuler,
		points: [
			"Drawing List Manager owns title-block indexing and issued-set prep.",
			"Block Library keeps reusable CAD content in one released lane.",
			"Advanced automation stays behind Developer until it is ready.",
		],
		ctaLabel: "Open Draft",
		audience: "customer",
	},
	{
		id: "review",
		title: "Review",
		summary:
			"Standards validation, readiness checks, and customer-facing QA summaries.",
		to: "/app/review",
		icon: ShieldCheck,
		points: [
			"Standards Checker is the released review surface.",
			"Readiness and issue-path summaries stay light and project-aware.",
			"Full telemetry remains a developer support surface.",
		],
		ctaLabel: "Open Review",
		audience: "customer",
	},
	{
		id: "developer",
		title: "Developer",
		summary:
			"Control, architecture, and labs stay outside the released customer shell.",
		to: "/app/developer",
		icon: TerminalSquare,
		points: [
			"Watchdog, Command Center, and runtime handoff stay here.",
			"Office owns local agent and orchestration work outside this repo.",
			"Promotion into customer families still requires sign-off.",
		],
		ctaLabel: "Open Developer",
		audience: "dev",
	},
];

const RUNTIME_OWNERSHIP: readonly RuntimeOwnershipLane[] = [
	{
		id: "docker-core",
		label: "Docker core",
		title: "Shared runtime-core lane",
		summary:
			"Frontend, backend, Redis, and the local Supabase lane stay reproducible here.",
	},
	{
		id: "runtime-control",
		label: "Runtime Control",
		title: "Machine-local companion",
		summary:
			"Runtime Control owns start and stop, container observability, workstation identity, and local support bundles.",
	},
	{
		id: "cad-local",
		label: "CAD local",
		title: "CAD and collector execution",
		summary:
			"AutoCAD plugins, collector startup tasks, and workstation-only actions remain local to the machine.",
	},
	{
		id: "local-data",
		label: "Local data",
		title: "Portable by mirror and restore",
		summary:
			"Learning artifacts, SQLite state, JSONL exports, and promoted local models move with mirror and restore, not Docker.",
	},
];

function formatStorage(bytes: number) {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return "0 MB";
	}
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
	return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatDeadline(value: string | null | undefined) {
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

function formatActivityTimestamp(value: string) {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}
	return parsed.toLocaleString([], {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function formatIssueSummary(reviewItemCount: number) {
	if (reviewItemCount <= 0) {
		return "Review clear";
	}
	return `${reviewItemCount} review item${reviewItemCount === 1 ? "" : "s"}`;
}

function resolveDoctorState(
	actionableIssueCount: number,
	loading: boolean,
): TrustState {
	if (loading) {
		return "background";
	}
	return actionableIssueCount > 0 ? "needs-attention" : "ready";
}

export function HomeWorkspace() {
	const { user } = useAuth();
	const isDeveloper = isDevAudience(user);
	const { activities, isLoading, projectTaskCounts, projects, storageUsed } =
		useDashboardOverviewData();
	const deliverySummary = useDashboardDeliverySummary(
		projects,
		projectTaskCounts,
	);
	const { report: suiteDoctorReport, loading: suiteDoctorLoading } =
		useSuiteRuntimeDoctor();

	const nextDeadlineProject = useMemo(() => {
		return [...deliverySummary.projects]
			.filter((project) => project.deadline || project.nextDue?.date)
			.sort((left, right) => {
				const leftDate = left.deadline || left.nextDue?.date || "";
				const rightDate = right.deadline || right.nextDue?.date || "";
				return leftDate.localeCompare(rightDate);
			})[0];
	}, [deliverySummary.projects]);

	const currentProjects = useMemo(
		() => deliverySummary.projects.slice(0, 4),
		[deliverySummary.projects],
	);
	const recentActivities = useMemo(() => activities.slice(0, 5), [activities]);
	const actionableDoctorIssues = suiteDoctorReport?.actionableIssueCount ?? 0;
	const doctorState = resolveDoctorState(
		actionableDoctorIssues,
		suiteDoctorLoading,
	);
	const laneCards = useMemo(
		() =>
			PRODUCT_LANES.filter(
				(lane) => lane.audience === "customer" || isDeveloper,
			),
		[isDeveloper],
	);
	const activeProjectCount = deliverySummary.metrics.totalProjects;
	const releasedToolCount: number = 2;
	const reviewPressureCount = deliverySummary.metrics.reviewPressureCount;
	const projectsReadyCount = deliverySummary.metrics.readyCount;
	const doctorSummary = suiteDoctorLoading
		? "Runtime signals are settling in the background."
		: actionableDoctorIssues > 0
			? `${actionableDoctorIssues} actionable runtime issue${actionableDoctorIssues === 1 ? "" : "s"} still need attention.`
			: "Runtime core and workstation-local companion look aligned.";

	return (
		<div className={styles.root}>
			<PageContextBand
				mode="hero"
				className={styles.hero}
				eyebrow="Home"
				summary={
					<Text size="sm" color="muted" block className={styles.heroSummary}>
						This is the calm suite board: current work, the released product
						families, and the light trust signals needed to move forward without
						opening every tool at once.
					</Text>
				}
				meta={
					<div className={styles.heroMeta}>
						<TrustStateBadge
							state={doctorState}
							label={suiteDoctorLoading ? "Runtime settling" : "Runtime trust"}
						/>
						<Badge color="default" variant="soft" size="sm">
							{activeProjectCount} active project
							{activeProjectCount === 1 ? "" : "s"}
						</Badge>
						<Badge color="default" variant="outline" size="sm">
							{releasedToolCount} released drafting tools
						</Badge>
					</div>
				}
				actions={
					<div className={styles.heroActions}>
						<Link to="/app/projects" className={styles.primaryLink}>
							<span>Open Projects</span>
							<ArrowUpRight size={14} />
						</Link>
						<Link to="/app/draft" className={styles.secondaryLink}>
							<span>Open Draft</span>
						</Link>
					</div>
				}
			>
				<div className={styles.factStrip}>
					<div className={styles.factCard}>
						<span className={styles.factLabel}>Review pressure</span>
						<strong className={styles.factValue}>{reviewPressureCount}</strong>
						<span className={styles.factMeta}>
							Item{reviewPressureCount === 1 ? "" : "s"} waiting in review
						</span>
					</div>
					<div className={styles.factCard}>
						<span className={styles.factLabel}>Ready to issue</span>
						<strong className={styles.factValue}>{projectsReadyCount}</strong>
						<span className={styles.factMeta}>
							Package{projectsReadyCount === 1 ? "" : "s"} ready for release
						</span>
					</div>
					<div className={styles.factCard}>
						<span className={styles.factLabel}>Next date</span>
						<strong className={styles.factValue}>
							{formatDeadline(
								nextDeadlineProject?.deadline ||
									nextDeadlineProject?.nextDue?.date ||
									null,
							)}
						</strong>
						<span className={styles.factMeta}>
							{nextDeadlineProject?.name || "No active deadline"}
						</span>
					</div>
					<div className={styles.factCard}>
						<span className={styles.factLabel}>Repo storage</span>
						<strong className={styles.factValue}>
							{formatStorage(storageUsed)}
						</strong>
						<span className={styles.factMeta}>
							Tracked file payload in scope
						</span>
					</div>
				</div>
			</PageContextBand>

			<Section
				title="Current work"
				description="Open the project notebook first, then move into released drafting and review lanes as needed."
			>
				<div className={styles.currentGrid}>
					<Panel
						variant="feature"
						padding="lg"
						className={styles.primarySurface}
					>
						<div className={styles.panelHeader}>
							<div>
								<Text size="sm" weight="semibold" block>
									Project focus
								</Text>
								<Text size="xs" color="muted" block>
									The highest-signal project lanes, ordered around readiness and
									next deadlines.
								</Text>
							</div>
							<Badge color="accent" variant="soft" size="sm">
								{currentProjects.length} visible
							</Badge>
						</div>

						<div className={styles.projectList}>
							{isLoading && currentProjects.length === 0 ? (
								<div className={styles.emptyState}>
									Project signals are settling in the background.
								</div>
							) : currentProjects.length === 0 ? (
								<div className={styles.emptyState}>
									No active project work is available yet.
								</div>
							) : (
								currentProjects.map((project) => (
									<Link
										key={project.projectId}
										to={buildProjectDetailHref(project.projectId, "setup")}
										className={styles.projectRow}
									>
										<div className={styles.projectRowMain}>
											<div className={styles.projectRowHeader}>
												<div>
													<div className={styles.projectTitle}>
														{project.name}
													</div>
													<div className={styles.projectMeta}>
														{project.summary}
													</div>
												</div>
												<TrustStateBadge
													state={project.state}
													label={project.stateLabel}
													size="sm"
												/>
											</div>
											<div className={styles.projectDetail}>
												{project.detail}
											</div>
											<div className={styles.projectFootnote}>
												<span>
													{formatIssueSummary(project.reviewItemCount)}
												</span>
												<span>
													{formatDeadline(
														project.deadline || project.nextDue?.date,
													)}
												</span>
											</div>
										</div>
										<ArrowUpRight size={15} />
									</Link>
								))
							)}
						</div>
					</Panel>

					<div className={styles.sideStack}>
						<Panel
							variant="support"
							padding="lg"
							className={styles.sideSurface}
						>
							<div className={styles.panelHeader}>
								<div>
									<Text size="sm" weight="semibold" block>
										Recent movement
									</Text>
									<Text size="xs" color="muted" block>
										Short activity context without reopening the old dashboard
										mosaic.
									</Text>
								</div>
							</div>

							<div className={styles.activityList}>
								{recentActivities.length === 0 ? (
									<div className={styles.emptyState}>
										Recent project movement appears here when activity is
										recorded.
									</div>
								) : (
									recentActivities.map((activity) => (
										<div key={activity.id} className={styles.activityRow}>
											<div>
												<div className={styles.activityTitle}>
													{activity.description}
												</div>
												<div className={styles.activityMeta}>
													{activity.project_id ? "Project linked" : "Workspace"}
												</div>
											</div>
											<span className={styles.activityTimestamp}>
												{formatActivityTimestamp(activity.timestamp)}
											</span>
										</div>
									))
								)}
							</div>
						</Panel>

						<Panel
							variant="support"
							padding="lg"
							className={styles.sideSurface}
						>
							<div className={styles.panelHeader}>
								<div>
									<Text size="sm" weight="semibold" block>
										Trust and runtime
									</Text>
									<Text size="xs" color="muted" block>
										Customer shell stays light here. Full telemetry and machine
										diagnostics stay behind Developer and Runtime Control.
									</Text>
								</div>
								<TrustStateBadge state={doctorState} size="sm" />
							</div>
							<p className={styles.runtimeSummary}>{doctorSummary}</p>
							<div className={styles.runtimeFootnotes}>
								<div className={styles.runtimeFootnote}>
									<CalendarDays size={14} />
									<span>Projects owns meetings and calendar context.</span>
								</div>
								<div className={styles.runtimeFootnote}>
									<Workflow size={14} />
									<span>
										Release and transmittal context stays project-aware.
									</span>
								</div>
								<div className={styles.runtimeFootnote}>
									<Clock3 size={14} />
									<span>
										Promotion stays gated until the workflow is stable.
									</span>
								</div>
							</div>
						</Panel>
					</div>
				</div>
			</Section>

			<Section
				title="Product families"
				description="Released customer lanes stay explicit. Unfinished products remain grouped behind Developer."
			>
				<div className={styles.laneGrid}>
					{laneCards.map((lane) => {
						const LaneIcon = lane.icon;
						return (
							<Panel
								key={lane.id}
								variant={lane.id === "projects" ? "feature" : "support"}
								padding="lg"
								className={styles.laneCard}
							>
								<div className={styles.laneHeader}>
									<div className={styles.laneIdentity}>
										<div className={styles.iconShell}>
											<LaneIcon size={17} />
										</div>
										<div>
											<span className={styles.laneEyebrow}>Family</span>
											<h3 className={styles.laneTitle}>{lane.title}</h3>
										</div>
									</div>
									<Badge
										color={lane.id === "developer" ? "default" : "accent"}
										variant="soft"
										size="sm"
									>
										{lane.id === "developer" ? "Developer only" : "Released"}
									</Badge>
								</div>
								<p className={styles.laneSummary}>{lane.summary}</p>
								<ul className={styles.pointList}>
									{lane.points.map((point) => (
										<li key={point}>{point}</li>
									))}
								</ul>
								<Link to={lane.to} className={styles.laneAction}>
									<span>{lane.ctaLabel}</span>
									<ArrowUpRight size={14} />
								</Link>
							</Panel>
						);
					})}
				</div>
			</Section>

			<Section
				title="Runtime ownership"
				description="Docker improves reproducibility for the shared runtime core. Workstation-local tools and data still move through bootstrap, sync, mirror, and restore."
			>
				<div className={styles.ownershipGrid}>
					{RUNTIME_OWNERSHIP.map((lane) => (
						<Panel
							key={lane.id}
							variant="support"
							padding="lg"
							className={styles.ownershipCard}
						>
							<span className={styles.ownershipLabel}>{lane.label}</span>
							<h3 className={styles.ownershipTitle}>{lane.title}</h3>
							<p className={styles.ownershipSummary}>{lane.summary}</p>
						</Panel>
					))}
				</div>
			</Section>

			<Section
				title="Released starting points"
				description="The customer shell now starts from explicit families instead of a generic Apps launcher."
			>
				<div className={styles.startingGrid}>
					<Link
						to="/app/draft/drawing-list-manager"
						className={styles.startingPoint}
					>
						<div className={styles.startingHeader}>
							<Replace size={16} />
							<span>Drawing List Manager</span>
						</div>
						<small>Issued-set indexes and title-block scans.</small>
					</Link>
					<Link to="/app/draft/block-library" className={styles.startingPoint}>
						<div className={styles.startingHeader}>
							<SquareLibrary size={16} />
							<span>Block Library</span>
						</div>
						<small>Reusable CAD assets for released drafting work.</small>
					</Link>
					<Link
						to="/app/review/standards-checker"
						className={styles.startingPoint}
					>
						<div className={styles.startingHeader}>
							<ShieldCheck size={16} />
							<span>Standards Checker</span>
						</div>
						<small>Customer-facing standards and readiness review.</small>
					</Link>
				</div>
			</Section>
		</div>
	);
}
