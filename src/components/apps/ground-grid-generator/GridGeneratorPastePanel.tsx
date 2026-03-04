import { FileSpreadsheet, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { hexToRgba } from "@/lib/palette";
import type { PasteMode } from "./GridGeneratorPanelModels";
import type { GridConductor, GridPlacement, GridRod } from "./types";

interface GridGeneratorPastePanelProps {
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
	onPasteModeChange: (mode: PasteMode) => void;
	onPasteTextChange: (value: string) => void;
	onApplyPaste: () => void;
	onLoadSampleData: () => void;
	onClearAll: () => void;
}

export function GridGeneratorPastePanel({
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
	onPasteModeChange,
	onPasteTextChange,
	onApplyPaste,
	onLoadSampleData,
	onClearAll,
}: GridGeneratorPastePanelProps) {
	return (
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
					Paste your tab-separated coordinates below to generate the ground grid
					design.
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
				<pre
					style={{
						margin: 0,
						paddingBottom: 4,
						fontSize: 11,
						lineHeight: 1.4,
						fontFamily: "ui-monospace, SFMono-Regular, monospace",
						whiteSpace: "pre",
						tabSize: 8,
						fontVariantNumeric: "tabular-nums",
					}}
				>
					{pasteMode === "rods"
						? "Label\tDepth\tX\tY\tDia\tGridX\tGridY"
						: "#\tLabel\tLen\tX1\tY1\tDia\tX2\tY2"}
				</pre>
			</div>
			<textarea
				value={pasteText}
				onChange={(event) => onPasteTextChange(event.target.value)}
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
					lineHeight: 1.4,
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
					fontVariantNumeric: "tabular-nums",
				}}
			/>
			<div style={{ display: "flex", gap: 6, padding: "6px 10px" }}>
				<button onClick={onApplyPaste} style={btnStyle()}>
					<FileSpreadsheet size={12} /> Parse
				</button>
				<button onClick={onLoadSampleData} style={btnStyle()}>
					Load Sample Data
				</button>
				{rods.length > 0 || conductors.length > 0 || placements.length > 0 ? (
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
				) : null}
			</div>
		</div>
	);
}
