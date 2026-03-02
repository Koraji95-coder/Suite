import { Download, Package, Star, Tag } from "lucide-react";
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
	return (
		<Dialog
			open={Boolean(selectedBlock)}
			onOpenChange={(open) => !open && onClose()}
		>
			<DialogContent className="max-h-[92vh] max-w-4xl overflow-auto border-[var(--border)] bg-[var(--bg-heavy)] p-0">
				<div className="sticky top-0 z-10 flex items-center justify-between border-b p-6 backdrop-blur-sm [border-color:var(--border)] [background:color-mix(in_srgb,var(--bg-base)_95%,transparent)]">
					<div>
						<h3 className="text-2xl font-bold [color:var(--text)]">
							{selectedBlock?.name}
						</h3>
						<div className="mt-2 flex items-center space-x-4 text-sm [color:var(--text-muted)]">
							<span className="capitalize">{selectedBlock?.category}</span>
							<span>•</span>
							<span>
								{((selectedBlock?.file_size ?? 0) / 1024).toFixed(1)} KB
							</span>
							<span>•</span>
							<span>Used {selectedBlock?.usage_count ?? 0}x</span>
						</div>
					</div>
					<button
						onClick={onClose}
						className="rounded-lg p-2 transition hover:[background:color-mix(in_srgb,var(--danger)_18%,transparent)]"
					>
						<span className="text-2xl [color:var(--danger)]">×</span>
					</button>
				</div>

				<div className="p-6 space-y-6">
					<div className="aspect-video flex items-center justify-center rounded-lg border [border-color:var(--border)] [background:var(--surface-2)]">
						{selectedBlock?.thumbnail_url ? (
							<img
								src={selectedBlock.thumbnail_url}
								alt={selectedBlock.name}
								className="max-w-full max-h-full object-contain"
							/>
						) : (
							<div className="text-center">
								<Package className="mx-auto mb-4 h-24 w-24 [color:color-mix(in_srgb,var(--primary)_35%,transparent)]" />
								<p className="[color:var(--text-muted)]">
									Preview not available
								</p>
							</div>
						)}
					</div>

					{(selectedBlock?.tags.length ?? 0) > 0 && (
						<div>
							<h4 className="mb-3 text-lg font-bold [color:var(--text)]">
								Tags
							</h4>
							<div className="flex flex-wrap gap-2">
								{selectedBlock?.tags.map((tag, index) => (
									<span
										key={`${selectedBlock.id}-${tag}-${index}`}
										className="flex items-center space-x-1 rounded-full border px-3 py-1 [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text-muted)]"
									>
										<Tag className="w-3 h-3" />
										<span>{tag}</span>
									</span>
								))}
							</div>
						</div>
					)}

					{selectedBlock?.is_dynamic && (
						<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,transparent)]">
							<h4 className="mb-2 text-lg font-bold [color:var(--text)]">
								Dynamic Block
							</h4>
							<p className="text-sm [color:var(--text-muted)]">
								This block includes dynamic variations and can be customized
								with different parameters.
							</p>
						</div>
					)}

					<div className="flex gap-3">
						<button className="flex flex-1 items-center justify-center space-x-2 rounded-lg border px-6 py-3 text-sm font-medium transition hover:[background:var(--surface-2)] [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_18%,transparent)] [color:var(--text)]">
							<Download className="w-5 h-5" />
							<span>Download</span>
						</button>
						<button
							onClick={() => selectedBlock && onToggleFavorite(selectedBlock)}
							className={`px-6 py-3 border rounded-lg transition-all flex items-center space-x-2 ${
								selectedBlock?.is_favorite
									? "[background:color-mix(in_srgb,var(--warning)_30%,var(--surface))] [border-color:color-mix(in_srgb,var(--warning)_50%,transparent)] [color:var(--warning)]"
									: "[background:var(--surface-2)] [border-color:var(--border)] [color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--warning)_20%,var(--surface))]"
							}`}
						>
							<Star className="w-5 h-5" />
							<span>
								{selectedBlock?.is_favorite ? "Favorited" : "Favorite"}
							</span>
						</button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
