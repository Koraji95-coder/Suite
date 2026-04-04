import type { CSSProperties } from "react";
import { hexToRgba } from "@/lib/palette";
import { placementKey } from "./GridManualEditorModels";
import type { GridConductor, GridPlacement, GridRod } from "./types";
import styles from "./GridManualEditorTables.module.css";

interface GridManualEditorTablesProps {
	rods: GridRod[];
	conductors: GridConductor[];
	tees: GridPlacement[];
	crosses: GridPlacement[];
	selectedRod: number | null;
	selectedConductor: number | null;
	selectedTeeKey: string | null;
	selectedCrossKey: string | null;
	textColor: string;
	mutedTextColor: string;
	primaryColor: string;
	onSelectRod: (index: number) => void;
	onSelectConductor: (index: number) => void;
	onSelectTee: (key: string) => void;
	onSelectCross: (key: string) => void;
	tableRowStyle: (selected: boolean) => CSSProperties;
}

export function GridManualEditorTables({
	rods,
	conductors,
	tees,
	crosses,
	selectedRod,
	selectedConductor,
	selectedTeeKey,
	selectedCrossKey,
	textColor,
	mutedTextColor,
	primaryColor,
	onSelectRod,
	onSelectConductor,
	onSelectTee,
	onSelectCross,
	tableRowStyle,
}: GridManualEditorTablesProps) {
	if (
		rods.length === 0 &&
		conductors.length === 0 &&
		tees.length === 0 &&
		crosses.length === 0
	) {
		return null;
	}

	const panelStyle: CSSProperties = {
		borderRadius: 6,
		border: `1px solid ${hexToRgba(primaryColor, 0.12)}`,
		overflow: "hidden",
	};

	const headerCellStyle: CSSProperties = {
		padding: "2px 4px",
		textAlign: "center",
	};

	const bodyCellStyle: CSSProperties = {
		padding: "1px 4px",
		textAlign: "center",
		fontFamily: "monospace",
	};

	return (
		<div className={styles.tableGrid}>
			{rods.length > 0 && (
				<div className={styles.panel} style={panelStyle}>
					<div
						className={styles.panelHeader}
						style={{
							color: "#22c55e",
							background: hexToRgba("#22c55e", 0.08),
						}}
					>
						Ground Rods ({rods.length})
					</div>
					<div className={styles.tableContainer}>
						<table className={styles.table}>
							<thead>
								<tr
									className={styles.headerRow}
									style={{ color: mutedTextColor }}
								>
									<th style={headerCellStyle}>Label</th>
									<th style={headerCellStyle}>X</th>
									<th style={headerCellStyle}>Y</th>
								</tr>
							</thead>
							<tbody>
								{rods.map((r, i) => (
									<tr
										key={`rod-${i}`}
										style={{
											...tableRowStyle(selectedRod === i),
											color: textColor,
										}}
										onClick={() => onSelectRod(i)}
									>
										<td className={styles.labelCell}>
											{r.label}
										</td>
										<td style={bodyCellStyle}>{r.grid_x}</td>
										<td style={bodyCellStyle}>{r.grid_y}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{conductors.length > 0 && (
				<div className={styles.panel} style={panelStyle}>
					<div
						className={styles.panelHeader}
						style={{
							color: "#f59e0b",
							background: hexToRgba("#f59e0b", 0.08),
						}}
					>
						Conductors ({conductors.length})
					</div>
					<div className={styles.tableContainer}>
						<table className={styles.table}>
							<thead>
								<tr
									className={styles.headerRow}
									style={{ color: mutedTextColor }}
								>
									<th style={headerCellStyle}>Label</th>
									<th style={headerCellStyle}>X1</th>
									<th style={headerCellStyle}>Y1</th>
									<th style={headerCellStyle}>X2</th>
									<th style={headerCellStyle}>Y2</th>
								</tr>
							</thead>
							<tbody>
								{conductors.map((c, i) => (
									<tr
										key={`conductor-${i}`}
										style={{
											...tableRowStyle(selectedConductor === i),
											color: textColor,
										}}
										onClick={() => onSelectConductor(i)}
									>
										<td className={styles.labelCell}>
											{c.label}
										</td>
										<td style={bodyCellStyle}>{c.x1}</td>
										<td style={bodyCellStyle}>{c.y1}</td>
										<td style={bodyCellStyle}>{c.x2}</td>
										<td style={bodyCellStyle}>{c.y2}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{tees.length > 0 && (
				<div className={styles.panel} style={panelStyle}>
					<div
						className={styles.panelHeader}
						style={{
							color: "#3b82f6",
							background: hexToRgba("#3b82f6", 0.08),
						}}
					>
						Tees ({tees.length})
					</div>
					<div className={styles.tableContainer}>
						<table className={styles.table}>
							<thead>
								<tr
									className={styles.headerRow}
									style={{ color: mutedTextColor }}
								>
									<th style={headerCellStyle}>#</th>
									<th style={headerCellStyle}>X</th>
									<th style={headerCellStyle}>Y</th>
								</tr>
							</thead>
							<tbody>
								{tees.map((p, i) => {
									const key = placementKey(p);
									return (
										<tr
											key={`tee-row-${i}`}
											style={{
												...tableRowStyle(selectedTeeKey === key),
												color: textColor,
											}}
											onClick={() => onSelectTee(key)}
										>
											<td className={styles.labelCell}>
												T{i + 1}
											</td>
											<td style={bodyCellStyle}>{p.grid_x}</td>
											<td style={bodyCellStyle}>{p.grid_y}</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{crosses.length > 0 && (
				<div className={styles.panel} style={panelStyle}>
					<div
						className={styles.panelHeader}
						style={{
							color: "#06b6d4",
							background: hexToRgba("#06b6d4", 0.08),
						}}
					>
						Crosses ({crosses.length})
					</div>
					<div className={styles.tableContainer}>
						<table className={styles.table}>
							<thead>
								<tr
									className={styles.headerRow}
									style={{ color: mutedTextColor }}
								>
									<th style={headerCellStyle}>#</th>
									<th style={headerCellStyle}>X</th>
									<th style={headerCellStyle}>Y</th>
								</tr>
							</thead>
							<tbody>
								{crosses.map((p, i) => {
									const key = placementKey(p);
									return (
										<tr
											key={`cross-row-${i}`}
											style={{
												...tableRowStyle(selectedCrossKey === key),
												color: textColor,
											}}
											onClick={() => onSelectCross(key)}
										>
											<td className={styles.labelCell}>
												X{i + 1}
											</td>
											<td style={bodyCellStyle}>{p.grid_x}</td>
											<td style={bodyCellStyle}>{p.grid_y}</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
