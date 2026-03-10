import { Download, Package, Star, Tag, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/apps/ui/dialog";
import { cn } from "@/lib/utils";
import styles from "./BlockLibraryDetailsDialog.module.css";
import type { BlockFile } from "./blockLibraryModels";

interface BlockLibraryDetailsDialogProps {
	selectedBlock: BlockFile | null;
	onClose: () => void;
	onToggleFavorite: (block: BlockFile) => void;
}

export function BlockLibraryDetailsDialog({
	selectedBlock,
	onClose,
	onToggleFavorite,
}: BlockLibraryDetailsDialogProps) {
	if (!selectedBlock) return null;

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className={styles.dialogContent} showCloseButton={false}>
				<div className={styles.header}>
					<div className={styles.headerText}>
						<h3 className={styles.title}>{selectedBlock.name}</h3>
						<p className={styles.meta}>
							<span className={styles.categoryLabel}>
								{selectedBlock.category}
							</span>
							<span>·</span>
							<span>{(selectedBlock.file_size / 1024).toFixed(1)} KB</span>
							<span>·</span>
							<span>{selectedBlock.usage_count}× used</span>
						</p>
					</div>
					<button onClick={onClose} className={styles.closeButton}>
						<X className={styles.closeIcon} />
					</button>
				</div>

				<div className={styles.body}>
					<div className={styles.preview}>
						{selectedBlock.thumbnail_url ? (
							<img
								src={selectedBlock.thumbnail_url}
								alt={selectedBlock.name}
								className={styles.previewImage}
							/>
						) : (
							<div className={styles.previewFallback}>
								<Package className={styles.previewFallbackIcon} />
								<p className={styles.previewFallbackText}>
									No preview available
								</p>
							</div>
						)}
					</div>

					{/* Tags */}
					{selectedBlock.tags.length > 0 && (
						<div className={styles.tags}>
							{selectedBlock.tags.map((tag, i) => (
								<span
									key={`${selectedBlock.id}-${tag}-${i}`}
									className={styles.tag}
								>
									<Tag className={styles.tagIcon} />
									{tag}
								</span>
							))}
						</div>
					)}

					{/* Dynamic info */}
					{selectedBlock.is_dynamic && (
						<div className={styles.dynamicInfo}>
							<p className={styles.dynamicTitle}>Dynamic Block</p>
							<p className={styles.dynamicText}>
								Includes dynamic variations and can be customized with different
								parameters.
							</p>
						</div>
					)}

					{/* Actions */}
					<div className={styles.actions}>
						<button className={styles.downloadButton}>
							<Download className={styles.actionIcon} />
							Download
						</button>
						<button
							onClick={() => onToggleFavorite(selectedBlock)}
							className={cn(
								styles.favoriteButton,
								selectedBlock.is_favorite
									? styles.favoriteButtonActive
									: styles.favoriteButtonInactive,
							)}
						>
							<Star className={styles.actionIcon} />
							{selectedBlock.is_favorite ? "Favorited" : "Favorite"}
						</button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
