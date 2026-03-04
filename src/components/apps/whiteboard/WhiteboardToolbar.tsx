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
import { cn } from "@/lib/utils";

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

const tools = [
	{ id: "pen" as const, icon: Pen, label: "Pen" },
	{ id: "eraser" as const, icon: Eraser, label: "Eraser" },
	{ id: "rectangle" as const, icon: Square, label: "Rectangle" },
	{ id: "circle" as const, icon: Circle, label: "Circle" },
	{ id: "text" as const, icon: Type, label: "Text" },
];

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
		<div className="flex w-16 flex-col items-center gap-1.5 border-r py-3 [border-color:var(--border)] [background:var(--surface)]">
			{/* Drawing tools */}
			{tools.map(({ id, icon: Icon, label }) => (
				<button
					key={id}
					onClick={() => onToolChange(id)}
					title={label}
					className={cn(
						"rounded-lg p-2.5 transition",
						tool === id
							? "border [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,transparent)]"
							: "hover:[background:var(--surface-2)]",
					)}
				>
					<Icon className="h-4 w-4 [color:var(--primary)]" />
				</button>
			))}

			<div className="mx-2 my-1 h-px w-8 [background:var(--border)]" />

			{/* Undo / Redo / Clear */}
			<button
				onClick={onUndo}
				disabled={!canUndo}
				title="Undo"
				className="rounded-lg p-2.5 transition hover:[background:var(--surface-2)] disabled:opacity-30"
			>
				<Undo className="h-4 w-4 [color:var(--text-muted)]" />
			</button>
			<button
				onClick={onRedo}
				disabled={!canRedo}
				title="Redo"
				className="rounded-lg p-2.5 transition hover:[background:var(--surface-2)] disabled:opacity-30"
			>
				<Redo className="h-4 w-4 [color:var(--text-muted)]" />
			</button>
			<button
				onClick={onClear}
				title="Clear All"
				className="rounded-lg p-2.5 transition
					hover:[background:color-mix(in_srgb,var(--danger)_14%,transparent)]"
			>
				<Trash2 className="h-4 w-4 [color:var(--danger)]" />
			</button>

			<div className="mx-2 my-1 h-px w-8 [background:var(--border)]" />

			{/* Color + line width */}
			<div className="flex flex-col items-center gap-3">
				<input
					type="color"
					value={color}
					onChange={(e) => onColorChange(e.target.value)}
					className="h-8 w-8 cursor-pointer rounded border-none"
					title="Color"
				/>
				<input
					type="range"
					min="1"
					max="20"
					value={lineWidth}
					onChange={(e) => onLineWidthChange(parseInt(e.target.value))}
					className="w-10 origin-center rotate-90"
					title="Line Width"
				/>
			</div>
		</div>
	);
}
