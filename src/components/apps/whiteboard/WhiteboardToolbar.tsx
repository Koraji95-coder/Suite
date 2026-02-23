import {
	Circle,
	Eraser,
	Pen,
	Redo,
	Square,
	Trash2,
	Type,
	Undo,
} from "lucide-react";

interface WhiteboardToolbarProps {
	tool: "pen" | "eraser" | "rectangle" | "circle" | "text";
	onToolChange: (
		tool: "pen" | "eraser" | "rectangle" | "circle" | "text",
	) => void;
	color: string;
	onColorChange: (color: string) => void;
	lineWidth: number;
	onLineWidthChange: (width: number) => void;
	onUndo: () => void;
	onRedo: () => void;
	onClear: () => void;
	canUndo: boolean;
	canRedo: boolean;
}

export function WhiteboardToolbar({
	tool,
	onToolChange,
	color,
	onColorChange,
	lineWidth,
	onLineWidthChange,
	onUndo,
	onRedo,
	onClear,
	canUndo,
	canRedo,
}: WhiteboardToolbarProps) {
	return (
		<div className="w-20 bg-black/40 border-r border-white/[0.06] flex flex-col items-center py-4 space-y-2">
			<button
				onClick={() => onToolChange("pen")}
				className={`p-3 rounded-lg transition-all ${
					tool === "pen"
						? "bg-orange-500/30 border border-orange-400"
						: "hover:bg-orange-500/10"
				}`}
				title="Pen"
			>
				<Pen className="w-5 h-5 text-orange-300" />
			</button>
			<button
				onClick={() => onToolChange("eraser")}
				className={`p-3 rounded-lg transition-all ${
					tool === "eraser"
						? "bg-orange-500/30 border border-orange-400"
						: "hover:bg-orange-500/10"
				}`}
				title="Eraser"
			>
				<Eraser className="w-5 h-5 text-orange-300" />
			</button>
			<button
				onClick={() => onToolChange("rectangle")}
				className={`p-3 rounded-lg transition-all ${
					tool === "rectangle"
						? "bg-orange-500/30 border border-orange-400"
						: "hover:bg-orange-500/10"
				}`}
				title="Rectangle"
			>
				<Square className="w-5 h-5 text-orange-300" />
			</button>
			<button
				onClick={() => onToolChange("circle")}
				className={`p-3 rounded-lg transition-all ${
					tool === "circle"
						? "bg-orange-500/30 border border-orange-400"
						: "hover:bg-orange-500/10"
				}`}
				title="Circle"
			>
				<Circle className="w-5 h-5 text-orange-300" />
			</button>
			<button
				onClick={() => onToolChange("text")}
				className={`p-3 rounded-lg transition-all ${
					tool === "text"
						? "bg-orange-500/30 border border-orange-400"
						: "hover:bg-orange-500/10"
				}`}
				title="Text"
			>
				<Type className="w-5 h-5 text-orange-300" />
			</button>

			<div className="h-px bg-white/[0.06] w-12 my-2"></div>

			<button
				onClick={onUndo}
				className="p-3 rounded-lg hover:bg-orange-500/10 transition-all disabled:opacity-30"
				title="Undo"
				disabled={!canUndo}
			>
				<Undo className="w-5 h-5 text-orange-300" />
			</button>
			<button
				onClick={onRedo}
				className="p-3 rounded-lg hover:bg-orange-500/10 transition-all disabled:opacity-30"
				title="Redo"
				disabled={!canRedo}
			>
				<Redo className="w-5 h-5 text-orange-300" />
			</button>
			<button
				onClick={onClear}
				className="p-3 rounded-lg hover:bg-red-500/20 transition-all"
				title="Clear All"
			>
				<Trash2 className="w-5 h-5 text-red-400" />
			</button>

			<div className="h-px bg-white/[0.06] w-12 my-2"></div>

			<div className="flex flex-col items-center space-y-2">
				<input
					type="color"
					value={color}
					onChange={(e) => onColorChange(e.target.value)}
					className="w-10 h-10 rounded cursor-pointer"
					title="Color"
				/>
				<input
					type="range"
					min="1"
					max="20"
					value={lineWidth}
					onChange={(e) => onLineWidthChange(parseInt(e.target.value))}
					className="w-12 rotate-90 origin-center"
					title="Line Width"
				/>
			</div>
		</div>
	);
}
