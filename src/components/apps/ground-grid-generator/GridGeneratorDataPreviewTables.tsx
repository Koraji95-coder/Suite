import { hexToRgba } from "@/lib/palette";
import type { GridConductor, GridPlacement, GridRod } from "./types";

interface GridGeneratorDataPreviewTablesProps {
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
	palettePrimary: string;
	paletteText: string;
	paletteTextMuted: string;
}

export function GridGeneratorDataPreviewTables({
	rods,
	conductors,
	placements,
	palettePrimary,
	paletteText,
	paletteTextMuted,
}: GridGeneratorDataPreviewTablesProps) {
	const tees = placements.filter((placement) => placement.type === "TEE");
	const crosses = placements.filter((placement) => placement.type === "CROSS");
	const testWells = placements.filter(
		(placement) => placement.type === "GROUND_ROD_WITH_TEST_WELL",
	);

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
					<div
						style={{
							padding: "4px 10px",
							fontSize: 10,
							color: paletteTextMuted,
							borderTop: `1px solid ${hexToRgba(palettePrimary, 0.06)}`,
						}}
					>
						{Math.max(0, rods.length - testWells.length)} standard rods +{" "}
						{testWells.length} test wells included in rod total.
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

			{tees.length > 0 ? (
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
							color: "#60a5fa",
							background: hexToRgba("#60a5fa", 0.08),
						}}
					>
						Inferred Tees ({tees.length})
					</div>
					<div
						style={{
							padding: "4px 10px",
							fontSize: 10,
							color: paletteTextMuted,
							borderTop: `1px solid ${hexToRgba(palettePrimary, 0.06)}`,
						}}
					>
						Inferred from conductor topology and rod exclusions.
					</div>
					<div style={{ maxHeight: 140, overflowY: "auto" }}>
						<table
							style={{
								width: "100%",
								fontSize: 10,
								borderCollapse: "collapse",
							}}
						>
							<thead>
								<tr style={{ color: paletteTextMuted }}>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>#</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										Grid X
									</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										Grid Y
									</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										Rotation
									</th>
								</tr>
							</thead>
							<tbody>
								{tees.map((tee, index) => (
									<tr
										key={`tee-${index}`}
										style={{
											borderTop: `1px solid ${hexToRgba(palettePrimary, 0.06)}`,
											color: paletteText,
										}}
									>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontWeight: 600,
											}}
										>
											T{index + 1}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{tee.grid_x}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{tee.grid_y}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{tee.rotation_deg.toFixed(1)} deg
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			) : null}

			{crosses.length > 0 ? (
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
							color: "#06b6d4",
							background: hexToRgba("#06b6d4", 0.08),
						}}
					>
						Inferred Crosses ({crosses.length})
					</div>
					<div
						style={{
							padding: "4px 10px",
							fontSize: 10,
							color: paletteTextMuted,
							borderTop: `1px solid ${hexToRgba(palettePrimary, 0.06)}`,
						}}
					>
						Inferred from conductor topology and rod exclusions.
					</div>
					<div style={{ maxHeight: 140, overflowY: "auto" }}>
						<table
							style={{
								width: "100%",
								fontSize: 10,
								borderCollapse: "collapse",
							}}
						>
							<thead>
								<tr style={{ color: paletteTextMuted }}>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>#</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										Grid X
									</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										Grid Y
									</th>
								</tr>
							</thead>
							<tbody>
								{crosses.map((cross, index) => (
									<tr
										key={`cross-${index}`}
										style={{
											borderTop: `1px solid ${hexToRgba(palettePrimary, 0.06)}`,
											color: paletteText,
										}}
									>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontWeight: 600,
											}}
										>
											X{index + 1}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{cross.grid_x}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{cross.grid_y}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			) : null}

			{testWells.length > 0 ? (
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
							color: "#ef4444",
							background: hexToRgba("#ef4444", 0.08),
						}}
					>
						Test Wells ({testWells.length})
					</div>
					<div style={{ maxHeight: 140, overflowY: "auto" }}>
						<table
							style={{
								width: "100%",
								fontSize: 10,
								borderCollapse: "collapse",
							}}
						>
							<thead>
								<tr style={{ color: paletteTextMuted }}>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>#</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										Grid X
									</th>
									<th style={{ padding: "3px 6px", textAlign: "center" }}>
										Grid Y
									</th>
								</tr>
							</thead>
							<tbody>
								{testWells.map((testWell, index) => (
									<tr
										key={`test-well-${index}`}
										style={{
											borderTop: `1px solid ${hexToRgba(palettePrimary, 0.06)}`,
											color: paletteText,
										}}
									>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontWeight: 600,
											}}
										>
											TW{index + 1}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{testWell.grid_x}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{testWell.grid_y}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div
						style={{
							padding: "6px 10px",
							fontSize: 10,
							fontWeight: 600,
							color: paletteTextMuted,
							borderTop: `1px solid ${hexToRgba(palettePrimary, 0.06)}`,
						}}
					>
						*TEST WELLS ARE INCLUDED IN GROUND ROD TOTALS
					</div>
				</div>
			) : null}
		</>
	);
}
