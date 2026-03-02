import { FileSpreadsheet, Trash2, Upload } from "lucide-react";
import type { ChangeEvent, CSSProperties, DragEvent, RefObject } from "react";
import { hexToRgba } from "@/lib/palette";
import type { PasteMode } from "./GridGeneratorPanelModels";
import type { GridConductor, GridPlacement, GridRod } from "./types";

interface GridGeneratorDataColumnProps {
	isDragging: boolean;
	fileInputRef: RefObject<HTMLInputElement | null>;
	pasteMode: PasteMode;
	pasteText: string;
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
	palettePrimary: string;
	paletteSurfaceLight: string;
	paletteText: string;
	paletteTextMuted: string;
	btnStyle: (active?: boolean) => CSSProperties;
	onDragStateChange: (dragging: boolean) => void;
	onFileDrop: (event: DragEvent<HTMLDivElement>) => void;
	onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
	onPasteModeChange: (mode: PasteMode) => void;
	onPasteTextChange: (value: string) => void;
	onApplyPaste: () => void;
	onLoadSampleData: () => void;
	onClearAll: () => void;
}

export function GridGeneratorDataColumn({
	isDragging,
	fileInputRef,
	pasteMode,
	pasteText,
	rods,
	conductors,
	placements,
	palettePrimary,
	paletteSurfaceLight,
	paletteText,
	paletteTextMuted,
	btnStyle,
	onDragStateChange,
	onFileDrop,
	onFileSelect,
	onPasteModeChange,
	onPasteTextChange,
	onApplyPaste,
	onLoadSampleData,
	onClearAll,
}: GridGeneratorDataColumnProps) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
			<div
				onDragOver={(e) => {
					e.preventDefault();
					onDragStateChange(true);
				}}
				onDragLeave={() => onDragStateChange(false)}
				onDrop={(e) => {
					onDragStateChange(false);
					onFileDrop(e);
				}}
				onClick={() => fileInputRef.current?.click()}
				style={{
					padding: 24,
					borderRadius: 10,
					border: `2px dashed ${isDragging ? "#f59e0b" : hexToRgba(palettePrimary, 0.25)}`,
					background: isDragging
						? hexToRgba("#f59e0b", 0.08)
						: hexToRgba(paletteSurfaceLight, 0.2),
					cursor: "pointer",
					textAlign: "center",
					transition: "all 0.2s",
				}}
			>
				<Upload
					size={28}
					color={isDragging ? "#f59e0b" : paletteTextMuted}
					style={{ margin: "0 auto 8px" }}
				/>
				<div style={{ fontSize: 13, fontWeight: 600, color: paletteText }}>
					Drop CSV file here or click to browse
				</div>
				<div style={{ fontSize: 11, color: paletteTextMuted, marginTop: 4 }}>
					Supports rod tables and conductor tables (.csv, .txt)
				</div>
				<input
					ref={fileInputRef}
					type="file"
					accept=".csv,.txt"
					onChange={onFileSelect}
					style={{ display: "none" }}
				/>
			</div>

			<div
				style={{
					borderRadius: 8,
					border: `1px solid ${hexToRgba(palettePrimary, 0.15)}`,
					background: hexToRgba(paletteSurfaceLight, 0.2),
					overflow: "hidden",
				}}
			>
				<div
					style={{
						padding: "10px 12px 6px",
						borderBottom: `1px solid ${hexToRgba(palettePrimary, 0.08)}`,
					}}
				>
					<div
						style={{
							fontSize: 12,
							fontWeight: 600,
							color: paletteText,
							marginBottom: 2,
						}}
					>
						Paste Coordinate Data
					</div>
					<div
						style={{
							fontSize: 11,
							color: paletteTextMuted,
							lineHeight: 1.4,
						}}
					>
						Paste your tab-separated coordinates below to generate the ground
						grid design.
					</div>
				</div>
				<div
					style={{
						display: "flex",
						borderBottom: `1px solid ${hexToRgba(palettePrimary, 0.1)}`,
					}}
				>
					{(["rods", "conductors"] as const).map((mode) => (
						<button
							key={mode}
							onClick={() => onPasteModeChange(mode)}
							style={{
								flex: 1,
								padding: "6px 0",
								fontSize: 11,
								fontWeight: 600,
								border: "none",
								cursor: "pointer",
								background:
									pasteMode === mode
										? hexToRgba(palettePrimary, 0.12)
										: "transparent",
								color: pasteMode === mode ? paletteText : paletteTextMuted,
								borderBottom:
									pasteMode === mode
										? "2px solid #f59e0b"
										: "2px solid transparent",
							}}
						>
							Paste {mode.charAt(0).toUpperCase() + mode.slice(1)}
						</button>
					))}
				</div>
				<div
					style={{
						padding: "6px 10px 0",
						fontSize: 10,
						fontFamily: "ui-monospace, SFMono-Regular, monospace",
						color: paletteTextMuted,
						borderBottom: `1px solid ${hexToRgba(palettePrimary, 0.06)}`,
						overflow: "hidden",
					}}
				>
					{pasteMode === "rods" ? (
						<div style={{ display: "flex", width: "100%", paddingBottom: 4 }}>
							{["Label", "Depth", "X", "Y", "Dia", "GridX", "GridY"].map(
								(header) => (
									<span
										key={header}
										style={{ flex: 1, textAlign: "left", paddingLeft: 2 }}
									>
										{header}
									</span>
								),
							)}
						</div>
					) : (
						<div style={{ display: "flex", width: "100%", paddingBottom: 4 }}>
							{["#", "Label", "Len", "X1", "Y1", "Dia", "X2", "Y2"].map(
								(header) => (
									<span
										key={header}
										style={{ flex: 1, textAlign: "left", paddingLeft: 2 }}
									>
										{header}
									</span>
								),
							)}
						</div>
					)}
				</div>
				<textarea
					value={pasteText}
					onChange={(e) => onPasteTextChange(e.target.value)}
					placeholder={
						pasteMode === "rods"
							? "R1\t20\t0\t0\t1.5\t0\t0\nR2\t20\t286\t0\t1.5\t286\t0"
							: "1\tC1\t286\t0\t0\t1.5\t286\t0\n2\tC2\t286\t0\t8\t1.5\t286\t8"
					}
					style={{
						width: "100%",
						minHeight: 80,
						padding: "6px 10px",
						fontSize: 11,
						fontFamily: "ui-monospace, SFMono-Regular, monospace",
						background: "transparent",
						border: "none",
						color: paletteText,
						outline: "none",
						resize: "none",
						boxSizing: "border-box",
						textAlign: "left",
						tabSize: 8,
						whiteSpace: "pre",
					}}
				/>
				<div style={{ display: "flex", gap: 6, padding: "6px 10px" }}>
					<button onClick={onApplyPaste} style={btnStyle()}>
						<FileSpreadsheet size={12} /> Parse
					</button>
					<button onClick={onLoadSampleData} style={btnStyle()}>
						Load Sample Data
					</button>
					{(rods.length > 0 ||
						conductors.length > 0 ||
						placements.length > 0) && (
						<button
							onClick={onClearAll}
							style={{
								...btnStyle(),
								borderColor: hexToRgba("#ef4444", 0.3),
								color: "#ef4444",
							}}
						>
							<Trash2 size={12} /> Clear All
						</button>
					)}
				</div>
			</div>

			{rods.length > 0 && (
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
								{rods.map((r, i) => (
									<tr
										key={`rod-${i}`}
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
											{r.label}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{r.grid_x}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{r.grid_y}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{r.depth}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{r.diameter}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{conductors.length > 0 && (
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
								{conductors.map((c, i) => (
									<tr
										key={`conductor-${i}`}
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
											{c.label}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{c.x1}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{c.y1}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{c.x2}
										</td>
										<td
											style={{
												padding: "2px 6px",
												textAlign: "center",
												fontFamily: "monospace",
											}}
										>
											{c.y2}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
