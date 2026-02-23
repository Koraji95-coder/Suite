import { SavedWhiteboard } from "../whiteboardtypes";
import { WhiteboardCard } from "./WhiteboardCard";

interface LibraryGridProps {
	whiteboards: SavedWhiteboard[];
	onView: (whiteboard: SavedWhiteboard) => void;
	onDelete: (id: string) => void;
	emptyMessage: string;
}

export function LibraryGrid({
	whiteboards,
	onView,
	onDelete,
	emptyMessage,
}: LibraryGridProps) {
	if (whiteboards.length === 0) {
		return (
			<div className="text-center text-white/50 py-12">{emptyMessage}</div>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{whiteboards.map((wb) => (
				<WhiteboardCard
					key={wb.id}
					whiteboard={wb}
					onView={onView}
					onDelete={onDelete}
				/>
			))}
		</div>
	);
}
