import { type CSSProperties, useRef } from "react";
import { useResolvedAppearance } from "@/lib/appearance/useResolvedAppearance";
import { hexToRgba } from "@/lib/palette";
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
	const appearance = useResolvedAppearance();
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
		border: `1px solid ${hexToRgba(appearance.primary, active ? 0.4 : 0.15)}`,
		borderRadius: 5,
		background: active ? hexToRgba(appearance.primary, 0.15) : "transparent",
		color: active ? appearance.text : appearance.textMuted,
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
		background: hexToRgba(appearance.surfaceElevated, 0.3),
		border: `1px solid ${hexToRgba(appearance.primary, 0.15)}`,
		borderRadius: 4,
		color: appearance.text,
		outline: "none",
	};

	const inputRowStyle: CSSProperties = {
		display: "flex",
		gap: 4,
		alignItems: "center",
		fontSize: 10,
		color: appearance.textMuted,
		padding: "4px 8px",
		borderRadius: 5,
		background: hexToRgba(appearance.surfaceElevated, 0.15),
		border: `1px solid ${hexToRgba(appearance.primary, 0.08)}`,
		minWidth: 0,
	};

	const tableRowStyle = (selected: boolean): CSSProperties => ({
		cursor: "pointer",
		background: selected ? hexToRgba(appearance.primary, 0.15) : "transparent",
		borderLeft: selected
			? `2px solid ${appearance.primary}`
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
				mutedTextColor={appearance.textMuted}
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
				primaryColor={appearance.primary}
				backgroundColor={appearance.background}
				mutedTextColor={appearance.textMuted}
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
				textColor={appearance.text}
				mutedTextColor={appearance.textMuted}
				primaryColor={appearance.primary}
				onSelectRod={handleSelectRod}
				onSelectConductor={handleSelectConductor}
				onSelectTee={handleSelectTee}
				onSelectCross={handleSelectCross}
				tableRowStyle={tableRowStyle}
			/>

			<GridManualEditorSuggestionDialog
				suggestion={suggestion}
				suggestionCoords={suggestionCoords}
				mutedTextColor={appearance.textMuted}
				inputStyle={inputStyle}
				btnStyle={btnStyle}
				onSuggestionCoordsChange={setSuggestionCoords}
				onCancel={cancelSuggestion}
				onConfirm={confirmSuggestion}
			/>
		</div>
	);
}
