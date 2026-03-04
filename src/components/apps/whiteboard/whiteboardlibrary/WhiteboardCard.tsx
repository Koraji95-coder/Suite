import { Calendar, Eye, Tag, Trash2 } from "lucide-react";
import { SavedWhiteboard } from "../whiteboardtypes";
import { formatDate, getInitials } from "../whiteboardutils";
import styles from "./WhiteboardCard.module.css";

interface WhiteboardCardProps {
	whiteboard: SavedWhiteboard;
	onView: (whiteboard: SavedWhiteboard) => void;
	onDelete: (id: string) => void;
}

export function WhiteboardCard({
	whiteboard,
	onView,
	onDelete,
}: WhiteboardCardProps) {
	return (
		<div className={styles.card}>
			{/* Thumbnail */}
			<div className={styles.thumbnailWrap}>
				{whiteboard.thumbnail_url ? (
					<img
						src={whiteboard.thumbnail_url}
						alt={whiteboard.title}
						className={styles.thumbnailImage}
					/>
				) : (
					<div className={styles.thumbnailEmpty}>
						<span className={styles.thumbnailInitials}>
							{getInitials(whiteboard.title)}
						</span>
					</div>
				)}

				{/* Hover overlay */}
				<div className={styles.overlay}>
					<button
						onClick={() => onView(whiteboard)}
						title="View"
						className={styles.viewButton}
					>
						<Eye className={styles.overlayIcon} />
					</button>
					<button
						onClick={() => onDelete(whiteboard.id)}
						title="Delete"
						className={styles.deleteButton}
					>
						<Trash2 className={styles.overlayIcon} />
					</button>
				</div>
			</div>

			{/* Info */}
			<div className={styles.body}>
				<h3 className={styles.title}>{whiteboard.title}</h3>

				<div className={styles.metaRow}>
					<Calendar className={styles.metaIcon} />
					<span>{formatDate(whiteboard.created_at)}</span>
					<span>·</span>
					<span className={styles.contextBadge}>
						{whiteboard.panel_context}
					</span>
				</div>

				{whiteboard.tags.length > 0 && (
					<div className={styles.tagsWrap}>
						{whiteboard.tags.map((tag, idx) => (
							<span key={idx} className={styles.tagChip}>
								<Tag className={styles.tagIcon} />
								{tag}
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
