import { useCallback, useMemo, useRef, useState } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { GridManualEditorCanvas } from "./GridManualEditorCanvas";
import type {
	EditorMode,
	GridManualEditorProps,
	PlacementSuggestion,
	SuggestionCoords,
} from "./GridManualEditorModels";
import { GridManualEditorSuggestionDialog } from "./GridManualEditorSuggestionDialog";
import { GridManualEditorTables } from "./GridManualEditorTables";
import { GridManualEditorToolbar } from "./GridManualEditorToolbar";
import {
	clientPointToViewBoxPoint,
	computeGridBounds2D,
	computeScaleFromBounds,
	formatViewBox,
	zoomBoundsToViewBox,
} from "./gridViewUtils";

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
	const [mode, setMode] = useState<EditorMode>("select");
	const [selectedRod, setSelectedRod] = useState<number | null>(null);
	const [selectedConductor, setSelectedConductor] = useState<number | null>(
		null,
	);

	// Stable key-based selection prevents index drift after mutations.
	const [selectedTeeKey, setSelectedTeeKey] = useState<string | null>(null);
	const [selectedCrossKey, setSelectedCrossKey] = useState<string | null>(null);

	const [conductorStart, setConductorStart] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const [showRodInput, setShowRodInput] = useState(false);
	const [showConductorInput, setShowConductorInput] = useState(false);
	const [coordInput, setCoordInput] = useState({ x: "", y: "" });
	const [lineInput, setLineInput] = useState({
		x1: "",
		y1: "",
		x2: "",
		y2: "",
	});
	const [suggestion, setSuggestion] = useState<PlacementSuggestion | null>(
		null,
	);
	const [suggestionCoords, setSuggestionCoords] = useState<SuggestionCoords>({
		x: "",
		y: "",
		endX: "",
		endY: "",
	});
	const [zoom, setZoom] = useState(1);

	const bounds = useMemo(
		() =>
			computeGridBounds2D(rods, conductors, {
				fallback: { minX: -50, minY: -50, maxX: 50, maxY: 50 },
				padRatio: 0.25,
				minPad: 10,
			}),
		[rods, conductors],
	);

	const zoomedViewBox = useMemo(
		() => zoomBoundsToViewBox(bounds, zoom),
		[bounds, zoom],
	);
	const viewBox = useMemo(() => formatViewBox(zoomedViewBox), [zoomedViewBox]);
	const rodScale = computeScaleFromBounds(bounds, 0.012, zoom);

	const handleZoomIn = () => setZoom((z) => Math.min(z * 1.3, 4));
	const handleZoomOut = () => setZoom((z) => Math.max(z / 1.3, 0.5));

	const svgToWorld = useCallback(
		(clientX: number, clientY: number) => {
			const svg = svgRef.current;
			if (!svg) return { x: 0, y: 0 };
			const rect = svg.getBoundingClientRect();

			return clientPointToViewBoxPoint(clientX, clientY, rect, zoomedViewBox);
		},
		[zoomedViewBox],
	);

	const snapToGrid = useCallback(
		(value: number): number => Math.round(value * 100) / 100,
		[],
	);

	const clearSelection = useCallback(() => {
		setSelectedRod(null);
		setSelectedConductor(null);
		setSelectedTeeKey(null);
		setSelectedCrossKey(null);
	}, []);

	const setEditorMode = useCallback((nextMode: EditorMode) => {
		setMode(nextMode);
		setConductorStart(null);
		setSuggestion(null);
		if (nextMode === "add-rod") setShowRodInput(true);
		if (nextMode === "add-conductor") setShowConductorInput(true);
	}, []);

	const confirmSuggestion = useCallback(() => {
		if (!suggestion) return;

		const x = parseFloat(suggestionCoords.x);
		const y = parseFloat(suggestionCoords.y);
		if (Number.isNaN(x) || Number.isNaN(y)) return;

		if (suggestion.type === "add-rod") {
			onRodsChange([
				...rods,
				{
					label: `R${rods.length + 1}`,
					grid_x: x,
					grid_y: y,
					depth: 20,
					diameter: 1.5,
					sort_order: rods.length,
				},
			]);
		} else if (suggestion.type === "add-conductor") {
			const endX = parseFloat(suggestionCoords.endX);
			const endY = parseFloat(suggestionCoords.endY);
			if (Number.isNaN(endX) || Number.isNaN(endY)) return;

			onConductorsChange([
				...conductors,
				{
					label: `C${conductors.length + 1}`,
					length: null,
					x1: x,
					y1: y,
					x2: endX,
					y2: endY,
					diameter: 1.5,
					sort_order: conductors.length,
				},
			]);
			setConductorStart(null);
		} else if (suggestion.type === "add-tee") {
			onPlacementsChange([
				...placements,
				{
					type: "TEE",
					grid_x: x,
					grid_y: y,
					autocad_x: x,
					autocad_y: y,
					rotation_deg: 0,
				},
			]);
		} else if (suggestion.type === "add-cross") {
			onPlacementsChange([
				...placements,
				{
					type: "CROSS",
					grid_x: x,
					grid_y: y,
					autocad_x: x,
					autocad_y: y,
					rotation_deg: 0,
				},
			]);
		}

		setSuggestion(null);
	}, [
		suggestion,
		suggestionCoords,
		onRodsChange,
		onConductorsChange,
		onPlacementsChange,
		rods,
		conductors,
		placements,
	]);

	const handleSvgClick = useCallback(
		(e: React.MouseEvent<SVGSVGElement>) => {
			if (suggestion) return;

			const { x, y } = svgToWorld(e.clientX, e.clientY);
			const snappedX = snapToGrid(x);
			const snappedY = snapToGrid(y);

			if (mode === "select") {
				clearSelection();
				return;
			}

			if (mode === "add-rod" || mode === "add-tee" || mode === "add-cross") {
				setSuggestion({ type: mode, x: snappedX, y: snappedY });
				setSuggestionCoords({
					x: String(snappedX),
					y: String(snappedY),
					endX: "",
					endY: "",
				});
				return;
			}

			if (mode === "add-conductor") {
				if (!conductorStart) {
					setConductorStart({ x: snappedX, y: snappedY });
				} else {
					setSuggestion({
						type: mode,
						x: conductorStart.x,
						y: conductorStart.y,
						endX: snappedX,
						endY: snappedY,
					});
					setSuggestionCoords({
						x: String(conductorStart.x),
						y: String(conductorStart.y),
						endX: String(snappedX),
						endY: String(snappedY),
					});
				}
				return;
			}

			if (mode === "delete") {
				const threshold = rodScale * 2 * zoom;

				for (let i = 0; i < rods.length; i += 1) {
					const dist = Math.sqrt(
						(x - rods[i].grid_x) ** 2 + (y - rods[i].grid_y) ** 2,
					);
					if (dist < threshold) {
						onRodsChange(rods.filter((_, idx) => idx !== i));
						return;
					}
				}

				for (let i = 0; i < conductors.length; i += 1) {
					const c = conductors[i];
					const dx = c.x2 - c.x1;
					const dy = c.y2 - c.y1;
					const len = Math.sqrt(dx * dx + dy * dy);
					if (len < 0.01) continue;

					const t = Math.max(
						0,
						Math.min(1, ((x - c.x1) * dx + (y - c.y1) * dy) / (len * len)),
					);
					const closestX = c.x1 + t * dx;
					const closestY = c.y1 + t * dy;
					const dist = Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);

					if (dist < threshold) {
						onConductorsChange(conductors.filter((_, idx) => idx !== i));
						return;
					}
				}
			}
		},
		[
			suggestion,
			svgToWorld,
			snapToGrid,
			mode,
			clearSelection,
			conductorStart,
			rodScale,
			zoom,
			rods,
			conductors,
			onRodsChange,
			onConductorsChange,
		],
	);

	const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
		e.preventDefault();
		if (e.deltaY < 0) setZoom((z) => Math.min(z * 1.1, 4));
		else setZoom((z) => Math.max(z / 1.1, 0.5));
	}, []);

	const addRodByCoord = () => {
		const x = parseFloat(coordInput.x);
		const y = parseFloat(coordInput.y);
		if (Number.isNaN(x) || Number.isNaN(y)) return;

		onRodsChange([
			...rods,
			{
				label: `R${rods.length + 1}`,
				grid_x: x,
				grid_y: y,
				depth: 20,
				diameter: 1.5,
				sort_order: rods.length,
			},
		]);
		setCoordInput({ x: "", y: "" });
	};

	const addConductorByCoord = () => {
		const x1 = parseFloat(lineInput.x1);
		const y1 = parseFloat(lineInput.y1);
		const x2 = parseFloat(lineInput.x2);
		const y2 = parseFloat(lineInput.y2);

		if (
			Number.isNaN(x1) ||
			Number.isNaN(y1) ||
			Number.isNaN(x2) ||
			Number.isNaN(y2)
		)
			return;

		onConductorsChange([
			...conductors,
			{
				label: `C${conductors.length + 1}`,
				length: null,
				x1,
				y1,
				x2,
				y2,
				diameter: 1.5,
				sort_order: conductors.length,
			},
		]);
		setLineInput({ x1: "", y1: "", x2: "", y2: "" });
	};

	const btnStyle = (active: boolean): React.CSSProperties => ({
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

	const inputStyle: React.CSSProperties = {
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

	const inputRowStyle: React.CSSProperties = {
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

	const tableRowStyle = (selected: boolean): React.CSSProperties => ({
		cursor: "pointer",
		background: selected ? hexToRgba(palette.primary, 0.15) : "transparent",
		borderLeft: selected
			? `2px solid ${palette.primary}`
			: "2px solid transparent",
	});

	const tees = placements.filter((p) => p.type === "TEE");
	const crosses = placements.filter((p) => p.type === "CROSS");

	const handleSelectRod = useCallback(
		(index: number) => {
			clearSelection();
			setSelectedRod(index);
		},
		[clearSelection],
	);

	const handleSelectConductor = useCallback(
		(index: number) => {
			clearSelection();
			setSelectedConductor(index);
		},
		[clearSelection],
	);

	const handleSelectTee = useCallback(
		(key: string) => {
			clearSelection();
			setSelectedTeeKey(key);
		},
		[clearSelection],
	);

	const handleSelectCross = useCallback(
		(key: string) => {
			clearSelection();
			setSelectedCrossKey(key);
		},
		[clearSelection],
	);

	const cancelSuggestion = useCallback(() => {
		setSuggestion(null);
		setConductorStart(null);
	}, []);

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
