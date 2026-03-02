import type { ChangeEvent, CSSProperties, DragEvent, RefObject } from "react";
import { GridGeneratorDataDropzone } from "./GridGeneratorDataDropzone";
import { GridGeneratorDataPreviewTables } from "./GridGeneratorDataPreviewTables";
import type { PasteMode } from "./GridGeneratorPanelModels";
import { GridGeneratorPastePanel } from "./GridGeneratorPastePanel";
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
			<GridGeneratorDataDropzone
				isDragging={isDragging}
				fileInputRef={fileInputRef}
				palettePrimary={palettePrimary}
				paletteSurfaceLight={paletteSurfaceLight}
				paletteText={paletteText}
				paletteTextMuted={paletteTextMuted}
				onDragStateChange={onDragStateChange}
				onFileDrop={onFileDrop}
				onFileSelect={onFileSelect}
			/>

			<GridGeneratorPastePanel
				pasteMode={pasteMode}
				pasteText={pasteText}
				rods={rods}
				conductors={conductors}
				placements={placements}
				palettePrimary={palettePrimary}
				paletteSurfaceLight={paletteSurfaceLight}
				paletteText={paletteText}
				paletteTextMuted={paletteTextMuted}
				btnStyle={btnStyle}
				onPasteModeChange={onPasteModeChange}
				onPasteTextChange={onPasteTextChange}
				onApplyPaste={onApplyPaste}
				onLoadSampleData={onLoadSampleData}
				onClearAll={onClearAll}
			/>

			<GridGeneratorDataPreviewTables
				rods={rods}
				conductors={conductors}
				palettePrimary={palettePrimary}
				paletteText={paletteText}
				paletteTextMuted={paletteTextMuted}
			/>
		</div>
	);
}
