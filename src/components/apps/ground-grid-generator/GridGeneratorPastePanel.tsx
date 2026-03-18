import { FileSpreadsheet, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { hexToRgba } from "@/lib/palette";
import type { PasteMode } from "./GridGeneratorPanelModels";
import type { GridConductor, GridPlacement, GridRod } from "./types";
import styles from "./GridGeneratorPastePanel.module.css";

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
	const panelVars = {
		"--gg-primary": palettePrimary,
		"--gg-surface-light": paletteSurfaceLight,
		"--gg-text": paletteText,
		"--gg-text-muted": paletteTextMuted,
	} as CSSProperties;

	return (
		<div className={styles.panel} style={panelVars}>
			<div className={styles.header}>
				<div className={styles.title}>Paste Coordinate Data</div>
				<div className={styles.subtitle}>
					Paste your tab-separated coordinates below to generate the ground grid
					design.
				</div>
			</div>
			<div className={styles.modeTabs}>
				{(["rods", "conductors"] as const).map((mode) => (
					<button
						key={mode}
						onClick={() => onPasteModeChange(mode)}
						className={`${styles.modeTab} ${pasteMode === mode ? styles.modeTabActive : ""}`}
					>
						Paste {mode.charAt(0).toUpperCase() + mode.slice(1)}
					</button>
				))}
			</div>
			<div className={styles.schemaHeader}>
				<pre className={styles.schemaPre}>
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
				className={styles.textarea}
				name="gridgeneratorpastepanel_textarea_137"
			/>
			<div className={styles.actions}>
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
