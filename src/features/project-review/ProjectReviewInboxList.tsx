import { Link } from "react-router-dom";
import type {
	ProjectReviewInboxItem,
	ProjectReviewInboxQuickAction,
} from "./useProjectReviewInboxData";
import { Badge } from "@/components/primitives/Badge";
import styles from "./ProjectReviewInboxList.module.css";
import type { ViewMode } from "@/features/project-core";

interface ProjectReviewInboxListProps {
	items: ProjectReviewInboxItem[];
	onOpenViewMode: (mode: ViewMode) => void;
	emptyText: string;
	onRunQuickAction?: (
		item: ProjectReviewInboxItem,
		action: ProjectReviewInboxQuickAction,
	) => void;
	pendingActionId?: string | null;
}

function typeLabel(type: ProjectReviewInboxItem["type"]) {
	switch (type) {
		case "title-block":
			return "title block review";
		case "deliverable-register":
			return "deliverable register";
		case "issue-set":
			return "issue set";
		default:
			return type;
	}
}

function priorityColor(priority: ProjectReviewInboxItem["priority"]) {
	switch (priority) {
		case "high":
			return "danger";
		case "medium":
			return "warning";
		default:
			return "default";
	}
}

export function ProjectReviewInboxList({
	items,
	onOpenViewMode,
	emptyText,
	onRunQuickAction,
	pendingActionId = null,
}: ProjectReviewInboxListProps) {
	if (items.length === 0) {
		return <div className={styles.emptyState}>{emptyText}</div>;
	}

	return (
		<div className={styles.inboxList}>
			{items.map((item) => (
				<div key={item.id} className={styles.inboxItem}>
					<div className={styles.itemCopy}>
						<div className={styles.itemHeading}>
							<p className={styles.itemTitle}>{item.title}</p>
							<div className={styles.badgeRow}>
								<Badge color={priorityColor(item.priority)} variant="soft">
									{item.priority}
								</Badge>
								<Badge color="accent" variant="soft">
									{typeLabel(item.type)}
								</Badge>
								{item.issueSetLabel ? (
									<Badge color="warning" variant="soft">
										{item.issueSetLabel}
									</Badge>
								) : null}
							</div>
						</div>
						<p className={styles.itemSummary}>{item.summary}</p>
						<p className={styles.itemDetail}>{item.detail}</p>
					</div>
					<div className={styles.itemActions}>
						{item.actionType === "link" ? (
							<Link
								to={item.actionTarget as string}
								className={styles.itemLink}
							>
								{item.actionLabel}
							</Link>
						) : (
							<button
								type="button"
								className={styles.itemButton}
								onClick={() => onOpenViewMode(item.actionTarget as ViewMode)}
							>
								{item.actionLabel}
							</button>
						)}
						{onRunQuickAction && item.quickActions.length > 0 ? (
							<div className={styles.quickActionRow}>
								{item.quickActions.map((action) => (
									<button
										key={action.id}
										type="button"
										className={`${styles.quickActionButton} ${
											action.tone === "warning"
												? styles.quickActionButtonWarning
												: action.tone === "success"
													? styles.quickActionButtonSuccess
													: styles.quickActionButtonAccent
										}`}
										onClick={() => onRunQuickAction(item, action)}
										disabled={pendingActionId === action.id}
									>
										{pendingActionId === action.id
											? "Working..."
											: action.label}
									</button>
								))}
							</div>
						) : null}
					</div>
				</div>
			))}
		</div>
	);
}
