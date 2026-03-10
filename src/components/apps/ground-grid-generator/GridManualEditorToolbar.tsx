import { MousePointer, Plus, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import type { CSSProperties } from "react";
import type {
	CoordInput,
	EditorMode,
	LineInput,
} from "./GridManualEditorModels";

interface GridManualEditorToolbarProps {
	mode: EditorMode;
	zoom: number;
	conductorStart: { x: number; y: number } | null;
	showRodInput: boolean;
	showConductorInput: boolean;
	coordInput: CoordInput;
	lineInput: LineInput;
	mutedTextColor: string;
	onChangeMode: (mode: EditorMode) => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onCoordInputChange: (next: CoordInput) => void;
	onLineInputChange: (next: LineInput) => void;
	onAddRodByCoord: () => void;
	onAddConductorByCoord: () => void;
	onToggleRodInput: (open: boolean) => void;
	onToggleConductorInput: (open: boolean) => void;
	btnStyle: (active: boolean) => CSSProperties;
	inputStyle: CSSProperties;
	inputRowStyle: CSSProperties;
}

export function GridManualEditorToolbar({
	mode,
	zoom,
	conductorStart,
	showRodInput,
	showConductorInput,
	coordInput,
	lineInput,
	mutedTextColor,
	onChangeMode,
	onZoomIn,
	onZoomOut,
	onCoordInputChange,
	onLineInputChange,
	onAddRodByCoord,
	onAddConductorByCoord,
	onToggleRodInput,
	onToggleConductorInput,
	btnStyle,
	inputStyle,
	inputRowStyle,
}: GridManualEditorToolbarProps) {
	return (
		<>
			<div
				style={{
					display: "flex",
					gap: 6,
					flexWrap: "wrap",
					alignItems: "center",
				}}
			>
				<button
					onClick={() => onChangeMode("select")}
					style={btnStyle(mode === "select")}
				>
					<MousePointer size={12} /> Select
				</button>

				<button
					onClick={() => onChangeMode("add-rod")}
					style={btnStyle(mode === "add-rod")}
				>
					<Plus size={12} /> Add Rod
				</button>

				<button
					onClick={() => onChangeMode("add-conductor")}
					style={btnStyle(mode === "add-conductor")}
				>
					<Plus size={12} /> Add Conductor
				</button>

				<button
					onClick={() => onChangeMode("add-tee")}
					style={btnStyle(mode === "add-tee")}
				>
					<Plus size={12} /> Add Tee
				</button>

				<button
					onClick={() => onChangeMode("add-cross")}
					style={btnStyle(mode === "add-cross")}
				>
					<Plus size={12} /> Add Cross
				</button>

				<button
					onClick={() => onChangeMode("delete")}
					style={btnStyle(mode === "delete")}
				>
					<Trash2 size={12} /> Delete
				</button>

				<div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
					<button onClick={onZoomIn} style={btnStyle(false)} title="Zoom In">
						<ZoomIn size={12} />
					</button>
					<button onClick={onZoomOut} style={btnStyle(false)} title="Zoom Out">
						<ZoomOut size={12} />
					</button>
					<span
						style={{
							fontSize: 9,
							color: mutedTextColor,
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
								onCoordInputChange({ ...coordInput, x: e.target.value })
							}
							style={inputStyle}
						name="gridmanualeditortoolbar_input_144"
						/>
						<input
							placeholder="Y"
							value={coordInput.y}
							onChange={(e) =>
								onCoordInputChange({ ...coordInput, y: e.target.value })
							}
							style={inputStyle}
						name="gridmanualeditortoolbar_input_152"
						/>
						<button onClick={onAddRodByCoord} style={btnStyle(false)}>
							Add
						</button>
						<button
							onClick={() => onToggleRodInput(false)}
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
								onLineInputChange({ ...lineInput, x1: e.target.value })
							}
							style={inputStyle}
						name="gridmanualeditortoolbar_input_175"
						/>
						<input
							placeholder="Y1"
							value={lineInput.y1}
							onChange={(e) =>
								onLineInputChange({ ...lineInput, y1: e.target.value })
							}
							style={inputStyle}
						name="gridmanualeditortoolbar_input_183"
						/>
						<input
							placeholder="X2"
							value={lineInput.x2}
							onChange={(e) =>
								onLineInputChange({ ...lineInput, x2: e.target.value })
							}
							style={inputStyle}
						name="gridmanualeditortoolbar_input_191"
						/>
						<input
							placeholder="Y2"
							value={lineInput.y2}
							onChange={(e) =>
								onLineInputChange({ ...lineInput, y2: e.target.value })
							}
							style={inputStyle}
						name="gridmanualeditortoolbar_input_199"
						/>
						<button onClick={onAddConductorByCoord} style={btnStyle(false)}>
							Add
						</button>
						<button
							onClick={() => onToggleConductorInput(false)}
							style={{ ...btnStyle(false), padding: "5px 6px" }}
						>
							<X size={10} />
						</button>
					</div>
				)}
			</div>
		</>
	);
}
