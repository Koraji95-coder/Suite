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
import styles from "./WhiteboardToolbar.module.css";

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
		<div className={styles.root}>
			{/* Drawing tools */}
			{tools.map(({ id, icon: Icon, label }) => (
				<button
					key={id}
					onClick={() => onToolChange(id)}
					title={label}
					className={cn(
						styles.toolButton,
						tool === id ? styles.toolButtonActive : styles.toolButtonInactive,
					)}
				>
					<Icon className={styles.toolIcon} />
				</button>
			))}

			<div className={styles.divider} />

			{/* Undo / Redo / Clear */}
			<button
				onClick={onUndo}
				disabled={!canUndo}
				title="Undo"
				className={styles.actionButton}
			>
				<Undo className={styles.actionIcon} />
			</button>
			<button
				onClick={onRedo}
				disabled={!canRedo}
				title="Redo"
				className={styles.actionButton}
			>
				<Redo className={styles.actionIcon} />
			</button>
			<button
				onClick={onClear}
				title="Clear All"
				className={cn(styles.actionButton, styles.clearButton)}
			>
				<Trash2 className={styles.clearIcon} />
			</button>

			<div className={styles.divider} />

			{/* Color + line width */}
			<div className={styles.controls}>
				<input
					id="whiteboard-tool-color"
					name="whiteboard_tool_color"
					type="color"
					value={color}
					onChange={(e) => onColorChange(e.target.value)}
					className={styles.colorInput}
					title="Color"
				/>
				<input
					id="whiteboard-line-width"
					name="whiteboard_line_width"
					type="range"
					min="1"
					max="20"
					value={lineWidth}
					onChange={(e) => onLineWidthChange(parseInt(e.target.value))}
					className={styles.lineWidthInput}
					title="Line Width"
				/>
			</div>
		</div>
	);
}
