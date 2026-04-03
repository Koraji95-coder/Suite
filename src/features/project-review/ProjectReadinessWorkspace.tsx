import {
	ClipboardCheck,
	FileCheck2,
	FolderTree,
	ShieldCheck,
	Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";
import { TrustStateBadge } from "@/components/apps/ui/TrustStateBadge";
import { Panel } from "@/components/primitives/Panel";
import { ProjectDeliverableRegisterPanel } from "@/features/project-delivery";
import { cn } from "@/lib/utils";
import styles from "./ProjectReadinessWorkspace.module.css";
import { ProjectReviewInboxList } from "./ProjectReviewInboxList";
import { useProjectReadinessWorkspaceState } from "./workspaceState";
import type { Project, ViewMode } from "@/features/project-core";
import type { ProjectWatchdogTelemetry } from "@/features/project-watchdog";

interface ProjectReadinessWorkspaceProps {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	preferredIssueSetId?: string | null;
	onIssueSetContextChange?: (issueSetId: string | null) => void;
	onOpenViewMode: (mode: ViewMode) => void;
}

export function ProjectReadinessWorkspace({
	project,
	telemetry,
	preferredIssueSetId,
	onIssueSetContextChange,
	onOpenViewMode,
}: ProjectReadinessWorkspaceProps) {
	const state = useProjectReadinessWorkspaceState({
		project,
		telemetry,
		preferredIssueSetId,
		onIssueSetContextChange,
	});

	return (
		<section className={styles.root}>
			<div className={styles.header}>
				<div className={styles.headerCopy}>
					<p className={styles.eyebrow}>Issue readiness</p>
					<h4 className={styles.title}>Project readiness</h4>
					<p className={styles.description}>
						Check whether the project is ready for package work, then clear
						blockers from one inbox.
					</p>
				</div>
				<TrustStateBadge state={state.overallState} />
			</div>

			<Panel variant="feature" padding="lg" className={styles.summaryPanel}>
				<div className={styles.summaryMain}>
					<div className={styles.summaryHeader}>
						<div className={styles.summaryIconShell}>
							<ClipboardCheck className={styles.summaryIcon} />
						</div>
						<div>
							<h5 className={styles.summaryTitle}>Next action</h5>
							<p className={styles.summaryText}>{state.inbox.nextAction}</p>
						</div>
					</div>
					<div className={styles.metricRow}>
						<div className={styles.summaryFact}>
							<span className={styles.metricLabel}>Drawings scanned</span>
							<strong className={styles.metricValue}>{state.drawingsScanned}</strong>
						</div>
						<div className={styles.summaryFact}>
							<span className={styles.metricLabel}>Inbox items</span>
							<strong className={styles.metricValue}>
								{state.inbox.metrics.openCount}
							</strong>
						</div>
					</div>
				</div>
				<div className={styles.summaryActions}>
					<Link to={state.drawingListHref} className={styles.primaryLink}>
						<FileCheck2 className={styles.linkIcon} />
						<span>Open title block review</span>
					</Link>
					<div className={styles.actionRow}>
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={() => onOpenViewMode("review")}
						>
							<ClipboardCheck className={styles.linkIcon} />
							<span>Open review inbox</span>
						</button>
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={() => onOpenViewMode("issue-sets")}
						>
							<ClipboardCheck className={styles.linkIcon} />
							<span>Open issue sets</span>
						</button>
					</div>
					<div className={styles.utilityLinks}>
						<Link to={state.standardsHref} className={styles.utilityLink}>
							<ShieldCheck className={styles.linkIcon} />
							<span>Standards Checker</span>
						</Link>
						<Link to={state.transmittalHref} className={styles.utilityLink}>
							<Workflow className={styles.linkIcon} />
							<span>Transmittal Builder</span>
						</Link>
					</div>
				</div>
			</Panel>

			<ProjectDeliverableRegisterPanel
				projectId={project.id}
				projectName={project.name}
				projectRootPath={project.watchdog_root_path}
				metadataRows={state.inbox.scan?.rows ?? []}
				onSnapshotChange={state.inbox.refresh}
			/>

			<div className={styles.cardGrid}>
				{state.cards.map((card) => (
					<article
						key={card.id}
						className={cn(
							styles.statusRow,
							card.state === "ready" && styles.statusRowReady,
							card.state === "needs-attention" && styles.statusRowNeedsAttention,
							card.state === "background" && styles.statusRowBackground,
						)}
					>
						<div className={styles.statusCopy}>
							<p className={styles.cardEyebrow}>{card.title}</p>
							<h5 className={styles.cardTitle}>{card.summary}</h5>
							<p className={styles.cardDetail}>{card.detail}</p>
						</div>
						<div className={styles.statusAside}>
							<TrustStateBadge state={card.state} size="sm" />
						</div>
					</article>
				))}
			</div>

			<Panel variant="support" padding="lg" className={styles.inboxPanel}>
				<div className={styles.inboxHeader}>
					<div>
						<h5 className={styles.inboxTitle}>Review inbox</h5>
						<p className={styles.inboxCopy}>
							Setup blockers, title block review, standards drift, and
							revision work land here first.
						</p>
					</div>
				</div>

				<ProjectReviewInboxList
					items={state.previewItems}
					onOpenViewMode={onOpenViewMode}
					emptyText="No project review items are open right now."
				/>

				{state.inbox.items.length > state.previewItems.length ? (
					<div className={styles.previewFooter}>
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={() => onOpenViewMode("review")}
						>
							Open full inbox
						</button>
					</div>
				) : null}
			</Panel>

			{state.inbox.messages.length > 0 ? (
				<div className={styles.noticeList}>
					{state.inbox.messages.map((message) => (
						<p key={message} className={styles.notice}>
							{message}
						</p>
					))}
				</div>
			) : null}

			<Panel variant="support" padding="lg" className={styles.supportPanel}>
				<div className={styles.supportPanelHeader}>
					<div>
						<p className={styles.supportPanelEyebrow}>Support lanes</p>
						<h5 className={styles.supportPanelTitle}>Setup and files</h5>
						<p className={styles.supportPanelCopy}>
							Keep setup, mapping, and file records aligned so package work
							does not drift.
						</p>
					</div>
				</div>
				<div className={styles.supportPanelGrid}>
					<div className={styles.supportCard}>
						<div className={styles.supportCardCopy}>
							<p className={styles.supportCardEyebrow}>Setup checklist</p>
							<h6 className={styles.supportCardTitle}>Project setup</h6>
							<p className={styles.supportCardDescription}>
								Confirm the root, title block defaults, and derived
								.wdp/.wdt/.wdl files before package work starts.
							</p>
						</div>
						<div className={styles.supportCardActions}>
							<Link to={state.setupHref} className={styles.utilityLink}>
								<FolderTree className={styles.linkIcon} />
								<span>Open Setup</span>
							</Link>
						</div>
					</div>
					<div className={styles.supportCard}>
						<div className={styles.supportCardCopy}>
							<p className={styles.supportCardEyebrow}>Files and journals</p>
							<h6 className={styles.supportCardTitle}>Files & activity</h6>
							<p className={styles.supportCardDescription}>
								Open file records, mapping rules, drawing journals, and recent
								CAD activity from one support lane.
							</p>
						</div>
						<div className={styles.supportCardActions}>
							<button
								type="button"
								className={styles.secondaryButton}
								onClick={() => onOpenViewMode("files")}
							>
								Open files & activity
							</button>
							<Link to={state.watchdogHref} className={styles.utilityLink}>
								<Workflow className={styles.linkIcon} />
								<span>Open Watchdog</span>
							</Link>
						</div>
					</div>
				</div>
			</Panel>
		</section>
	);
}

