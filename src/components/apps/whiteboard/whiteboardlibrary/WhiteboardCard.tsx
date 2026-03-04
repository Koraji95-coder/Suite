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
		<div className="group overflow-hidden rounded-xl border transition hover:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)]">
			{/* Thumbnail */}
			<div className="relative">
				{whiteboard.thumbnail_url ? (
					<img
						src={whiteboard.thumbnail_url}
						alt={whiteboard.title}
						className="h-48 w-full object-cover [background:var(--surface-2)]"
					/>
				) : (
					<div className="flex h-48 w-full items-center justify-center [background:var(--surface-2)]">
						<span className="text-4xl font-bold opacity-25 [color:var(--primary)]">
							{getInitials(whiteboard.title)}
						</span>
					</div>
				)}

				{/* Hover overlay */}
				<div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
					<button
						onClick={() => onView(whiteboard)}
						title="View"
						className="rounded-lg border p-2 transition
							[border-color:var(--border)] [background:var(--surface)] [color:var(--text)]
							hover:[background:var(--surface-2)]"
					>
						<Eye className="h-5 w-5" />
					</button>
					<button
						onClick={() => onDelete(whiteboard.id)}
						title="Delete"
						className="rounded-lg border p-2 transition
							border-[color-mix(in_srgb,var(--danger)_40%,transparent)]
							[background:color-mix(in_srgb,var(--danger)_14%,transparent)]
							[color:var(--danger)]
							hover:[background:color-mix(in_srgb,var(--danger)_25%,transparent)]"
					>
						<Trash2 className="h-5 w-5" />
					</button>
				</div>
			</div>

			{/* Info */}
			<div className="p-4">
				<h3 className="mb-2 truncate text-sm font-semibold [color:var(--text)]">
					{whiteboard.title}
				</h3>

				<div className="mb-3 flex items-center gap-2 text-xs [color:var(--text-muted)]">
					<Calendar className="h-3 w-3" />
					<span>{formatDate(whiteboard.created_at)}</span>
					<span>·</span>
					<span className="rounded px-1.5 py-0.5 [background:var(--surface-2)]">
						{whiteboard.panel_context}
					</span>
				</div>

				{whiteboard.tags.length > 0 && (
					<div className="flex flex-wrap gap-1">
						{whiteboard.tags.map((tag, idx) => (
							<span
								key={idx}
								className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs
									[border-color:var(--border)] [background:var(--surface-2)] [color:var(--text-muted)]"
							>
								<Tag className="h-3 w-3" />
								{tag}
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
