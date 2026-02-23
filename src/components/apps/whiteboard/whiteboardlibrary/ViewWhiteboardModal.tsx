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
		<div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
			<div className="bg-[#0a0a0a] backdrop-blur-xl border border-white/[0.06] rounded-lg max-w-6xl w-full max-h-[90vh] overflow-auto">
				<div className="flex items-center justify-between p-6 border-b border-white/[0.06] sticky top-0 bg-[#0a0a0a]/95 backdrop-blur-sm z-10">
					<div>
						<h3 className="text-2xl font-bold text-white/80">
							{whiteboard.title}
						</h3>
						<div className="flex items-center space-x-4 mt-2 text-sm text-white/50">
							<span>{whiteboard.panel_context}</span>
							<span>•</span>
							<span>{formatDate(whiteboard.created_at)}</span>
						</div>
					</div>
					<button
						onClick={onClose}
						className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
					>
						<X className="w-6 h-6 text-red-400" />
					</button>
				</div>

				<div className="p-6">
					{whiteboard.thumbnail_url && (
						<img
							src={whiteboard.thumbnail_url}
							alt={whiteboard.title}
							className="w-full rounded-lg border border-orange-500/30"
						/>
					)}

					{whiteboard.tags.length > 0 && (
						<div className="mt-4 flex flex-wrap gap-2">
							{whiteboard.tags.map((tag, idx) => (
								<span
									key={idx}
									className="flex items-center space-x-1 px-3 py-1 bg-orange-500/10 text-orange-300 rounded-full border border-orange-500/30"
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
