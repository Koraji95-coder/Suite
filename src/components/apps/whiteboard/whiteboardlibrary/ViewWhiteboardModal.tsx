import { Tag, X } from "lucide-react";
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
		<div className="fixed inset-0 flex items-center justify-center bg-[color:rgb(10_10_10_/_0.72)] p-4 backdrop-blur-sm" style={{ zIndex: "var(--z-dialog)" }}>
			<div className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] backdrop-blur-xl">
				<div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] p-6 backdrop-blur-sm">
					<div>
						<h3 className="text-2xl font-bold text-[var(--text)]">
							{whiteboard.title}
						</h3>
						<div className="mt-2 flex items-center space-x-4 text-sm text-[var(--text-muted)]">
							<span>{whiteboard.panel_context}</span>
							<span>•</span>
							<span>{formatDate(whiteboard.created_at)}</span>
						</div>
					</div>
					<button
						onClick={onClose}
						className="p-2 hover:[background:color-mix(in_srgb,var(--danger)_20%,transparent)] rounded-lg transition-all"
					>
						<X className="w-6 h-6 [color:var(--danger)]" />
					</button>
				</div>

				<div className="p-6">
					{whiteboard.thumbnail_url && (
						<img
							src={whiteboard.thumbnail_url}
							alt={whiteboard.title}
							className="w-full rounded-lg border border-[var(--border)]"
						/>
					)}

					{whiteboard.tags.length > 0 && (
						<div className="mt-4 flex flex-wrap gap-2">
							{whiteboard.tags.map((tag, idx) => (
								<span
									key={idx}
									className="flex items-center space-x-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[var(--text-muted)]"
								>
									<Tag className="w-3 h-3" />
									<span>{tag}</span>
								</span>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
