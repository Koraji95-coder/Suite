import { Calendar, Eye, Tag, Trash2 } from "lucide-react";
import { SavedWhiteboard } from "../whiteboardtypes";
import { formatDate, getInitials } from "../whiteboardutils";

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
		<div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] backdrop-blur-md transition-all hover:border-[var(--color-accent)]">
			<div className="relative group">
				{whiteboard.thumbnail_url ? (
					<img
						src={whiteboard.thumbnail_url}
						alt={whiteboard.title}
						className="h-48 w-full bg-[var(--color-surface-elevated)] object-cover"
					/>
				) : (
					<div className="flex h-48 w-full items-center justify-center bg-[var(--color-surface-elevated)]">
						<span className="text-4xl font-bold text-[var(--color-accent)]/40">
							{getInitials(whiteboard.title)}
						</span>
					</div>
				)}
				<div className="absolute inset-0 flex items-center justify-center space-x-2 bg-[color:rgb(10_10_10_/_0.55)] opacity-0 transition-opacity group-hover:opacity-100">
					<button
						onClick={() => onView(whiteboard)}
						className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-text)] transition-all hover:bg-[var(--color-surface-elevated)]"
						title="View"
					>
						<Eye className="w-5 h-5" />
					</button>
					<button
						onClick={() => onDelete(whiteboard.id)}
						className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-100 transition-all"
						title="Delete"
					>
						<Trash2 className="w-5 h-5" />
					</button>
				</div>
			</div>

			<div className="p-4">
				<h3 className="mb-2 truncate text-lg font-bold text-[var(--color-text)]">
					{whiteboard.title}
				</h3>

				<div className="mb-3 flex items-center space-x-2 text-xs text-[var(--color-text-muted)]">
					<Calendar className="w-3 h-3" />
					<span>{formatDate(whiteboard.created_at)}</span>
					<span>•</span>
					<span className="rounded bg-[var(--color-surface-elevated)] px-2 py-0.5">
						{whiteboard.panel_context}
					</span>
				</div>

				{whiteboard.tags.length > 0 && (
					<div className="flex flex-wrap gap-1">
						{whiteboard.tags.map((tag, idx) => (
							<span
								key={idx}
								className="flex items-center space-x-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-xs text-[var(--color-text-muted)]"
							>
								<Tag className="w-3 h-3" />
								<span>{tag}</span>
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
