import {
	Check,
	MousePointer,
	Plus,
	Trash2,
	X,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import type { GridConductor, GridPlacement, GridRod } from "./types";

type EditorMode =
	| "select"
	| "add-rod"
	| "add-conductor"
	| "add-tee"
	| "add-cross"
	| "delete";

interface PlacementSuggestion {
	type: EditorMode;
	x: number;
	y: number;
	endX?: number;
	endY?: number;
}

interface GridManualEditorProps {
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
	onRodsChange: (rods: GridRod[]) => void;
	onConductorsChange: (conductors: GridConductor[]) => void;
	onPlacementsChange: (placements: GridPlacement[]) => void;
}

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
	const [selectedTee, setSelectedTee] = useState<number | null>(null);
	const [selectedCross, setSelectedCross] = useState<number | null>(null);
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
	const [suggestionCoords, setSuggestionCoords] = useState({
		x: "",
		y: "",
		endX: "",
		endY: "",
	});
	const [zoom, setZoom] = useState(1);

	const bounds = useMemo(() => {
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const r of rods) {
			minX = Math.min(minX, r.grid_x);
			minY = Math.min(minY, r.grid_y);
			maxX = Math.max(maxX, r.grid_x);
			maxY = Math.max(maxY, r.grid_y);
		}
		for (const c of conductors) {
			minX = Math.min(minX, c.x1, c.x2);
			minY = Math.min(minY, c.y1, c.y2);
			maxX = Math.max(maxX, c.x1, c.x2);
			maxY = Math.max(maxY, c.y1, c.y2);
		}
		if (!isFinite(minX)) return { minX: -50, minY: -50, maxX: 50, maxY: 50 };
		const pad = Math.max(maxX - minX, maxY - minY) * 0.25 || 10;
		return {
			minX: minX - pad,
			minY: minY - pad,
			maxX: maxX + pad,
			maxY: maxY + pad,
		};
	}, [rods, conductors]);

	const viewBox = useMemo(() => {
		const fullW = bounds.maxX - bounds.minX;
		const fullH = bounds.maxY - bounds.minY;
		const cx = bounds.minX + fullW / 2;
		const cy = bounds.minY + fullH / 2;
		const zW = fullW / zoom;
		const zH = fullH / zoom;
		return `${cx - zW / 2} ${cy - zH / 2} ${zW} ${zH}`;
	}, [bounds, zoom]);

	const rodScale =
		(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.012) /
		zoom;

	const handleZoomIn = () => setZoom((z) => Math.min(z * 1.3, 4));
	const handleZoomOut = () => setZoom((z) => Math.max(z / 1.3, 0.5));

	const svgToWorld = useCallback(
		(clientX: number, clientY: number) => {
			const svg = svgRef.current;
			if (!svg) return { x: 0, y: 0 };
			const rect = svg.getBoundingClientRect();
			const fullW = bounds.maxX - bounds.minX;
			const fullH = bounds.maxY - bounds.minY;
			const cx = bounds.minX + fullW / 2;
			const cy = bounds.minY + fullH / 2;
			const zW = fullW / zoom;
			const zH = fullH / zoom;
			return {
				x: cx - zW / 2 + ((clientX - rect.left) / rect.width) * zW,
				y: cy - zH / 2 + ((clientY - rect.top) / rect.height) * zH,
			};
		},
		[bounds, zoom],
	);

	const snapToGrid = (val: number): number => Math.round(val * 100) / 100;

	const clearSelection = useCallback(() => {
		setSelectedRod(null);
		setSelectedConductor(null);
		setSelectedTee(null);
		setSelectedCross(null);
	}, []);

	const confirmSuggestion = useCallback(() => {
		if (!suggestion) return;
		const x = parseFloat(suggestionCoords.x);
		const y = parseFloat(suggestionCoords.y);
		if (isNaN(x) || isNaN(y)) return;

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
			if (isNaN(endX) || isNaN(endY)) return;
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
		rods,
		conductors,
		placements,
		onRodsChange,
		onConductorsChange,
		onPlacementsChange,
		setConductorStart,
		setSuggestion,
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
			} else if (mode === "add-conductor") {
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
			} else if (mode === "delete") {
				const threshold = rodScale * 2 * zoom;
				let deletedRod = false;
				for (let i = 0; i < rods.length; i++) {
					const dist = Math.sqrt(
						(x - rods[i].grid_x) ** 2 + (y - rods[i].grid_y) ** 2,
					);
					if (dist < threshold) {
						onRodsChange(rods.filter((_, idx) => idx !== i));
						deletedRod = true;
						break;
					}
				}
				if (!deletedRod) {
					for (let i = 0; i < conductors.length; i++) {
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
							break;
						}
					}
				}
			}
		},
		[
			mode,
			rods,
			conductors,
			onRodsChange,
			onConductorsChange,
			conductorStart,
			svgToWorld,
			rodScale,
			suggestion,
			zoom,
			clearSelection,
			setConductorStart,
			setSuggestion,
			setSuggestionCoords,
		],
	);

	const handleWheel = useCallback((e: React.WheelEvent) => {
		e.preventDefault();
		if (e.deltaY < 0) {
			setZoom((z) => Math.min(z * 1.1, 4));
		} else {
			setZoom((z) => Math.max(z / 1.1, 0.5));
		}
	}, []);

	const addRodByCoord = () => {
		const x = parseFloat(coordInput.x);
		const y = parseFloat(coordInput.y);
		if (isNaN(x) || isNaN(y)) return;
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
		if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return;
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

	const tees = placements.filter((p) => p.type === "TEE");
	const crosses = placements.filter((p) => p.type === "CROSS");

	const tableRowStyle = (selected: boolean): React.CSSProperties => ({
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
			<div
				style={{
					display: "flex",
					gap: 6,
					flexWrap: "wrap",
					alignItems: "center",
				}}
			>
				<button
					onClick={() => {
						setMode("select");
						setConductorStart(null);
						setSuggestion(null);
					}}
					style={btnStyle(mode === "select")}
				>
					<MousePointer size={12} /> Select
				</button>
				<button
					onClick={() => {
						setMode("add-rod");
						setConductorStart(null);
						setSuggestion(null);
						setShowRodInput(true);
					}}
					style={btnStyle(mode === "add-rod")}
				>
					<Plus size={12} /> Add Rod
				</button>
				<button
					onClick={() => {
						setMode("add-conductor");
						setConductorStart(null);
						setSuggestion(null);
						setShowConductorInput(true);
					}}
					style={btnStyle(mode === "add-conductor")}
				>
					<Plus size={12} /> Add Conductor
				</button>
				<button
					onClick={() => {
						setMode("add-tee");
						setConductorStart(null);
						setSuggestion(null);
					}}
					style={btnStyle(mode === "add-tee")}
				>
					<Plus size={12} /> Add Tee
				</button>
				<button
					onClick={() => {
						setMode("add-cross");
						setConductorStart(null);
						setSuggestion(null);
					}}
					style={btnStyle(mode === "add-cross")}
				>
					<Plus size={12} /> Add Cross
				</button>
				<button
					onClick={() => {
						setMode("delete");
						setConductorStart(null);
						setSuggestion(null);
					}}
					style={btnStyle(mode === "delete")}
				>
					<Trash2 size={12} /> Delete
				</button>
				<div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
					<button
						onClick={handleZoomIn}
						style={btnStyle(false)}
						title="Zoom In"
					>
						<ZoomIn size={12} />
					</button>
					<button
						onClick={handleZoomOut}
						style={btnStyle(false)}
						title="Zoom Out"
					>
						<ZoomOut size={12} />
					</button>
					<span
						style={{
							fontSize: 9,
							color: palette.textMuted,
							alignSelf: "center",
							minWidth: 30,
							textAlign: "center",
						}}
					>
						{Math.round(zoom * 100)}%
					</span>
				</div>
			</div>

			{conductorStart && (
				<div
					style={{
						fontSize: 10,
						color: "#f59e0b",
						fontWeight: 600,
						padding: "0 4px",
					}}
				>
					Start: ({conductorStart.x}, {conductorStart.y}) -- click end point
				</div>
			)}

			<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
				{showRodInput && (
					<div style={inputRowStyle}>
						<span style={{ fontWeight: 600, minWidth: 24 }}>Rod:</span>
						<input
							placeholder="X"
							value={coordInput.x}
							onChange={(e) =>
								setCoordInput({ ...coordInput, x: e.target.value })
							}
							style={inputStyle}
						/>
						<input
							placeholder="Y"
							value={coordInput.y}
							onChange={(e) =>
								setCoordInput({ ...coordInput, y: e.target.value })
							}
							style={inputStyle}
						/>
						<button onClick={addRodByCoord} style={btnStyle(false)}>
							Add
						</button>
						<button
							onClick={() => setShowRodInput(false)}
							style={{ ...btnStyle(false), padding: "5px 6px" }}
						>
							<X size={10} />
						</button>
					</div>
				)}
				{showConductorInput && (
					<div style={inputRowStyle}>
						<span style={{ fontWeight: 600, minWidth: 24 }}>Cond:</span>
						<input
							placeholder="X1"
							value={lineInput.x1}
							onChange={(e) =>
								setLineInput({ ...lineInput, x1: e.target.value })
							}
							style={inputStyle}
						/>
						<input
							placeholder="Y1"
							value={lineInput.y1}
							onChange={(e) =>
								setLineInput({ ...lineInput, y1: e.target.value })
							}
							style={inputStyle}
						/>
						<input
							placeholder="X2"
							value={lineInput.x2}
							onChange={(e) =>
								setLineInput({ ...lineInput, x2: e.target.value })
							}
							style={inputStyle}
						/>
						<input
							placeholder="Y2"
							value={lineInput.y2}
							onChange={(e) =>
								setLineInput({ ...lineInput, y2: e.target.value })
							}
							style={inputStyle}
						/>
						<button onClick={addConductorByCoord} style={btnStyle(false)}>
							Add
						</button>
						<button
							onClick={() => setShowConductorInput(false)}
							style={{ ...btnStyle(false), padding: "5px 6px" }}
						>
							<X size={10} />
						</button>
					</div>
				)}
			</div>

			<div
				style={{
					minHeight: 300,
					borderRadius: 8,
					border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
					overflow: "hidden",
					position: "relative",
					flexShrink: 0,
					height: 350,
				}}
			>
				<svg
					ref={svgRef}
					viewBox={viewBox}
					style={{
						width: "100%",
						height: "100%",
						background: hexToRgba(palette.background, 0.5),
						cursor:
							mode === "select"
								? "default"
								: mode === "delete"
									? "crosshair"
									: "cell",
					}}
					onClick={handleSvgClick}
					onWheel={handleWheel}
				>
					{conductors.map((c, i) => (
						<g key={`c-${i}`}>
							<line
								x1={c.x1}
								y1={c.y1}
								x2={c.x2}
								y2={c.y2}
								stroke={
									selectedConductor === i ? "#fff" : hexToRgba("#f59e0b", 0.6)
								}
								strokeWidth={rodScale * (selectedConductor === i ? 0.8 : 0.4)}
								strokeLinecap="round"
								onClick={(e) => {
									e.stopPropagation();
									if (mode === "select") {
										clearSelection();
										setSelectedConductor(i);
									}
								}}
								style={{ cursor: mode === "select" ? "pointer" : undefined }}
							/>
							<text
								x={(c.x1 + c.x2) / 2}
								y={(c.y1 + c.y2) / 2 - rodScale * 1}
								fontSize={rodScale * 0.8}
								fill={selectedConductor === i ? "#fff" : palette.textMuted}
								textAnchor="middle"
								style={{ pointerEvents: "none" }}
							>
								{c.label}
							</text>
						</g>
					))}

					{rods.map((r, i) => (
						<g
							key={`r-${i}`}
							onClick={(e) => {
								e.stopPropagation();
								if (mode === "select") {
									clearSelection();
									setSelectedRod(i);
								}
							}}
							style={{ cursor: mode === "select" ? "pointer" : undefined }}
						>
							<circle
								cx={r.grid_x}
								cy={r.grid_y}
								r={rodScale}
								fill={
									selectedRod === i
										? hexToRgba("#fff", 0.3)
										: hexToRgba("#22c55e", 0.3)
								}
								stroke={selectedRod === i ? "#fff" : "#22c55e"}
								strokeWidth={rodScale * 0.2}
							/>
							<line
								x1={r.grid_x - rodScale * 0.7}
								y1={r.grid_y}
								x2={r.grid_x + rodScale * 0.7}
								y2={r.grid_y}
								stroke={selectedRod === i ? "#fff" : "#22c55e"}
								strokeWidth={rodScale * 0.15}
							/>
							<line
								x1={r.grid_x}
								y1={r.grid_y - rodScale * 0.7}
								x2={r.grid_x}
								y2={r.grid_y + rodScale * 0.7}
								stroke={selectedRod === i ? "#fff" : "#22c55e"}
								strokeWidth={rodScale * 0.15}
							/>
							<text
								x={r.grid_x}
								y={r.grid_y - rodScale * 1.4}
								fontSize={rodScale * 0.8}
								fill={selectedRod === i ? "#fff" : palette.textMuted}
								textAnchor="middle"
								style={{ pointerEvents: "none" }}
							>
								{r.label}
							</text>
						</g>
					))}

					{tees.map((p, i) => (
						<g
							key={`tee-${i}`}
							onClick={(e) => {
								e.stopPropagation();
								if (mode === "select") {
									clearSelection();
									setSelectedTee(i);
								}
							}}
							style={{ cursor: mode === "select" ? "pointer" : undefined }}
						>
							<rect
								x={p.grid_x - rodScale * 0.6}
								y={p.grid_y - rodScale * 0.6}
								width={rodScale * 1.2}
								height={rodScale * 1.2}
								fill={
									selectedTee === i
										? hexToRgba("#fff", 0.3)
										: hexToRgba("#3b82f6", 0.3)
								}
								stroke={selectedTee === i ? "#fff" : "#3b82f6"}
								strokeWidth={rodScale * 0.15}
								rx={rodScale * 0.1}
							/>
							<text
								x={p.grid_x}
								y={p.grid_y + rodScale * 0.25}
								fontSize={rodScale * 0.5}
								fill={selectedTee === i ? "#fff" : "#3b82f6"}
								textAnchor="middle"
								style={{ pointerEvents: "none", fontWeight: 700 }}
							>
								T
							</text>
						</g>
					))}

					{crosses.map((p, i) => (
						<g
							key={`cross-${i}`}
							onClick={(e) => {
								e.stopPropagation();
								if (mode === "select") {
									clearSelection();
									setSelectedCross(i);
								}
							}}
							style={{ cursor: mode === "select" ? "pointer" : undefined }}
						>
							<rect
								x={p.grid_x - rodScale * 0.6}
								y={p.grid_y - rodScale * 0.6}
								width={rodScale * 1.2}
								height={rodScale * 1.2}
								fill={
									selectedCross === i
										? hexToRgba("#fff", 0.3)
										: hexToRgba("#06b6d4", 0.3)
								}
								stroke={selectedCross === i ? "#fff" : "#06b6d4"}
								strokeWidth={rodScale * 0.15}
								rx={rodScale * 0.1}
							/>
							<text
								x={p.grid_x}
								y={p.grid_y + rodScale * 0.25}
								fontSize={rodScale * 0.5}
								fill={selectedCross === i ? "#fff" : "#06b6d4"}
								textAnchor="middle"
								style={{ pointerEvents: "none", fontWeight: 700 }}
							>
								+
							</text>
						</g>
					))}

					{conductorStart && (
						<circle
							cx={conductorStart.x}
							cy={conductorStart.y}
							r={rodScale * 0.5}
							fill="#f59e0b"
							opacity={0.8}
						/>
					)}
				</svg>

				{suggestion && (
					<div
						style={{
							position: "absolute",
							top: "50%",
							left: "50%",
							transform: "translate(-50%, -50%)",
							background: palette.surface,
							border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
							borderRadius: 10,
							padding: 16,
							boxShadow: `0 8px 32px ${hexToRgba("#000", 0.4)}`,
							zIndex: 20,
							minWidth: 220,
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<div
							style={{
								fontSize: 12,
								fontWeight: 700,
								color: palette.text,
								marginBottom: 10,
							}}
						>
							{suggestion.type === "add-rod"
								? "Place Rod"
								: suggestion.type === "add-conductor"
									? "Place Conductor"
									: suggestion.type === "add-tee"
										? "Place Tee"
										: "Place Cross"}
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
							<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
								<label
									style={{ fontSize: 10, color: palette.textMuted, width: 20 }}
								>
									{suggestion.type === "add-conductor" ? "X1" : "X"}
								</label>
								<input
									value={suggestionCoords.x}
									onChange={(e) =>
										setSuggestionCoords((s) => ({ ...s, x: e.target.value }))
									}
									style={{ ...inputStyle, flex: 1 }}
									autoFocus
								/>
							</div>
							<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
								<label
									style={{ fontSize: 10, color: palette.textMuted, width: 20 }}
								>
									{suggestion.type === "add-conductor" ? "Y1" : "Y"}
								</label>
								<input
									value={suggestionCoords.y}
									onChange={(e) =>
										setSuggestionCoords((s) => ({ ...s, y: e.target.value }))
									}
									style={{ ...inputStyle, flex: 1 }}
								/>
							</div>
							{suggestion.type === "add-conductor" && (
								<>
									<div
										style={{ display: "flex", gap: 6, alignItems: "center" }}
									>
										<label
											style={{
												fontSize: 10,
												color: palette.textMuted,
												width: 20,
											}}
										>
											X2
										</label>
										<input
											value={suggestionCoords.endX}
											onChange={(e) =>
												setSuggestionCoords((s) => ({
													...s,
													endX: e.target.value,
												}))
											}
											style={{ ...inputStyle, flex: 1 }}
										/>
									</div>
									<div
										style={{ display: "flex", gap: 6, alignItems: "center" }}
									>
										<label
											style={{
												fontSize: 10,
												color: palette.textMuted,
												width: 20,
											}}
										>
											Y2
										</label>
										<input
											value={suggestionCoords.endY}
											onChange={(e) =>
												setSuggestionCoords((s) => ({
													...s,
													endY: e.target.value,
												}))
											}
											style={{ ...inputStyle, flex: 1 }}
										/>
									</div>
								</>
							)}
						</div>
						<div style={{ display: "flex", gap: 6, marginTop: 10 }}>
							<button
								onClick={confirmSuggestion}
								style={{ ...btnStyle(true), flex: 1, justifyContent: "center" }}
							>
								<Check size={12} /> Confirm
							</button>
							<button
								onClick={() => {
									setSuggestion(null);
									setConductorStart(null);
								}}
								style={{
									...btnStyle(false),
									flex: 1,
									justifyContent: "center",
								}}
							>
								<X size={12} /> Cancel
							</button>
						</div>
					</div>
				)}
			</div>

			{(rods.length > 0 ||
				conductors.length > 0 ||
				tees.length > 0 ||
				crosses.length > 0) && (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
						gap: 8,
					}}
				>
					{rods.length > 0 && (
						<div
							style={{
								borderRadius: 6,
								border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
								overflow: "hidden",
							}}
						>
							<div
								style={{
									padding: "4px 8px",
									fontSize: 10,
									fontWeight: 700,
									color: "#22c55e",
									background: hexToRgba("#22c55e", 0.08),
								}}
							>
								Ground Rods ({rods.length})
							</div>
							<div style={{ maxHeight: 120, overflowY: "auto" }}>
								<table
									style={{
										width: "100%",
										fontSize: 9,
										borderCollapse: "collapse",
									}}
								>
									<thead>
										<tr style={{ color: palette.textMuted }}>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												Label
											</th>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												X
											</th>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												Y
											</th>
										</tr>
									</thead>
									<tbody>
										{rods.map((r, i) => (
											<tr
												key={i}
												style={{
													...tableRowStyle(selectedRod === i),
													color: palette.text,
												}}
												onClick={() => {
													clearSelection();
													setSelectedRod(i);
												}}
											>
												<td
													style={{
														padding: "1px 4px",
														fontWeight: 600,
														textAlign: "center",
													}}
												>
													{r.label}
												</td>
												<td
													style={{
														padding: "1px 4px",
														textAlign: "center",
														fontFamily: "monospace",
													}}
												>
													{r.grid_x}
												</td>
												<td
													style={{
														padding: "1px 4px",
														textAlign: "center",
														fontFamily: "monospace",
													}}
												>
													{r.grid_y}
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
								borderRadius: 6,
								border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
								overflow: "hidden",
							}}
						>
							<div
								style={{
									padding: "4px 8px",
									fontSize: 10,
									fontWeight: 700,
									color: "#f59e0b",
									background: hexToRgba("#f59e0b", 0.08),
								}}
							>
								Conductors ({conductors.length})
							</div>
							<div style={{ maxHeight: 120, overflowY: "auto" }}>
								<table
									style={{
										width: "100%",
										fontSize: 9,
										borderCollapse: "collapse",
									}}
								>
									<thead>
										<tr style={{ color: palette.textMuted }}>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												Label
											</th>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												X1
											</th>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												Y1
											</th>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												X2
											</th>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												Y2
											</th>
										</tr>
									</thead>
									<tbody>
										{conductors.map((c, i) => (
											<tr
												key={i}
												style={{
													...tableRowStyle(selectedConductor === i),
													color: palette.text,
												}}
												onClick={() => {
													clearSelection();
													setSelectedConductor(i);
												}}
											>
												<td
													style={{
														padding: "1px 4px",
														fontWeight: 600,
														textAlign: "center",
													}}
												>
													{c.label}
												</td>
												<td
													style={{
														padding: "1px 4px",
														textAlign: "center",
														fontFamily: "monospace",
													}}
												>
													{c.x1}
												</td>
												<td
													style={{
														padding: "1px 4px",
														textAlign: "center",
														fontFamily: "monospace",
													}}
												>
													{c.y1}
												</td>
												<td
													style={{
														padding: "1px 4px",
														textAlign: "center",
														fontFamily: "monospace",
													}}
												>
													{c.x2}
												</td>
												<td
													style={{
														padding: "1px 4px",
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

					{tees.length > 0 && (
						<div
							style={{
								borderRadius: 6,
								border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
								overflow: "hidden",
							}}
						>
							<div
								style={{
									padding: "4px 8px",
									fontSize: 10,
									fontWeight: 700,
									color: "#3b82f6",
									background: hexToRgba("#3b82f6", 0.08),
								}}
							>
								Tees ({tees.length})
							</div>
							<div style={{ maxHeight: 120, overflowY: "auto" }}>
								<table
									style={{
										width: "100%",
										fontSize: 9,
										borderCollapse: "collapse",
									}}
								>
									<thead>
										<tr style={{ color: palette.textMuted }}>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												#
											</th>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												X
											</th>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												Y
											</th>
										</tr>
									</thead>
									<tbody>
										{tees.map((p, i) => (
											<tr
												key={i}
												style={{
													...tableRowStyle(selectedTee === i),
													color: palette.text,
												}}
												onClick={() => {
													clearSelection();
													setSelectedTee(i);
												}}
											>
												<td
													style={{
														padding: "1px 4px",
														fontWeight: 600,
														textAlign: "center",
													}}
												>
													T{i + 1}
												</td>
												<td
													style={{
														padding: "1px 4px",
														textAlign: "center",
														fontFamily: "monospace",
													}}
												>
													{p.grid_x}
												</td>
												<td
													style={{
														padding: "1px 4px",
														textAlign: "center",
														fontFamily: "monospace",
													}}
												>
													{p.grid_y}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					)}

					{crosses.length > 0 && (
						<div
							style={{
								borderRadius: 6,
								border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
								overflow: "hidden",
							}}
						>
							<div
								style={{
									padding: "4px 8px",
									fontSize: 10,
									fontWeight: 700,
									color: "#06b6d4",
									background: hexToRgba("#06b6d4", 0.08),
								}}
							>
								Crosses ({crosses.length})
							</div>
							<div style={{ maxHeight: 120, overflowY: "auto" }}>
								<table
									style={{
										width: "100%",
										fontSize: 9,
										borderCollapse: "collapse",
									}}
								>
									<thead>
										<tr style={{ color: palette.textMuted }}>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												#
											</th>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												X
											</th>
											<th style={{ padding: "2px 4px", textAlign: "center" }}>
												Y
											</th>
										</tr>
									</thead>
									<tbody>
										{crosses.map((p, i) => (
											<tr
												key={i}
												style={{
													...tableRowStyle(selectedCross === i),
													color: palette.text,
												}}
												onClick={() => {
													clearSelection();
													setSelectedCross(i);
												}}
											>
												<td
													style={{
														padding: "1px 4px",
														fontWeight: 600,
														textAlign: "center",
													}}
												>
													X{i + 1}
												</td>
												<td
													style={{
														padding: "1px 4px",
														textAlign: "center",
														fontFamily: "monospace",
													}}
												>
													{p.grid_x}
												</td>
												<td
													style={{
														padding: "1px 4px",
														textAlign: "center",
														fontFamily: "monospace",
													}}
												>
													{p.grid_y}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
