import styles from "./DrawingListManagerTable.module.css";
import type { DrawingListManagerFilteredDrawing } from "./useDrawingListManagerState";

interface DrawingListManagerTableProps {
	drawings: DrawingListManagerFilteredDrawing[];
	onTitleChange: (id: string, title: string) => void;
}

export function DrawingListManagerTable({
	drawings,
	onTitleChange,
}: DrawingListManagerTableProps) {
	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<h3 className={styles.title}>Drawing List</h3>
				<div className={styles.count}>{drawings.length} entries</div>
			</div>

			<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr className={styles.headerRow}>
							<th className={styles.cellHead}>Drawing Number</th>
							<th className={styles.cellHead}>Title</th>
							<th className={styles.cellHead}>File</th>
							<th className={styles.cellHead}>Status</th>
						</tr>
					</thead>
					<tbody>
						{drawings.map((drawing) => (
							<tr key={drawing.id} className={styles.bodyRow}>
								<td className={styles.numberCell}>{drawing.drawingNumber}</td>
								<td className={styles.cell}>
									<input
										value={drawing.title}
										onChange={(e) => onTitleChange(drawing.id, e.target.value)}
										className={styles.titleInput}
									name="drawinglistmanagertable_input_35"
									/>
								</td>
								<td className={styles.fileCell}>{drawing.fileName || "–"}</td>
								<td className={styles.cell}>
									{drawing.issues.length === 0 ? (
										<span className={styles.statusReady}>Ready</span>
									) : (
										<span className={styles.statusWarn}>
											{drawing.issues.join(", ")}
										</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
