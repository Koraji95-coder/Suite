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
	const activeToolClass =
		"border border-[var(--color-accent)] bg-[var(--color-surface)]";
	const idleToolClass = "hover:bg-[var(--color-surface-elevated)]";

	return (
		<div className="flex w-20 flex-col items-center space-y-2 border-r border-[var(--color-border)] bg-[var(--color-surface)] py-4">
			<button
				onClick={() => onToolChange("pen")}
				className={`p-3 rounded-lg transition-all ${
					tool === "pen" ? activeToolClass : idleToolClass
				}`}
				title="Pen"
			>
				<Pen className="h-5 w-5 text-[var(--color-accent)]" />
			</button>
			<button
				onClick={() => onToolChange("eraser")}
				className={`p-3 rounded-lg transition-all ${
					tool === "eraser" ? activeToolClass : idleToolClass
				}`}
				title="Eraser"
			>
				<Eraser className="h-5 w-5 text-[var(--color-accent)]" />
			</button>
			<button
				onClick={() => onToolChange("rectangle")}
				className={`p-3 rounded-lg transition-all ${
					tool === "rectangle" ? activeToolClass : idleToolClass
				}`}
				title="Rectangle"
			>
				<Square className="h-5 w-5 text-[var(--color-accent)]" />
			</button>
			<button
				onClick={() => onToolChange("circle")}
				className={`p-3 rounded-lg transition-all ${
					tool === "circle" ? activeToolClass : idleToolClass
				}`}
				title="Circle"
			>
				<Circle className="h-5 w-5 text-[var(--color-accent)]" />
			</button>
			<button
				onClick={() => onToolChange("text")}
				className={`p-3 rounded-lg transition-all ${
					tool === "text" ? activeToolClass : idleToolClass
				}`}
				title="Text"
			>
				<Type className="h-5 w-5 text-[var(--color-accent)]" />
			</button>

			<div className="my-2 h-px w-12 bg-[var(--color-border)]"></div>

			<button
				onClick={onUndo}
				className="rounded-lg p-3 transition-all hover:bg-[var(--color-surface-elevated)] disabled:opacity-30"
				title="Undo"
				disabled={!canUndo}
			>
				<Undo className="h-5 w-5 text-[var(--color-accent)]" />
			</button>
			<button
				onClick={onRedo}
				className="rounded-lg p-3 transition-all hover:bg-[var(--color-surface-elevated)] disabled:opacity-30"
				title="Redo"
				disabled={!canRedo}
			>
				<Redo className="h-5 w-5 text-[var(--color-accent)]" />
			</button>
			<button
				onClick={onClear}
				className="p-3 rounded-lg hover:bg-red-500/20 transition-all"
				title="Clear All"
			>
				<Trash2 className="w-5 h-5 text-red-400" />
			</button>

			<div className="my-2 h-px w-12 bg-[var(--color-border)]"></div>

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
