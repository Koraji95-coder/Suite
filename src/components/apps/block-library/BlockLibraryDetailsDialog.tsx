import { Download, Package, Star, Tag, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/apps/ui/dialog";
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
			<DialogContent className="max-h-[90vh] max-w-3xl overflow-auto border-(--border) bg-(--bg-heavy) p-0">
				{/* Header */}
				<div className="flex items-start justify-between gap-4 border-b p-5 [border-color:var(--border)]">
					<div className="min-w-0">
						<h3 className="text-xl font-semibold [color:var(--text)]">
							{selectedBlock.name}
						</h3>
						<p className="mt-1 flex items-center gap-2 text-sm [color:var(--text-muted)]">
							<span className="capitalize">{selectedBlock.category}</span>
							<span>·</span>
							<span>{(selectedBlock.file_size / 1024).toFixed(1)} KB</span>
							<span>·</span>
							<span>{selectedBlock.usage_count}× used</span>
						</p>
					</div>
					<button
						onClick={onClose}
						className="shrink-0 rounded-md p-1.5 transition hover:[background:var(--surface-2)]"
					>
						<X className="h-4 w-4 [color:var(--text-muted)]" />
					</button>
				</div>

				<div className="space-y-5 p-5">
					{/* Preview */}
					<div className="flex aspect-video items-center justify-center rounded-lg border [border-color:var(--border)] [background:var(--surface-2)]">
						{selectedBlock.thumbnail_url ? (
							<img
								src={selectedBlock.thumbnail_url}
								alt={selectedBlock.name}
								className="max-h-full max-w-full object-contain"
							/>
						) : (
							<div className="text-center">
								<Package className="mx-auto mb-2 h-16 w-16 text-[color-mix(in_srgb,var(--primary)_30%,transparent)]" />
								<p className="text-sm [color:var(--text-muted)]">
									No preview available
								</p>
							</div>
						)}
					</div>

					{/* Tags */}
					{selectedBlock.tags.length > 0 && (
						<div className="flex flex-wrap gap-2">
							{selectedBlock.tags.map((tag, i) => (
								<span
									key={`${selectedBlock.id}-${tag}-${i}`}
									className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs
										[border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)]"
								>
									<Tag className="h-3 w-3" />
									{tag}
								</span>
							))}
						</div>
					)}

					{/* Dynamic info */}
					{selectedBlock.is_dynamic && (
						<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_8%,transparent)]">
							<p className="text-sm font-medium [color:var(--text)]">
								Dynamic Block
							</p>
							<p className="mt-1 text-xs [color:var(--text-muted)]">
								Includes dynamic variations and can be customized with different
								parameters.
							</p>
						</div>
					)}

					{/* Actions */}
					<div className="flex gap-2">
						<button
							className="flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition
								[border-color:var(--border)] [background:var(--surface)] [color:var(--text)]
								hover:[background:var(--surface-2)]"
						>
							<Download className="h-4 w-4" />
							Download
						</button>
						<button
							onClick={() => onToggleFavorite(selectedBlock)}
							className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
								selectedBlock.is_favorite
									? "border-[color-mix(in_srgb,var(--warning)_40%,transparent)] [background:color-mix(in_srgb,var(--warning)_15%,transparent)] [color:var(--warning)]"
									: "[border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)] hover:[background:var(--surface-2)]"
							}`}
						>
							<Star className="h-4 w-4" />
							{selectedBlock.is_favorite ? "Favorited" : "Favorite"}
						</button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
