import { Download, Pen, Save, X } from "lucide-react";
import { useState } from "react";
import type { Json } from "@/types/database";
import { useAuth } from "../../contexts/AuthContext";
import { logger } from "../../lib/errorLogger";
import { supabase } from "../../lib/supabase";
import { WhiteboardCanvas } from "./WhiteboardCanvas";
import { WhiteboardSaveDialog } from "./WhiteboardSaveDialog";
import { WhiteboardToolbar } from "./WhiteboardToolbar";
import { DrawAction } from "./whiteboardtypes";

interface WhiteboardProps {
	isOpen: boolean;
	onClose: () => void;
	panelContext: string;
	onSaved?: () => void;
}

export function Whiteboard({
	isOpen,
	onClose,
	panelContext,
	onSaved,
}: WhiteboardProps) {
	const [actions, setActions] = useState<DrawAction[]>([]);
	const [redoStack, setRedoStack] = useState<DrawAction[]>([]);
	const [tool, setTool] = useState<
		"pen" | "eraser" | "rectangle" | "circle" | "text"
	>("pen");
	const [color, setColor] = useState("#00ffff");
	const [lineWidth, setLineWidth] = useState(2);
	const [showSaveDialog, setShowSaveDialog] = useState(false);
	const [, setWhiteboardId] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const auth = useAuth();

	const handleActionAdd = (action: DrawAction) => {
		setActions([...actions, action]);
		setRedoStack([]);
	};

	const undo = () => {
		if (actions.length > 0) {
			const last = actions[actions.length - 1];
			setRedoStack([...redoStack, last]);
			setActions(actions.slice(0, -1));
		}
	};

	const redo = () => {
		if (redoStack.length > 0) {
			const last = redoStack[redoStack.length - 1];
			setActions([...actions, last]);
			setRedoStack(redoStack.slice(0, -1));
		}
	};

	const clearCanvas = () => {
		if (confirm("Clear entire whiteboard?")) {
			setActions([]);
			setRedoStack([]);
		}
	};

	const handleTextRequest = (position: { x: number; y: number }) => {
		const text = prompt("Enter text:");
		if (text) {
			handleActionAdd({
				tool: "text",
				text,
				position,
				color,
			});
		}
	};

	const saveWhiteboard = async (title: string, tags: string) => {
		const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
		if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
			logger.warn("Whiteboard", "Canvas element not found");
			alert("Canvas not found. Please try again.");
			return;
		}

		setIsSaving(true);
		try {
			const thumbnail = canvas.toDataURL("image/png");
			const tagArray = tags
				.split(",")
				.map((t) => t.trim())
				.filter((t) => t);

			const { data, error } = await supabase
				.from("whiteboards")
				.insert({
					title,
					panel_context: panelContext,
					canvas_data: { actions } as unknown as Json,
					thumbnail_url: thumbnail,
					tags: tagArray,
					user_id: auth.user?.id || "",
				})
				.select()
				.single();

			if (error) {
				logger.error("Whiteboard", "Failed to save whiteboard", {
					error: error.message,
				});
				alert(
					"Failed to save whiteboard: " + (error.message || "Unknown error"),
				);
			} else if (data?.id) {
				setWhiteboardId(data.id);
				logger.info("Whiteboard", "Whiteboard saved successfully", {
					whiteboardId: data.id,
				});
				alert("Whiteboard saved successfully!");
				setShowSaveDialog(false);
				onSaved?.();
				onClose();
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			logger.error(
				"Whiteboard",
				"Unexpected error saving whiteboard",
				{ error: message },
				err as Error,
			);
			alert("Failed to save whiteboard: " + message);
		} finally {
			setIsSaving(false);
		}
	};

	const exportAsImage = () => {
		const canvas = document.querySelector("canvas");
		if (!canvas) return;
		const link = document.createElement("a");
		link.download = `whiteboard-${Date.now()}.png`;
		link.href = canvas.toDataURL();
		link.click();
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
			<div className="bg-[#0a0a0a] backdrop-blur-xl border border-white/[0.06] rounded-lg w-full h-full max-w-7xl max-h-[90vh] flex flex-col">
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
					<div className="flex items-center space-x-3">
						<Pen className="w-6 h-6 text-orange-400" />
						<h3 className="text-2xl font-bold text-white/80">
							Whiteboard - {panelContext}
						</h3>
					</div>
					<div className="flex items-center space-x-2">
						<button
							onClick={() => setShowSaveDialog(true)}
							className="flex items-center space-x-2 px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-white/90 transition-all"
						>
							<Save className="w-4 h-4" />
							<span>{isSaving ? "Saving..." : "Save"}</span>
						</button>
						<button
							onClick={exportAsImage}
							className="flex items-center space-x-2 px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-white/90 transition-all"
						>
							<Download className="w-4 h-4" />
							<span>Export</span>
						</button>
						<button
							onClick={onClose}
							className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
						>
							<X className="w-5 h-5 text-red-400" />
						</button>
					</div>
				</div>

				{/* Main area */}
				<div className="flex flex-1 overflow-hidden">
					<WhiteboardToolbar
						tool={tool}
						onToolChange={setTool}
						color={color}
						onColorChange={setColor}
						lineWidth={lineWidth}
						onLineWidthChange={setLineWidth}
						onUndo={undo}
						onRedo={redo}
						onClear={clearCanvas}
						canUndo={actions.length > 0}
						canRedo={redoStack.length > 0}
					/>

					<div className="flex-1 flex items-center justify-center p-4 overflow-auto">
						<WhiteboardCanvas
							actions={actions}
							onActionAdd={handleActionAdd}
							tool={tool}
							color={color}
							lineWidth={lineWidth}
							onTextRequest={handleTextRequest}
						/>
					</div>
				</div>

				{/* Save dialog */}
				<WhiteboardSaveDialog
					isOpen={showSaveDialog}
					onClose={() => setShowSaveDialog(false)}
					onSave={saveWhiteboard}
					panelContext={panelContext}
				/>
			</div>
		</div>
	);
}
