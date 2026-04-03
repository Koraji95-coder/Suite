import { ClipboardList, FileCheck2, ShieldCheck, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import { TrustStateBadge } from "@/components/apps/ui/TrustStateBadge";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import {
	REVIEW_INBOX_FILTER_OPTIONS,
	useProjectReviewWorkspaceState,
} from "./workspaceState";
import { ProjectReviewInboxList } from "./ProjectReviewInboxList";
import styles from "./ProjectReviewInboxWorkspace.module.css";
import type { Project, ViewMode } from "@/features/project-core";
import type { ProjectWatchdogTelemetry } from "@/features/project-watchdog";

interface ProjectReviewInboxWorkspaceProps {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	preferredIssueSetId?: string | null;
	onIssueSetContextChange?: (issueSetId: string | null) => void;
	onOpenViewMode: (mode: ViewMode) => void;
}

export function ProjectReviewInboxWorkspace({
	project,
	telemetry,
	preferredIssueSetId,
	onIssueSetContextChange,
	onOpenViewMode,
}: ProjectReviewInboxWorkspaceProps) {
	const state = useProjectReviewWorkspaceState({
		project,
		telemetry,
		preferredIssueSetId,
		onIssueSetContextChange,
	});

	return (
		<section className={styles.root}>
			<div className={styles.header}>
				<div className={styles.headerCopy}>
					<p className={styles.eyebrow}>Review</p>
					<h4 className={styles.title}>Review inbox</h4>
					<p className={styles.description}>
						Setup blockers, title block drift, standards follow-up, revision
						items, and package work all land here before issue.
					</p>
				</div>
				<TrustStateBadge state={state.reviewInbox.overallState} />
			</div>

			<Panel variant="feature" padding="lg" className={styles.summaryPanel}>
				<div className={styles.summaryTop}>
					<div className={styles.summaryMain}>
						<div className={styles.summaryHeader}>
							<div className={styles.summaryIconShell}>
								<ClipboardList className={styles.summaryIcon} />
							</div>
							<div>
								<h5 className={styles.summaryTitle}>Next action</h5>
								<p className={styles.summaryText}>
									{state.reviewInbox.nextAction}
								</p>
							</div>
						</div>
						<div className={styles.metricRow}>
							<div className={styles.summaryFact}>
								<span className={styles.metricLabel}>Open items</span>
								<strong className={styles.metricValue}>
									{state.reviewInbox.metrics.openCount}
								</strong>
							</div>
							<div className={styles.summaryFact}>
								<span className={styles.metricLabel}>Needs decision</span>
								<strong className={styles.metricValue}>
									{state.packageFollowUpCount}
								</strong>
							</div>
						</div>
						<p className={styles.summaryNote}>{state.summaryNote}</p>
						<div className={styles.laneStrip}>
							{state.reviewLanes.map((lane) => (
								<div
									key={lane.id}
									className={`${styles.laneCard} ${
										lane.state === "needs-attention"
											? styles.laneCardNeedsAttention
											: lane.state === "background"
												? styles.laneCardBackground
												: styles.laneCardReady
									}`}
								>
									<div className={styles.laneHeader}>
										<span className={styles.laneLabel}>{lane.label}</span>
										<Badge
											color={
												lane.state === "needs-attention"
													? "warning"
													: lane.state === "background"
														? "accent"
														: "success"
											}
											variant="soft"
										>
											{lane.count > 0 ? lane.count : "Clear"}
										</Badge>
									</div>
									<p className={styles.laneDetail}>{lane.detail}</p>
								</div>
							))}
						</div>
					</div>
					<div className={styles.summaryActions}>
						<Button
							variant="primary"
							size="md"
							iconRight={<FileCheck2 size={16} />}
							onClick={() => onOpenViewMode("issue-sets")}
						>
							Open issue sets
						</Button>
						<div className={styles.utilityLinks}>
							<Link to={state.drawingListHref} className={styles.utilityLink}>
								<FileCheck2 className={styles.linkIcon} />
								<span>Title block review</span>
							</Link>
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
				</div>

				<div className={styles.workflowDivider} />

				<div className={styles.inboxHeader}>
					<div>
						<h5 className={styles.inboxTitle}>Open items</h5>
						<p className={styles.inboxCopy}>
							Filter the queue by source so review work is clear instead of
							scattered between tools.
						</p>
					</div>
				</div>

				<div className={styles.filterRow}>
					{REVIEW_INBOX_FILTER_OPTIONS.map((option) => (
						<button
							key={option.id}
							type="button"
							className={
								state.filter === option.id
									? `${styles.filterChip} ${styles.filterChipActive}`
									: styles.filterChip
							}
							onClick={() => state.setFilter(option.id)}
						>
							{option.label}
						</button>
					))}
				</div>

				<ProjectReviewInboxList
					items={state.filteredItems}
					onOpenViewMode={onOpenViewMode}
					emptyText="No review items match this filter right now."
					onRunQuickAction={state.handleQuickAction}
					pendingActionId={state.pendingActionId}
				/>
			</Panel>

			{state.reviewInbox.messages.length > 0 ? (
				<div className={styles.noticeList}>
					{state.reviewInbox.messages.map((message) => (
						<p key={message} className={styles.notice}>
							{message}
						</p>
					))}
				</div>
			) : null}
		</section>
	);
}

