import { hexToRgba } from "@/lib/palette";
import type { GridConductor, GridRod } from "./types";

interface GridGeneratorDataPreviewTablesProps {
	rods: GridRod[];
	conductors: GridConductor[];
	palettePrimary: string;
	paletteText: string;
	paletteTextMuted: string;
}

export function GridGeneratorDataPreviewTables({
	rods,
	conductors,
	palettePrimary,
	paletteText,
	paletteTextMuted,
}: GridGeneratorDataPreviewTablesProps) {
	return (
		<>
			{rods.length > 0 ? (
				<div
					style={{
						borderRadius: 8,
						border: `1px solid ${hexToRgba(palettePrimary, 0.15)}`,
						overflow: "hidden",
					}}
				>
					<div
						style={{
							padding: "6px 10px",
							fontSize: 11,
							fontWeight: 700,
							color: "#22c55e",
							background: hexToRgba("#22c55e", 0.08),
						}}
					>
						Ground Rods ({rods.length})
					</div>
					<div style={{ maxHeight: 150, overflowY: "auto" }}>
						<table
							style={{
								width: "100%",
								fontSize: 10,
								borderCollapse: "collapse",
							}}
						>
							<thead>
								<tr style={{ color: paletteTextMuted }}>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										Label
									</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>X</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>Y</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										Depth
									</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										Dia
									</th>
								</tr>
							</thead>
							<tbody>
								{rods.map((rod, index) => (
									<tr
										key={`rod-${index}`}
										style={{
											borderTop: `1px solid ${hexToRgba(palettePrimary, 0.06)}`,
											color: paletteText,
										}}
									>
										<td
											style={{
												padding: "2px 6px",
												fontWeight: 600,
												textAlign: "center",
											}}
										>
											{rod.label}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{rod.grid_x}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{rod.grid_y}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{rod.depth}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{rod.diameter}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			) : null}

			{conductors.length > 0 ? (
				<div
					style={{
						borderRadius: 8,
						border: `1px solid ${hexToRgba(palettePrimary, 0.15)}`,
						overflow: "hidden",
					}}
				>
					<div
						style={{
							padding: "6px 10px",
							fontSize: 11,
							fontWeight: 700,
							color: "#f59e0b",
							background: hexToRgba("#f59e0b", 0.08),
						}}
					>
						Conductors ({conductors.length})
					</div>
					<div style={{ maxHeight: 150, overflowY: "auto" }}>
						<table
							style={{
								width: "100%",
								fontSize: 10,
								borderCollapse: "collapse",
							}}
						>
							<thead>
								<tr style={{ color: paletteTextMuted }}>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										Label
									</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										X1
									</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										Y1
									</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										X2
									</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										Y2
									</th>
								</tr>
							</thead>
							<tbody>
								{conductors.map((conductor, index) => (
									<tr
										key={`conductor-${index}`}
										style={{
											borderTop: `1px solid ${hexToRgba(palettePrimary, 0.06)}`,
											color: paletteText,
										}}
									>
										<td
											style={{
												padding: "2px 6px",
												fontWeight: 600,
												textAlign: "center",
											}}
										>
											{conductor.label}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{conductor.x1}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{conductor.y1}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{conductor.x2}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{conductor.y2}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			) : null}
		</>
	);
}
