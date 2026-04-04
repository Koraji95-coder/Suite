import {
	ArrowUpRight,
	BookOpen,
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
import { Badge } from "@/components/system/base/Badge";
import { Button } from "@/components/system/base/Button";
import { Panel } from "@/components/system/base/Panel";
import { Text } from "@/components/system/base/Text";
import { PageContextBand } from "@/components/system/PageContextBand";
import { PageFrame, Section } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";
import { TrustStateBadge } from "@/components/system/TrustStateBadge";
import { useSuiteRuntimeDoctor } from "@/hooks/useSuiteRuntimeDoctor";
import { formatReleaseState } from "@/lib/audience";
import {
	buildSuiteDoctorSummaryModel,
	resolveSuiteDoctorDisplayState,
} from "@/lib/suiteDoctorPresentation";
import styles from "./DeveloperPortalRoutePage.module.css";
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
import { useDeveloperPortalOverviewData } from "./useDeveloperPortalOverviewData";

const GROUP_ICON_MAP: Record<DeveloperToolGroup, typeof ClipboardList> = {
	control: TerminalSquare,
	architecture: Network,
	labs: Wrench,
};

const DESK_ICON_MAP: Record<DeveloperWorkshopDesk["id"], typeof ClipboardList> =
	{
		publishing: ClipboardList,
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
			}),
		[data, loading],
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
		title: "Developer",
		subtitle:
			"Control, architecture, and lab surfaces that stay outside the released customer shell.",
	});

	return (
		<PageFrame maxWidth="xl">
			<div className={styles.root}>
				<PageContextBand
					mode="hero"
					eyebrow="Developer"
					summary={
						<Text size="sm" color="muted" block className={styles.summary}>
							Runtime Control is the machine-local companion door. Use this
							branch for developer-only control surfaces, architecture tooling,
							and labs that should stay outside the released product.{" "}
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
							<Link
								to="/app/developer/control/command-center"
								className={styles.bandActionLink}
							>
								<TerminalSquare className={styles.bandActionIcon} />
								<span>Open Command Center</span>
							</Link>
							<Link
								to="/app/developer/control/docs"
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
									void Promise.all([
										refreshNow(),
										refreshSuiteDoctor("manual"),
									]);
								}}
							>
								Refresh branch
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
					title="Developer pulse"
					description="Two live desks covering publishing evidence and staged automation work."
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
					description="Grouped launch cards for control, architecture, and labs."
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
					</div>
				</Section>

				<Section
					title="Support and diagnostics"
					description="Runtime Control owns the workstation loop, support export, and local logs. Keep the web developer branch focused on rich engineering workflows."
				>
					<div className={styles.supportGrid}>
						<Panel
							variant="support"
							padding="lg"
							className={styles.supportCard}
						>
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
								to="/app/developer/control/command-center"
								>
									<span>Review diagnostics toolshed</span>
									<ArrowUpRight className={styles.actionLinkIcon} />
								</Link>
							</div>
						</Panel>
						<Panel
							variant="support"
							padding="lg"
							className={styles.supportCard}
						>
							<div className={styles.supportHeader}>
								<div className={styles.iconShell}>
									<TerminalSquare className={styles.icon} />
								</div>
								<div>
									<p className={styles.deskEyebrow}>Workshop routing</p>
									<h3 className={styles.supportTitle}>One developer door</h3>
								</div>
							</div>
							<p className={styles.supportDescription}>
								Runtime Control is the machine-local control door. Use this
								portal for grouped launch cards and rich web workflows, not as a
								second runtime console.
							</p>
						</Panel>
					</div>
				</Section>
			</div>
		</PageFrame>
	);
}
