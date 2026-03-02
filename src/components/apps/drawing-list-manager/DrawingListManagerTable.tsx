import { type ColorScheme, hexToRgba } from "@/lib/palette";
import type { DrawingListManagerFilteredDrawing } from "./useDrawingListManagerState";

interface DrawingListManagerTableProps {
	palette: ColorScheme;
	drawings: DrawingListManagerFilteredDrawing[];
	onTitleChange: (id: string, title: string) => void;
}

export function DrawingListManagerTable({
	palette,
	drawings,
	onTitleChange,
}: DrawingListManagerTableProps) {
	return (
		<div
			style={{
				padding: 18,
				borderRadius: 16,
				border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
				background: hexToRgba(palette.surface, 0.7),
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
					Drawing List
				</h3>
				<div style={{ fontSize: 12, color: palette.textMuted }}>
					{drawings.length} entries
				</div>
			</div>
			<div style={{ overflowX: "auto", marginTop: 12 }}>
				<table
					style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
				>
					<thead>
						<tr style={{ textAlign: "left", color: palette.textMuted }}>
							<th style={{ padding: "8px 6px" }}>Drawing Number</th>
							<th style={{ padding: "8px 6px" }}>Title</th>
							<th style={{ padding: "8px 6px" }}>File</th>
							<th style={{ padding: "8px 6px" }}>Status</th>
						</tr>
					</thead>
					<tbody>
						{drawings.map((drawing) => (
							<tr
								key={drawing.id}
								style={{
									borderTop: `1px solid ${hexToRgba(palette.surfaceLight, 0.3)}`,
								}}
							>
								<td style={{ padding: "8px 6px", fontWeight: 600 }}>
									{drawing.drawingNumber}
								</td>
								<td style={{ padding: "8px 6px" }}>
									<input
										value={drawing.title}
										onChange={(event) =>
											onTitleChange(drawing.id, event.target.value)
										}
										style={{
											width: "100%",
											padding: "4px 6px",
											borderRadius: 6,
											border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
											background: "transparent",
											color: palette.text,
										}}
									/>
								</td>
								<td style={{ padding: "8px 6px", color: palette.textMuted }}>
									{drawing.fileName || "-"}
								</td>
								<td style={{ padding: "8px 6px" }}>
									{drawing.issues.length === 0 ? (
										<span style={{ color: "#22c55e", fontWeight: 600 }}>
											Ready
										</span>
									) : (
										<span style={{ color: "#f59e0b", fontWeight: 600 }}>
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
