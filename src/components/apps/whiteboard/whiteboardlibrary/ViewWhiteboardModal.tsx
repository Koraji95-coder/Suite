import { Tag, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/apps/ui/dialog";
import { SavedWhiteboard } from "../whiteboardtypes";
import { formatDate } from "../whiteboardutils";

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
			<DialogContent className="max-h-[90vh] max-w-6xl overflow-auto border-(--border) bg-(--surface) p-0">
				{/* Sticky header */}
				<div className="sticky top-0 z-10 flex items-center justify-between border-b p-5 backdrop-blur-sm [border-color:var(--border)] [background:var(--surface)]">
					<div>
						<h3 className="text-lg font-semibold [color:var(--text)]">
							{whiteboard.title}
						</h3>
						<div className="mt-1 flex items-center gap-3 text-xs [color:var(--text-muted)]">
							<span>{whiteboard.panel_context}</span>
							<span>·</span>
							<span>{formatDate(whiteboard.created_at)}</span>
						</div>
					</div>
					<button
						onClick={onClose}
						className="rounded-lg p-2 transition
							hover:[background:color-mix(in_srgb,var(--danger)_14%,transparent)]"
					>
						<X className="h-4 w-4 [color:var(--text-muted)]" />
					</button>
				</div>

				{/* Content */}
				<div className="p-5">
					{whiteboard.thumbnail_url && (
						<img
							src={whiteboard.thumbnail_url}
							alt={whiteboard.title}
							className="w-full rounded-lg border [border-color:var(--border)]"
						/>
					)}

					{whiteboard.tags.length > 0 && (
						<div className="mt-4 flex flex-wrap gap-2">
							{whiteboard.tags.map((tag, idx) => (
								<span
									key={idx}
									className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs
										[border-color:var(--border)] [background:var(--surface-2)] [color:var(--text-muted)]"
								>
									<Tag className="h-3 w-3" />
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
