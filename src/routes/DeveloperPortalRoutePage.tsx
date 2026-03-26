import {
	ArrowUpRight,
	BookOpen,
	Bot,
	ClipboardList,
	Download,
	Network,
	RefreshCw,
	TerminalSquare,
	Wrench,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame, Section } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import { TrustStateBadge } from "@/components/apps/ui/TrustStateBadge";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { Text } from "@/components/primitives/Text";
import { useSuiteRuntimeDoctor } from "@/hooks/useSuiteRuntimeDoctor";
import { formatReleaseState } from "@/lib/audience";
import {
	buildSuiteDoctorSummaryModel,
	resolveSuiteDoctorDisplayState,
} from "@/lib/suiteDoctorPresentation";
import { useAgentConnectionStatus } from "@/services/useAgentConnectionStatus";
import {
	DEVELOPER_TOOL_GROUPS,
	DEVELOPER_TOOL_MANIFEST,
	type DeveloperToolGroup,
} from "./developerToolsManifest";
import {
	buildDeveloperWorkshopDesks,
	buildDeveloperWorkshopSignals,
	type DeveloperWorkshopDesk,
} from "./developerWorkshopPresentation";
import styles from "./DeveloperPortalRoutePage.module.css";
import { useDeveloperPortalOverviewData } from "./useDeveloperPortalOverviewData";

const GROUP_ICON_MAP: Record<DeveloperToolGroup, typeof ClipboardList> = {
	"publishing-evidence": ClipboardList,
	"automation-lab": Wrench,
	"agent-lab": Bot,
	"architecture-code": Network,
	"developer-docs": BookOpen,
};

const DESK_ICON_MAP: Record<DeveloperWorkshopDesk["id"], typeof ClipboardList> =
	{
		publishing: ClipboardList,
		agents: Bot,
		automation: Wrench,
	};

export default function DeveloperPortalRoutePage() {
	const { user } = useAuth();
	const { data, loading, refreshing, refreshNow } =
		useDeveloperPortalOverviewData(user?.id);
	const {
		report: suiteDoctorReport,
		loading: suiteDoctorLoading,
		refreshing: suiteDoctorRefreshing,
		refreshNow: refreshSuiteDoctor,
	} = useSuiteRuntimeDoctor();
	const agentConnection = useAgentConnectionStatus({
		userId: user?.id,
	});

	const toolGroups = useMemo(
		() =>
			DEVELOPER_TOOL_GROUPS.map((group) => ({
				...group,
				items: DEVELOPER_TOOL_MANIFEST.filter(
					(item) => item.group === group.id,
				),
			})).filter((group) => group.items.length > 0),
		[],
	);
	const workshopSignals = useMemo(
		() =>
			buildDeveloperWorkshopSignals({
				data,
				loading,
				suiteDoctorReport,
				suiteDoctorLoading,
			}),
		[loading, data, suiteDoctorLoading, suiteDoctorReport],
	);
	const workshopDesks = useMemo(
		() =>
			buildDeveloperWorkshopDesks({
				data,
				loading,
				agentConnection: {
					paired: agentConnection.paired,
					healthy: agentConnection.healthy,
					error: agentConnection.error || data.agents.error || "",
					loading: agentConnection.loading,
				},
			}),
		[
			agentConnection.error,
			agentConnection.healthy,
			agentConnection.loading,
			agentConnection.paired,
			data,
			loading,
		],
	);
	const suiteDoctorState = resolveSuiteDoctorDisplayState(
		suiteDoctorReport,
		suiteDoctorLoading,
	);
	const suiteDoctorSummary = buildSuiteDoctorSummaryModel(
		suiteDoctorReport,
		suiteDoctorLoading,
	);
	const developerBetaCount = DEVELOPER_TOOL_MANIFEST.filter(
		(item) => item.releaseState === "developer_beta",
	).length;
	const labCount = DEVELOPER_TOOL_MANIFEST.filter(
		(item) => item.releaseState === "lab",
	).length;

	useRegisterPageHeader({
		title: "Developer Portal",
		subtitle:
			"Developer-only workshop for publishing, automation labs, architecture tooling, and workstation launch surfaces.",
	});

	return (
		<PageFrame maxWidth="xl">
			<div className={styles.root}>
				<PageContextBand
					mode="hero"
					eyebrow="Developer workshop"
					summary={
						<Text size="sm" color="muted" block className={styles.summary}>
							Runtime Control is the primary workshop door. Use this portal for
							developer-only web tools, staged future product surfaces, and the
							rich workflows that should stay outside the released product.{" "}
							{suiteDoctorSummary.summary}
						</Text>
					}
					meta={
						<div className={styles.heroMeta}>
							<TrustStateBadge state={suiteDoctorState} label="Suite doctor" />
							<Badge color="default" variant="soft" size="sm">
								{developerBetaCount} developer beta
								{developerBetaCount === 1 ? "" : "s"}
							</Badge>
							<Badge color="default" variant="outline" size="sm">
								{labCount} lab surface{labCount === 1 ? "" : "s"}
							</Badge>
						</div>
					}
					actions={
						<div className={styles.bandActions}>
							<Link to="/app/command-center" className={styles.bandActionLink}>
								<TerminalSquare className={styles.bandActionIcon} />
								<span>Open Command Center</span>
							</Link>
							<Link
								to="/app/developer/docs"
								className={styles.bandActionLinkSecondary}
							>
								<BookOpen className={styles.bandActionIcon} />
								<span>Open Developer Docs</span>
							</Link>
							<Button
								variant="outline"
								size="sm"
								loading={
									(refreshing || suiteDoctorRefreshing) &&
									loading === false &&
									suiteDoctorLoading === false
								}
								iconLeft={<RefreshCw size={14} />}
								onClick={() => {
									void Promise.all([refreshNow(), refreshSuiteDoctor("manual")]);
								}}
							>
								Refresh workshop
							</Button>
						</div>
					}
				>
					<div className={styles.signalGrid}>
						{workshopSignals.map((signal) => (
							<div key={signal.id} className={styles.signalCard}>
								<span className={styles.signalLabel}>{signal.label}</span>
								<strong className={styles.signalValue}>{signal.value}</strong>
								<span className={styles.signalMeta}>{signal.meta}</span>
							</div>
						))}
					</div>
				</PageContextBand>

				<Section
					title="Workshop pulse"
					description="Three live desks for publishing, experimental agent work, and staged automation."
				>
					<div className={styles.deskGrid}>
						{workshopDesks.map((desk) => {
							const DeskIcon = DESK_ICON_MAP[desk.id];
							return (
								<Panel
									key={desk.id}
									variant={desk.tone}
									padding="lg"
									className={styles.deskCard}
								>
									<div className={styles.deskHeader}>
										<div className={styles.deskIdentity}>
											<div className={styles.iconShell}>
												<DeskIcon className={styles.icon} />
											</div>
											<div>
												<p className={styles.deskEyebrow}>{desk.eyebrow}</p>
												<h3 className={styles.deskTitle}>{desk.title}</h3>
											</div>
										</div>
										<TrustStateBadge state={desk.state} />
									</div>
									<p className={styles.deskDescription}>{desk.description}</p>
									<div className={styles.statStrip}>
										{desk.stats.map((stat) => (
											<div key={stat.label} className={styles.statItem}>
												<span className={styles.metricLabel}>{stat.label}</span>
												<strong className={styles.metricValue}>
													{stat.value}
												</strong>
											</div>
										))}
									</div>
									<div className={styles.detailList}>
										{desk.details.map((detail) => (
											<div key={detail.label} className={styles.detailItem}>
												<span className={styles.detailLabel}>
													{detail.label}
												</span>
												<strong className={styles.detailValue}>
													{detail.value}
												</strong>
												{detail.meta ? (
													<span className={styles.detailMeta}>
														{detail.meta}
													</span>
												) : null}
											</div>
										))}
									</div>
									<div className={styles.actionRow}>
										<Link className={styles.actionLink} to={desk.actionRoute}>
											<span>{desk.actionLabel}</span>
											<ArrowUpRight className={styles.actionLinkIcon} />
										</Link>
									</div>
								</Panel>
							);
						})}
					</div>
				</Section>

				<Section
					title="Developer workbenches"
					description="Grouped launch cards for publishing, labs, architecture, and developer docs."
				>
					<div className={styles.stagedGrid}>
						{toolGroups.map((group) => {
							const GroupIcon = GROUP_ICON_MAP[group.id];
							return (
								<Panel
									key={group.id}
									variant="support"
									padding="lg"
									className={styles.groupCard}
								>
									<div className={styles.stagedHeader}>
										<div className={styles.surfaceIdentity}>
											<div className={styles.iconShell}>
												<GroupIcon className={styles.icon} />
											</div>
											<div className={styles.surfaceCopy}>
												<span className={styles.surfaceTag}>Workbench</span>
												<h3 className={styles.surfaceTitle}>{group.title}</h3>
											</div>
										</div>
										<Badge color="default" variant="soft">
											{group.items.length}
										</Badge>
									</div>
									<p className={styles.surfaceDescription}>
										{group.description}
									</p>
									<div className={styles.toolList}>
										{group.items.map((item) => (
											<div key={item.id} className={styles.toolRow}>
												<div className={styles.toolRowHeader}>
													<div className={styles.surfaceCopy}>
														<span className={styles.detailLabel}>
															{item.title}
														</span>
														<strong className={styles.detailValue}>
															{item.description}
														</strong>
													</div>
													<Link
														className={styles.actionLinkMuted}
														to={item.route}
													>
														<span>Open</span>
														<ArrowUpRight className={styles.actionLinkIcon} />
													</Link>
												</div>
												<div className={styles.pillRow}>
													<Badge color="default" variant="soft">
														{formatReleaseState(item.releaseState)}
													</Badge>
													{item.futureProduct ? (
														<Badge color="accent" variant="soft">
															Future product
														</Badge>
													) : (
														<Badge color="default" variant="outline">
															Developer-only
														</Badge>
													)}
												</div>
											</div>
										))}
									</div>
								</Panel>
							);
						})}

						<Panel
							variant="feature"
							padding="lg"
							className={styles.toolshedCard}
						>
							<div className={styles.deskHeader}>
								<div className={styles.deskIdentity}>
									<div className={styles.iconShell}>
										<TerminalSquare className={styles.icon} />
									</div>
									<div>
										<p className={styles.deskEyebrow}>Diagnostics toolshed</p>
										<h3 className={styles.deskTitle}>Command Center</h3>
									</div>
								</div>
								<Badge color="default" variant="soft">
									Dev only
								</Badge>
							</div>
							<p className={styles.deskDescription}>
								Keep runtime doctor, local stack diagnostics, and incident-only
								controls here while Runtime Control owns the workstation start,
								stop, and health loop.
							</p>
							<div className={styles.statStrip}>
								<div className={styles.statItem}>
									<span className={styles.metricLabel}>Developer beta</span>
									<strong className={styles.metricValue}>
										{developerBetaCount}
									</strong>
								</div>
								<div className={styles.statItem}>
									<span className={styles.metricLabel}>Lab</span>
									<strong className={styles.metricValue}>{labCount}</strong>
								</div>
							</div>
							<div className={styles.actionRow}>
								<Link className={styles.actionLink} to="/app/command-center">
									<span>Open Command Center</span>
									<ArrowUpRight className={styles.actionLinkIcon} />
								</Link>
							</div>
						</Panel>
					</div>
				</Section>

				<Section
					title="Support and diagnostics"
					description="Runtime Control owns the workstation loop, support export, and local logs. Keep the web workshop focused on rich developer workflows."
				>
					<div className={styles.supportGrid}>
						<Panel variant="support" padding="lg" className={styles.supportCard}>
							<div className={styles.supportHeader}>
								<div className={styles.iconShell}>
									<Download className={styles.icon} />
								</div>
								<div>
									<p className={styles.deskEyebrow}>Support bundle</p>
									<h3 className={styles.supportTitle}>
										Runtime Control export
									</h3>
								</div>
							</div>
							<p className={styles.supportDescription}>
								Export the shared runtime snapshot, doctor report, bootstrap
								logs, and Watchdog evidence from Runtime Control so support data
								comes from one place.
							</p>
							<div className={styles.actionRow}>
								<Link
									className={styles.actionLinkMuted}
									to="/app/command-center"
								>
									<span>Review diagnostics toolshed</span>
									<ArrowUpRight className={styles.actionLinkIcon} />
								</Link>
							</div>
						</Panel>
						<Panel variant="support" padding="lg" className={styles.supportCard}>
							<div className={styles.supportHeader}>
								<div className={styles.iconShell}>
									<TerminalSquare className={styles.icon} />
								</div>
								<div>
									<p className={styles.deskEyebrow}>Workshop routing</p>
									<h3 className={styles.supportTitle}>One workshop door</h3>
								</div>
							</div>
							<p className={styles.supportDescription}>
								Runtime Control is the local workshop front door. Use this portal
								for grouped launch cards and rich web workflows, not as a second
								runtime console.
							</p>
						</Panel>
					</div>
				</Section>
			</div>
		</PageFrame>
	);
}
