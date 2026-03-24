import { Tag, X } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import { SavedWhiteboard } from "../whiteboardtypes";
import { formatDate } from "../whiteboardutils";
import styles from "./ViewWhiteboardModal.module.css";

interface ViewWhiteboardModalProps {
	whiteboard: SavedWhiteboard | null;
	onClose: () => void;
}

export function ViewWhiteboardModal({
	whiteboard,
	onClose,
}: ViewWhiteboardModalProps) {
	if (!whiteboard) return null;

	return (
		<Dialog
			open={Boolean(whiteboard)}
			onOpenChange={(open) => !open && onClose()}
		>
			<DialogContent className={styles.dialogContent} showCloseButton={false}>
				<DialogHeader className="sr-only">
					<DialogTitle>{whiteboard.title}</DialogTitle>
					<DialogDescription>
						View the saved whiteboard preview, metadata, and tags.
					</DialogDescription>
				</DialogHeader>
				{/* Sticky header */}
				<div className={styles.header}>
					<div>
						<h3 className={styles.title}>{whiteboard.title}</h3>
						<div className={styles.meta}>
							<span>{whiteboard.panel_context}</span>
							<span>·</span>
							<span>{formatDate(whiteboard.created_at)}</span>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className={styles.closeButton}
						aria-label="Close whiteboard preview"
					>
						<X className={styles.closeIcon} />
					</button>
				</div>

				{/* Content */}
				<div className={styles.body}>
					{whiteboard.thumbnail_url && (
						<img
							src={whiteboard.thumbnail_url}
							alt={whiteboard.title}
							className={styles.image}
						/>
					)}

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
			</DialogContent>
		</Dialog>
	);
}
