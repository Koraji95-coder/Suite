import {
	ArrowUpRight,
	ClipboardCheck,
	FolderKanban,
	ShieldCheck,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PageContextBand } from "@/components/system/PageContextBand";
import { Section } from "@/components/system/PageFrame";
import {
	TrustStateBadge,
	type TrustState,
} from "@/components/system/TrustStateBadge";
import { Badge } from "@/components/system/base/Badge";
import { Panel } from "@/components/system/base/Panel";
import { Text } from "@/components/system/base/Text";
import { useDashboardDeliverySummary } from "@/features/project-overview/useDashboardDeliverySummary";
import { useDashboardOverviewData } from "@/features/project-overview/useDashboardOverviewData";
import { useSuiteRuntimeDoctor } from "@/hooks/useSuiteRuntimeDoctor";
import { buildProjectDetailHref } from "@/lib/projectWorkflowNavigation";
import styles from "./ReviewWorkspace.module.css";

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

function resolveDoctorState(
	actionableIssueCount: number,
	loading: boolean,
): TrustState {
	if (loading) {
		return "background";
	}
	return actionableIssueCount > 0 ? "needs-attention" : "ready";
}

export function ReviewWorkspace() {
	const { isLoading, projectTaskCounts, projects } = useDashboardOverviewData();
	const deliverySummary = useDashboardDeliverySummary(projects, projectTaskCounts);
	const {
		report: suiteDoctorReport,
		loading: suiteDoctorLoading,
	} = useSuiteRuntimeDoctor();

	const reviewProjects = useMemo(
		() =>
			deliverySummary.projects
				.filter(
					(project) =>
						project.reviewItemCount > 0 ||
						project.issueSetStatus === "review" ||
						project.issueSetStatus === "ready",
				)
				.slice(0, 5),
		[deliverySummary.projects],
	);
	const actionableDoctorIssues = suiteDoctorReport?.actionableIssueCount ?? 0;
	const doctorState = resolveDoctorState(
		actionableDoctorIssues,
		suiteDoctorLoading,
	);
	const reviewSignals = [
		{
			label: "Review items",
			value: deliverySummary.metrics.reviewPressureCount,
			meta: "Open blockers across the current released project scope",
		},
		{
			label: "Projects in review",
			value: deliverySummary.metrics.reviewProjectCount,
			meta: "Projects still carrying review pressure",
		},
		{
			label: "Ready for issue",
			value: deliverySummary.metrics.readyCount,
			meta: "Packages that can move into release and transmittal work",
		},
		{
			label: "Due soon",
			value: deliverySummary.metrics.dueSoonCount,
			meta: "Project dates landing in the next seven days",
		},
	];
	const doctorSummary = suiteDoctorLoading
		? "Runtime trust is settling in the background."
		: actionableDoctorIssues > 0
			? `${actionableDoctorIssues} actionable runtime issue${actionableDoctorIssues === 1 ? "" : "s"} still need attention. Full telemetry remains in Developer.`
			: "Customer-facing review surfaces are clear. Full telemetry stays in Developer > Control.";

	return (
		<div className={styles.root}>
			<PageContextBand
				mode="hero"
				className={styles.hero}
				eyebrow="Review"
				summary={
					<Text size="sm" color="muted" block className={styles.heroSummary}>
						Review stays focused on released QA and readiness work: standards,
						project readiness, and clear issue-path signals. Full telemetry and
						machine diagnostics remain behind Developer.
					</Text>
				}
				meta={
					<div className={styles.heroMeta}>
						<TrustStateBadge state={doctorState} label="Runtime trust" />
						<Badge color="accent" variant="soft" size="sm">
							Standards Checker released
						</Badge>
					</div>
				}
				actions={
					<div className={styles.heroActions}>
						<Link to="/app/review/standards-checker" className={styles.primaryLink}>
							<span>Open Standards Checker</span>
							<ArrowUpRight size={14} />
						</Link>
						<Link
							to="/app/projects?section=review"
							className={styles.secondaryLink}
						>
							<span>Open Project Review</span>
						</Link>
					</div>
				}
			>
				<div className={styles.signalStrip}>
					{reviewSignals.map((signal) => (
						<div key={signal.label} className={styles.signalCard}>
							<span className={styles.signalLabel}>{signal.label}</span>
							<strong className={styles.signalValue}>{signal.value}</strong>
							<span className={styles.signalMeta}>{signal.meta}</span>
						</div>
					))}
				</div>
			</PageContextBand>

			<Section
				title="Review priorities"
				description="The most relevant review lanes surface here without exposing the full developer telemetry console."
			>
				<div className={styles.priorityGrid}>
					<Panel variant="feature" padding="lg" className={styles.priorityCard}>
						<div className={styles.panelHeader}>
							<div>
								<Text size="sm" weight="semibold" block>
									Project review queue
								</Text>
								<Text size="xs" color="muted" block>
									Projects carrying review pressure, active review status, or
									ready-for-issue package work.
								</Text>
							</div>
							<Badge color="accent" variant="soft" size="sm">
								{reviewProjects.length} visible
							</Badge>
						</div>

						<div className={styles.projectList}>
							{isLoading && reviewProjects.length === 0 ? (
								<div className={styles.emptyState}>
									Review signals are settling in the background.
								</div>
							) : reviewProjects.length === 0 ? (
								<div className={styles.emptyState}>
									No released review work is currently in scope.
								</div>
							) : (
								reviewProjects.map((project) => (
									<Link
										key={project.projectId}
										to={buildProjectDetailHref(project.projectId, "review")}
										className={styles.projectRow}
									>
										<div className={styles.projectRowMain}>
											<div className={styles.projectRowHeader}>
												<div>
													<div className={styles.projectTitle}>{project.name}</div>
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
											<div className={styles.projectDetail}>{project.detail}</div>
											<div className={styles.projectFootnote}>
												<span>
													{project.reviewItemCount > 0
														? `${project.reviewItemCount} review item${project.reviewItemCount === 1 ? "" : "s"}`
														: "No review blockers"}
												</span>
												<span>{formatDeadline(project.deadline || project.nextDue?.date)}</span>
											</div>
										</div>
										<ArrowUpRight size={15} />
									</Link>
								))
							)}
						</div>
					</Panel>

					<div className={styles.sideStack}>
						<Panel variant="support" padding="lg" className={styles.supportCard}>
							<div className={styles.panelHeader}>
								<div>
									<Text size="sm" weight="semibold" block>
										Released review surfaces
									</Text>
									<Text size="xs" color="muted" block>
										The customer-facing review lane stays narrow and deliberate.
									</Text>
								</div>
							</div>
							<div className={styles.surfaceList}>
								<Link
									to="/app/review/standards-checker"
									className={styles.surfaceRow}
								>
									<div className={styles.surfaceHeader}>
										<ShieldCheck size={16} />
										<span>Standards Checker</span>
									</div>
									<small>Released standards validation for engineering deliverables.</small>
								</Link>
								<Link
									to="/app/projects?section=review"
									className={styles.surfaceRow}
								>
									<div className={styles.surfaceHeader}>
										<FolderKanban size={16} />
										<span>Project review notebook</span>
									</div>
									<small>Review inbox, readiness, and issue-path context stay project-aware.</small>
								</Link>
								<Link
									to="/app/projects?section=review&panel=readiness"
									className={styles.surfaceRow}
								>
									<div className={styles.surfaceHeader}>
										<ClipboardCheck size={16} />
										<span>Readiness summary</span>
									</div>
									<small>Package readiness sits close to project delivery context.</small>
								</Link>
							</div>
						</Panel>

						<Panel variant="support" padding="lg" className={styles.supportCard}>
							<div className={styles.panelHeader}>
								<div>
									<Text size="sm" weight="semibold" block>
										Trust and escalation
									</Text>
									<Text size="xs" color="muted" block>
										Customer review stays light. Escalate into Developer only
										when deeper telemetry or machine-local support is needed.
									</Text>
								</div>
								<TrustStateBadge state={doctorState} size="sm" />
							</div>
							<p className={styles.supportCopy}>{doctorSummary}</p>
							<Link to="/app/developer" className={styles.supportLink}>
								<span>Open Developer branch</span>
								<ArrowUpRight size={14} />
							</Link>
						</Panel>
					</div>
				</div>
			</Section>
		</div>
	);
}
