import {
	Check,
	ClipboardList,
	House,
	Loader2,
	Network,
	RefreshCw,
	Undo2,
	WifiOff,
	Zap,
} from "lucide-react";
import { Badge } from "@/components/primitives/Badge";
import { HStack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import type {
	AgentActivityItem,
	AgentReviewAction,
	AgentTaskItem,
	AgentTaskPriority,
} from "@/services/agent/types";
import { AgentPixelMark } from "./AgentPixelMark";
import styles from "./AgentChatPanel.module.css";
import type { AgentChannelScope } from "./agentChannelScope";
import type { AgentMarkState } from "./agentMarkState";
import { AGENT_PROFILE_IDS, type AgentProfile, type AgentProfileId } from "./agentProfiles";
import {
	ACTIVITY_DETAIL_PREVIEW_CHARS,
	AGENT_NETWORK_NODES,
	OPEN_QUEUE_STATUSES,
	type ActivitySourceFilter,
	type ProfileRosterEntry,
	type QueuePriorityFilter,
	type QueueProfileFilter,
	type QueueRunFilter,
	type QueueStatusFilter,
	STATUS_FILTERS,
	activityTone,
	deriveActivityDetail,
	formatTimestamp,
	priorityColor,
	runConversationTitle,
	shortRunId,
	statusColor,
	truncateText,
} from "./agentChatPanelSelectors";

type AgentChatProfileSummary = Pick<AgentProfile, "name" | "tagline" | "focus">;

export function AgentChatEmptyState({
	profile,
	profileId,
	templates,
	isReady,
	avatarState,
	onTemplateClick,
}: {
	profile: AgentChatProfileSummary;
	profileId: AgentProfileId;
	templates: Array<{ label: string; prompt: string }>;
	isReady: boolean;
	avatarState: AgentMarkState;
	onTemplateClick: (prompt: string) => void;
}) {
	return (
		<div className={styles.emptyRoot}>
			<div className={styles.emptyAmbient} />
			<div className={styles.emptyContent}>
				<div className={styles.emptyAvatarWrap}>
					<AgentPixelMark
						profileId={profileId}
						size={176}
						detailLevel="auto"
						state={avatarState}
					/>
				</div>
				<h2 className={styles.emptyTitle}>{profile.name}</h2>
				<p className={styles.emptyTagline}>{profile.tagline}</p>
				<p className={styles.emptyFocus}>{profile.focus}</p>

				{!isReady ? (
					<HStack
						gap={2}
						align="center"
						className={cn(styles.statusPill, styles.statusPillWarning)}
					>
						<WifiOff size={14} className={styles.warningIcon} />
						<Text size="sm" color="warning">
							Waiting for connection...
						</Text>
					</HStack>
				) : (
					<HStack
						gap={2}
						align="center"
						className={cn(styles.statusPill, styles.statusPillSuccess)}
					>
						<div className={styles.readyDot} />
						<Text size="sm" color="success">
							Ready to assist
						</Text>
					</HStack>
				)}

				{templates.length > 0 && isReady && (
					<div className={styles.templateGrid}>
						{templates.slice(0, 4).map((template) => (
							<button
								key={template.label}
								type="button"
								onClick={() => onTemplateClick(template.prompt)}
								className={styles.templateCard}
							>
								<Zap size={14} />
								<span>{template.label}</span>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

export function AgentChatLeftRail({
	channelScope,
	taskItems,
	profileRoster,
	profileStateById,
	resolvedProfiles,
	showQueueRefreshSpinner,
	priorityFilter,
	priorityCounts,
	statusFilter,
	queueProfileFilter,
	queueRunFilter,
	availableRunIds,
	filteredQueueTasks,
	onApplyChannelScope,
	onRefreshQueue,
	onTogglePriorityFilter,
	onStatusFilterChange,
	onQueueProfileFilterChange,
	onQueueRunFilterChange,
	onOpenRunConversation,
}: {
	channelScope: AgentChannelScope;
	taskItems: AgentTaskItem[];
	profileRoster: ProfileRosterEntry[];
	profileStateById: Partial<Record<AgentProfileId, AgentMarkState>>;
	resolvedProfiles: Record<AgentProfileId, AgentProfile>;
	showQueueRefreshSpinner: boolean;
	priorityFilter: QueuePriorityFilter;
	priorityCounts: Record<AgentTaskPriority, number>;
	statusFilter: QueueStatusFilter;
	queueProfileFilter: QueueProfileFilter;
	queueRunFilter: QueueRunFilter;
	availableRunIds: string[];
	filteredQueueTasks: AgentTaskItem[];
	onApplyChannelScope: (scope: AgentChannelScope) => void;
	onRefreshQueue: () => void;
	onTogglePriorityFilter: (priority: AgentTaskPriority) => void;
	onStatusFilterChange: (value: QueueStatusFilter) => void;
	onQueueProfileFilterChange: (value: QueueProfileFilter) => void;
	onQueueRunFilterChange: (value: QueueRunFilter) => void;
	onOpenRunConversation: (runId: string) => void;
}) {
	return (
		<div className={styles.leftRail}>
			<div className={styles.railCard}>
				<div className={styles.railHeaderRow}>
					<Text size="xs" weight="semibold" className={styles.railEyebrow}>
						Agents
					</Text>
					<Badge size="sm" variant="outline" color="default">
						{profileRoster.filter((item) => item.active).length} active
					</Badge>
				</div>
				<div className={styles.agentRosterList}>
					<button
						type="button"
						onClick={() => onApplyChannelScope("team")}
						className={cn(
							styles.rosterItem,
							channelScope === "team" && styles.rosterItemActive,
							styles.teamHomeItem,
						)}
					>
						<div className={styles.rosterIdentity}>
							<div className={styles.teamHomeIconShell}>
								<House size={14} />
							</div>
							<div>
								<p className={styles.rosterName}>General</p>
								<p className={styles.rosterMeta}>
									Unified live collaboration channel
								</p>
							</div>
						</div>
						<div className={styles.rosterStats}>
							<Badge
								size="sm"
								variant="soft"
								color={channelScope === "team" ? "primary" : "default"}
							>
								{channelScope === "team" ? "active" : "global"}
							</Badge>
							<span>{taskItems.length} tasks</span>
						</div>
					</button>
					{profileRoster.map((entry) => {
						const activeFilter = channelScope === entry.profileId;
						const profileData = resolvedProfiles[entry.profileId];
						return (
							<button
								key={entry.profileId}
								type="button"
								onClick={() => onApplyChannelScope(entry.profileId)}
								className={cn(
									styles.rosterItem,
									activeFilter && styles.rosterItemActive,
								)}
							>
								<div className={styles.rosterIdentity}>
									<AgentPixelMark
										profileId={entry.profileId}
										size={30}
										detailLevel="auto"
										state={
											profileStateById[entry.profileId] ??
											(entry.active ? "running" : "idle")
										}
									/>
									<div>
										<p className={styles.rosterName}>{profileData.name}</p>
										<p className={styles.rosterMeta}>{profileData.tagline}</p>
									</div>
								</div>
								<div className={styles.rosterStats}>
									<Badge
										size="sm"
										variant="soft"
										color={
											entry.warningCount > 0
												? "warning"
												: entry.active
													? "success"
													: "default"
										}
									>
										{entry.warningCount > 0
											? "review"
											: entry.active
												? "running"
												: "idle"}
									</Badge>
									<span>{entry.assignedCount} tasks</span>
								</div>
							</button>
						);
					})}
				</div>
			</div>

			<div className={styles.railCard}>
				<div className={styles.railHeaderRow}>
					<HStack gap={2} align="center">
						<ClipboardList size={14} />
						<Text size="xs" weight="semibold" className={styles.railEyebrow}>
							Task queue
						</Text>
					</HStack>
					{showQueueRefreshSpinner ? (
						<Loader2 size={12} className={styles.spin} />
					) : (
						<button
							type="button"
							onClick={onRefreshQueue}
							className={styles.inlineGhostButton}
						>
							<RefreshCw size={12} />
						</button>
					)}
				</div>

				<div className={styles.priorityBubbleRow}>
					{(["critical", "high", "medium", "low"] as AgentTaskPriority[]).map(
						(priority) => (
							<button
								key={priority}
								type="button"
								onClick={() => onTogglePriorityFilter(priority)}
								className={cn(
									styles.priorityBubble,
									priorityFilter === priority && styles.priorityBubbleActive,
								)}
							>
								<span className={styles.priorityLabel}>{priority}</span>
								<span className={styles.priorityCount}>
									{priorityCounts[priority]}
								</span>
							</button>
						),
					)}
				</div>

				<div className={styles.statusFilterRow}>
					{STATUS_FILTERS.map((filterValue) => (
						<button
							key={filterValue}
							type="button"
							onClick={() => onStatusFilterChange(filterValue)}
							className={cn(
								styles.statusFilterButton,
								statusFilter === filterValue && styles.statusFilterButtonActive,
							)}
						>
							{filterValue === "all" ? "all" : filterValue.replace("_", " ")}
						</button>
					))}
				</div>

				<div className={styles.filterGrid}>
					<label className={styles.filterField} htmlFor="queue-profile-filter">
						<span>profile</span>
						<select
							id="queue-profile-filter"
							name="queue_profile_filter"
							value={queueProfileFilter}
							onChange={(event) =>
								onQueueProfileFilterChange(event.target.value as QueueProfileFilter)
							}
						>
							<option value="all">all profiles</option>
							{AGENT_PROFILE_IDS.filter((id) => id !== "koro").map((id) => (
								<option key={id} value={id}>
									{resolvedProfiles[id].name}
								</option>
							))}
						</select>
					</label>
					<label className={styles.filterField} htmlFor="queue-run-filter">
						<span>run</span>
						<select
							id="queue-run-filter"
							name="queue_run_filter"
							value={queueRunFilter}
							onChange={(event) => onQueueRunFilterChange(event.target.value)}
						>
							<option value="all">all runs</option>
							{availableRunIds.map((runId) => (
								<option key={runId} value={runId}>
									{runConversationTitle(runId)}
								</option>
							))}
						</select>
					</label>
				</div>

				<div className={styles.queueList}>
					{filteredQueueTasks.length === 0 ? (
						<div className={styles.emptyQueue}>
							<Text size="xs" color="muted">
								No queued tasks match your filters.
							</Text>
						</div>
					) : (
						filteredQueueTasks.slice(0, 16).map((task) => (
							<button
								key={task.taskId}
								type="button"
								className={cn(styles.queueItem, styles.queueItemButton)}
								onClick={() => {
									if (task.runId) {
										onOpenRunConversation(task.runId);
									}
								}}
							>
								<HStack gap={2} align="center" className={styles.queueItemHeader}>
									<Badge size="sm" variant="soft" color={priorityColor(task.priority)}>
										{task.priority}
									</Badge>
									<Badge size="sm" variant="outline" color={statusColor(task.status)}>
										{task.status.replace("_", " ")}
									</Badge>
								</HStack>
								<p className={styles.queueItemTitle}>{task.title}</p>
								<p className={styles.queueItemMeta}>
									{task.assigneeProfile} | run {shortRunId(task.runId)}
								</p>
							</button>
						))
					)}
				</div>
			</div>
		</div>
	);
}

export function AgentChatRightRail({
	channelScope,
	healthy,
	paired,
	taskItems,
	profileStateById,
	reviewInboxTasks,
	reviewBusyTaskId,
	reviewNotes,
	resolvedProfiles,
	activityProfileFilter,
	activityRunFilter,
	activitySourceFilter,
	filteredActivityItems,
	availableRunIds,
	onApplyChannelScope,
	onReviewNoteChange,
	onReviewAction,
	onActivityProfileFilterChange,
	onActivityRunFilterChange,
	onActivitySourceFilterChange,
	onOpenRunConversation,
}: {
	channelScope: AgentChannelScope;
	healthy: boolean;
	paired: boolean;
	taskItems: AgentTaskItem[];
	profileStateById: Partial<Record<AgentProfileId, AgentMarkState>>;
	reviewInboxTasks: AgentTaskItem[];
	reviewBusyTaskId: string;
	reviewNotes: Record<string, string>;
	resolvedProfiles: Record<AgentProfileId, AgentProfile>;
	activityProfileFilter: QueueProfileFilter;
	activityRunFilter: QueueRunFilter;
	activitySourceFilter: ActivitySourceFilter;
	filteredActivityItems: AgentActivityItem[];
	availableRunIds: string[];
	onApplyChannelScope: (scope: AgentChannelScope) => void;
	onReviewNoteChange: (taskId: string, value: string) => void;
	onReviewAction: (taskId: string, action: AgentReviewAction) => void;
	onActivityProfileFilterChange: (value: QueueProfileFilter) => void;
	onActivityRunFilterChange: (value: QueueRunFilter) => void;
	onActivitySourceFilterChange: (value: ActivitySourceFilter) => void;
	onOpenRunConversation: (runId: string) => void;
}) {
	return (
		<div className={styles.rightRail}>
			<div className={styles.railCard}>
				<HStack gap={2} align="center" className={styles.railHeaderRow}>
					<Network size={14} />
					<Text size="xs" weight="semibold" className={styles.railEyebrow}>
						Agent network
					</Text>
				</HStack>
				<div className={styles.networkSurface}>
					<svg className={styles.networkLines} viewBox="0 0 240 180" aria-hidden>
						<line x1="120" y1="34" x2="58" y2="94" />
						<line x1="120" y1="34" x2="120" y2="126" />
						<line x1="120" y1="34" x2="182" y2="94" />
						<line x1="58" y1="94" x2="182" y2="94" />
						<line x1="58" y1="94" x2="120" y2="126" />
						<line x1="182" y1="94" x2="120" y2="126" />
						<line x1="58" y1="94" x2="36" y2="136" />
						<line x1="120" y1="126" x2="36" y2="136" />
						<line x1="182" y1="94" x2="204" y2="136" />
						<line x1="120" y1="126" x2="204" y2="136" />
					</svg>
					{AGENT_NETWORK_NODES.map((node) => {
						const queued = taskItems.filter(
							(task) =>
								task.assigneeProfile === node.profileId &&
								OPEN_QUEUE_STATUSES.includes(task.status),
						).length;
						const nodeState =
							profileStateById[node.profileId] ??
							(healthy ? (paired ? (queued > 0 ? "running" : "idle") : "waiting") : "error");
						return (
							<button
								key={node.profileId}
								type="button"
								onClick={() => onApplyChannelScope(node.profileId)}
								className={cn(
									styles.networkNode,
									styles.networkNodeButton,
									channelScope === node.profileId && styles.networkNodeActive,
								)}
								style={{ left: `${node.x}px`, top: `${node.y}px` }}
							>
								<AgentPixelMark
									profileId={node.profileId}
									size={34}
									detailLevel="auto"
									state={nodeState}
								/>
								{queued > 0 ? <span className={styles.networkCount}>{queued}</span> : null}
							</button>
						);
					})}
				</div>
			</div>

			<div className={styles.railCard}>
				<div className={styles.railHeaderRow}>
					<Text size="xs" weight="semibold" className={styles.railEyebrow}>
						Review inbox
					</Text>
					<Badge size="sm" variant="soft" color="warning">
						{reviewInboxTasks.length}
					</Badge>
				</div>

				<div className={styles.reviewList}>
					{reviewInboxTasks.length === 0 ? (
						<div className={styles.emptyQueue}>
							<Text size="xs" color="muted">
								No tasks waiting for review.
							</Text>
						</div>
					) : (
						reviewInboxTasks.slice(0, 8).map((task) => (
							<div key={task.taskId} className={styles.reviewItem}>
								<HStack gap={2} align="center" className={styles.reviewMetaRow}>
									<Badge size="sm" variant="soft" color={priorityColor(task.priority)}>
										{task.priority}
									</Badge>
									<Text size="xs" color="muted">
										{task.assigneeProfile}
									</Text>
								</HStack>
								<p className={styles.reviewTitle}>{task.title}</p>
								{task.description ? (
									<p className={styles.reviewDescription}>
										{truncateText(task.description, 220)}
									</p>
								) : null}
								<textarea
									id={`review-note-${task.taskId}`}
									name={`review_note_${task.taskId}`}
									value={reviewNotes[task.taskId] || ""}
									onChange={(event) =>
										onReviewNoteChange(task.taskId, event.target.value)
									}
									rows={2}
									placeholder="Optional reviewer note"
									className={styles.reviewNoteInput}
								/>
								<div className={styles.reviewActions}>
									<button
										type="button"
										onClick={() => onReviewAction(task.taskId, "approve")}
										disabled={reviewBusyTaskId === task.taskId}
										className={cn(styles.reviewActionButton, styles.reviewApprove)}
									>
										<Check size={12} />
										Approve
									</button>
									<button
										type="button"
										onClick={() => onReviewAction(task.taskId, "rework")}
										disabled={reviewBusyTaskId === task.taskId}
										className={cn(styles.reviewActionButton, styles.reviewRework)}
									>
										<Undo2 size={12} />
										Rework
									</button>
									<button
										type="button"
										onClick={() => onReviewAction(task.taskId, "defer")}
										disabled={reviewBusyTaskId === task.taskId}
										className={cn(styles.reviewActionButton, styles.reviewDefer)}
									>
										<WifiOff size={12} />
										Defer
									</button>
								</div>
							</div>
						))
					)}
				</div>
			</div>

			<div className={styles.railCard}>
				<div className={styles.railHeaderRow}>
					<Text size="xs" weight="semibold" className={styles.railEyebrow}>
						Recent run activity
					</Text>
				</div>
				<div className={styles.filterGrid}>
					<label className={styles.filterField} htmlFor="activity-profile-filter">
						<span>profile</span>
						<select
							id="activity-profile-filter"
							name="activity_profile_filter"
							value={activityProfileFilter}
							onChange={(event) =>
								onActivityProfileFilterChange(
									event.target.value as QueueProfileFilter,
								)
							}
						>
							<option value="all">all profiles</option>
							{AGENT_PROFILE_IDS.filter((id) => id !== "koro").map((id) => (
								<option key={id} value={id}>
									{resolvedProfiles[id].name}
								</option>
							))}
						</select>
					</label>
					<label className={styles.filterField} htmlFor="activity-run-filter">
						<span>run</span>
						<select
							id="activity-run-filter"
							name="activity_run_filter"
							value={activityRunFilter}
							onChange={(event) => onActivityRunFilterChange(event.target.value)}
						>
							<option value="all">all runs</option>
							{availableRunIds.map((runId) => (
								<option key={runId} value={runId}>
									{runConversationTitle(runId)}
								</option>
							))}
						</select>
					</label>
					<label className={styles.filterField} htmlFor="activity-source-filter">
						<span>source</span>
						<select
							id="activity-source-filter"
							name="activity_source_filter"
							value={activitySourceFilter}
							onChange={(event) =>
								onActivitySourceFilterChange(
									event.target.value as ActivitySourceFilter,
								)
							}
						>
							<option value="all">all sources</option>
							<option value="run">run</option>
							<option value="task">task</option>
							<option value="review">review</option>
						</select>
					</label>
				</div>
				<div className={styles.activityList}>
					{filteredActivityItems.length === 0 ? (
						<div className={styles.emptyQueue}>
							<Text size="xs" color="muted">
								No activity yet. Start an orchestration run to generate events.
							</Text>
						</div>
					) : (
						filteredActivityItems.slice(0, 60).map((item) => (
							<button
								key={item.activityId}
								type="button"
								className={cn(styles.activityItem, styles.activityItemButton)}
								onClick={() => {
									if (item.runId) {
										onOpenRunConversation(item.runId);
									}
								}}
							>
								<div className={styles.activityItemMeta}>
									<Badge size="sm" variant="soft" color={activityTone(item)}>
										{item.source}
									</Badge>
									<span>{formatTimestamp(item.createdAt)}</span>
								</div>
								<p className={styles.activityMessage}>{item.message}</p>
								<p className={styles.activityContext}>
									{item.profileId ? `${item.profileId} | ` : ""}
									{item.eventType}
									{item.runId ? ` | run ${shortRunId(item.runId)}` : ""}
								</p>
								{(() => {
									const detail = deriveActivityDetail(item);
									if (!detail) return null;
									return (
										<>
											{detail.meta ? (
												<p className={styles.activityDetailMeta}>{detail.meta}</p>
											) : null}
											{detail.text ? (
												<p
													title={detail.text}
													className={cn(
														styles.activityDetail,
														detail.isError && styles.activityDetailError,
													)}
												>
													{truncateText(
														detail.text,
														ACTIVITY_DETAIL_PREVIEW_CHARS,
													)}
												</p>
											) : null}
										</>
									);
								})()}
							</button>
						))
					)}
				</div>
			</div>
		</div>
	);
}
