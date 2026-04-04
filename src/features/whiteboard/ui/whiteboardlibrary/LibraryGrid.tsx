import { SavedWhiteboard } from "../whiteboardtypes";
import styles from "./LibraryGrid.module.css";
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
		return <div className={styles.emptyState}>{emptyMessage}</div>;
	}

	return (
		<div className={styles.grid}>
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
