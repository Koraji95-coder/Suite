import { type CSSProperties, useRef } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { GridManualEditorCanvas } from "./GridManualEditorCanvas";
import type { GridManualEditorProps } from "./GridManualEditorModels";
import { GridManualEditorSuggestionDialog } from "./GridManualEditorSuggestionDialog";
import { GridManualEditorTables } from "./GridManualEditorTables";
import { GridManualEditorToolbar } from "./GridManualEditorToolbar";
import { useGridManualEditorState } from "./useGridManualEditorState";

export function GridManualEditor({
	rods,
	conductors,
	placements,
	onRodsChange,
	onConductorsChange,
	onPlacementsChange,
}: GridManualEditorProps) {
	const { palette } = useTheme();
	const svgRef = useRef<SVGSVGElement>(null);
	const {
		addConductorByCoord,
		addRodByCoord,
		cancelSuggestion,
		conductorStart,
		confirmSuggestion,
		coordInput,
		crosses,
		handleSelectConductor,
		handleSelectCross,
		handleSelectRod,
		handleSelectTee,
		handleSvgClick,
		handleWheel,
		handleZoomIn,
		handleZoomOut,
		lineInput,
		mode,
		rodScale,
		selectedConductor,
		selectedCrossKey,
		selectedRod,
		selectedTeeKey,
		setCoordInput,
		setEditorMode,
		setLineInput,
		setShowConductorInput,
		setShowRodInput,
		showConductorInput,
		showRodInput,
		suggestion,
		suggestionCoords,
		setSuggestionCoords,
		tees,
		viewBox,
		zoom,
	} = useGridManualEditorState({
		rods,
		conductors,
		placements,
		svgRef,
		onRodsChange,
		onConductorsChange,
		onPlacementsChange,
	});

	const btnStyle = (active: boolean): CSSProperties => ({
		padding: "5px 10px",
		fontSize: 11,
		fontWeight: 600,
		border: `1px solid ${hexToRgba(palette.primary, active ? 0.4 : 0.15)}`,
		borderRadius: 5,
		background: active ? hexToRgba(palette.primary, 0.15) : "transparent",
		color: active ? palette.text : palette.textMuted,
		cursor: "pointer",
		display: "flex",
		alignItems: "center",
		gap: 4,
		whiteSpace: "nowrap",
		minWidth: "fit-content",
	});

	const inputStyle: CSSProperties = {
		width: 60,
		padding: "4px 6px",
		fontSize: 11,
		fontFamily: "monospace",
		background: hexToRgba(palette.surfaceLight, 0.3),
		border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
		borderRadius: 4,
		color: palette.text,
		outline: "none",
	};

	const inputRowStyle: CSSProperties = {
		display: "flex",
		gap: 4,
		alignItems: "center",
		fontSize: 10,
		color: palette.textMuted,
		padding: "4px 8px",
		borderRadius: 5,
		background: hexToRgba(palette.surfaceLight, 0.15),
		border: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
		minWidth: 0,
	};

	const tableRowStyle = (selected: boolean): CSSProperties => ({
		cursor: "pointer",
		background: selected ? hexToRgba(palette.primary, 0.15) : "transparent",
		borderLeft: selected
			? `2px solid ${palette.primary}`
			: "2px solid transparent",
	});

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 8,
				height: "100%",
				padding: 8,
				overflow: "auto",
			}}
		>
			<GridManualEditorToolbar
				mode={mode}
				zoom={zoom}
				conductorStart={conductorStart}
				showRodInput={showRodInput}
				showConductorInput={showConductorInput}
				coordInput={coordInput}
				lineInput={lineInput}
				mutedTextColor={palette.textMuted}
				onChangeMode={setEditorMode}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onCoordInputChange={setCoordInput}
				onLineInputChange={setLineInput}
				onAddRodByCoord={addRodByCoord}
				onAddConductorByCoord={addConductorByCoord}
				onToggleRodInput={setShowRodInput}
				onToggleConductorInput={setShowConductorInput}
				btnStyle={btnStyle}
				inputStyle={inputStyle}
				inputRowStyle={inputRowStyle}
			/>

			<GridManualEditorCanvas
				svgRef={svgRef}
				viewBox={viewBox}
				mode={mode}
				rodScale={rodScale}
				rods={rods}
				conductors={conductors}
				tees={tees}
				crosses={crosses}
				selectedRod={selectedRod}
				selectedConductor={selectedConductor}
				selectedTeeKey={selectedTeeKey}
				selectedCrossKey={selectedCrossKey}
				conductorStart={conductorStart}
				primaryColor={palette.primary}
				backgroundColor={palette.background}
				mutedTextColor={palette.textMuted}
				onSvgClick={handleSvgClick}
				onWheel={handleWheel}
				onSelectRod={handleSelectRod}
				onSelectConductor={handleSelectConductor}
				onSelectTee={handleSelectTee}
				onSelectCross={handleSelectCross}
			/>

			<GridManualEditorTables
				rods={rods}
				conductors={conductors}
				tees={tees}
				crosses={crosses}
				selectedRod={selectedRod}
				selectedConductor={selectedConductor}
				selectedTeeKey={selectedTeeKey}
				selectedCrossKey={selectedCrossKey}
				textColor={palette.text}
				mutedTextColor={palette.textMuted}
				primaryColor={palette.primary}
				onSelectRod={handleSelectRod}
				onSelectConductor={handleSelectConductor}
				onSelectTee={handleSelectTee}
				onSelectCross={handleSelectCross}
				tableRowStyle={tableRowStyle}
			/>

			<GridManualEditorSuggestionDialog
				suggestion={suggestion}
				suggestionCoords={suggestionCoords}
				mutedTextColor={palette.textMuted}
				inputStyle={inputStyle}
				btnStyle={btnStyle}
				onSuggestionCoordsChange={setSuggestionCoords}
				onCancel={cancelSuggestion}
				onConfirm={confirmSuggestion}
			/>
		</div>
	);
}
