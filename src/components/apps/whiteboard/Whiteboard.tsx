import { Download, Pen, Save, X } from "lucide-react";
import { useState } from "react";
import { useNotification } from "@/auth/NotificationContext";
import { useAuth } from "@/auth/useAuth";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import { logger } from "@/lib/errorLogger";
import { supabase } from "@/supabase/client";
import type { Json } from "@/supabase/database";
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
	const [showClearDialog, setShowClearDialog] = useState(false);
	const [showTextDialog, setShowTextDialog] = useState(false);
	const [textValue, setTextValue] = useState("");
	const [textPosition, setTextPosition] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const [, setWhiteboardId] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const auth = useAuth();
	const notifications = useNotification();

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
		setShowClearDialog(true);
	};

	const confirmClearCanvas = () => {
		setActions([]);
		setRedoStack([]);
		setShowClearDialog(false);
	};

	const handleTextRequest = (position: { x: number; y: number }) => {
		setTextPosition(position);
		setTextValue("");
		setShowTextDialog(true);
	};

	const confirmAddText = () => {
		const trimmed = textValue.trim();
		if (!trimmed || !textPosition) {
			setShowTextDialog(false);
			setTextPosition(null);
			setTextValue("");
			return;
		}

		handleActionAdd({
			tool: "text",
			text: trimmed,
			position: textPosition,
			color,
		});
		setShowTextDialog(false);
		setTextPosition(null);
		setTextValue("");
	};

	const saveWhiteboard = async (title: string, tags: string) => {
		const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
		if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
			logger.warn("Whiteboard", "Canvas element not found");
			notifications.error("Canvas not found", "Please try again.");
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
				notifications.error(
					"Failed to save whiteboard",
					error.message || "Unknown error",
				);
			} else if (data?.id) {
				setWhiteboardId(data.id);
				logger.info("Whiteboard", "Whiteboard saved successfully", {
					whiteboardId: data.id,
				});
				notifications.success(
					"Whiteboard saved",
					"Your whiteboard was saved successfully.",
				);
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
			notifications.error("Failed to save whiteboard", message);
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
		<>
			<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
				<DialogContent className="max-h-[90vh] max-w-7xl border-[var(--border)] bg-[var(--surface)] p-0">
					<div className="flex h-full w-full flex-col overflow-hidden rounded-lg backdrop-blur-xl">
						<div className="flex items-center justify-between border-b border-[var(--border)] p-4">
							<div className="flex items-center space-x-3">
								<Pen className="h-6 w-6 text-[var(--accent)]" />
								<h3 className="text-2xl font-bold text-[var(--text)]">
									Whiteboard - {panelContext}
								</h3>
							</div>
							<div className="flex items-center space-x-2">
								<button
									onClick={() => setShowSaveDialog(true)}
									className="flex items-center space-x-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[var(--text)] transition-all hover:bg-[var(--surface)]"
								>
									<Save className="w-4 h-4" />
									<span>{isSaving ? "Saving..." : "Save"}</span>
								</button>
								<button
									onClick={exportAsImage}
									className="flex items-center space-x-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[var(--text)] transition-all hover:bg-[var(--surface)]"
								>
									<Download className="w-4 h-4" />
									<span>Export</span>
								</button>
								<button
									onClick={onClose}
									className="rounded-lg p-2 transition-all hover:[background:color-mix(in_srgb,var(--danger)_20%,transparent)]"
								>
									<X className="w-5 h-5 [color:var(--danger)]" />
								</button>
							</div>
						</div>

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

							<div className="flex flex-1 items-center justify-center overflow-auto p-4">
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

						<WhiteboardSaveDialog
							isOpen={showSaveDialog}
							onClose={() => setShowSaveDialog(false)}
							onSave={saveWhiteboard}
							panelContext={panelContext}
						/>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog
				open={showClearDialog}
				onOpenChange={(open) => !open && setShowClearDialog(false)}
			>
				<DialogContent className="max-w-sm border-[var(--border)] bg-[var(--surface)]">
					<DialogHeader>
						<DialogTitle>Clear whiteboard?</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-[var(--text-muted)]">
						This will remove all strokes and cannot be undone.
					</p>
					<DialogFooter className="mt-4 gap-2 sm:justify-end">
						<button
							onClick={() => setShowClearDialog(false)}
							className="rounded-lg border px-4 py-2 transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
						>
							Cancel
						</button>
						<button
							onClick={confirmClearCanvas}
							className="rounded-lg px-4 py-2 font-semibold [background:var(--danger)] [color:white]"
						>
							Clear
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={showTextDialog}
				onOpenChange={(open) => {
					if (!open) {
						setShowTextDialog(false);
						setTextPosition(null);
					}
				}}
			>
				<DialogContent className="max-w-md border-[var(--border)] bg-[var(--surface)]">
					<DialogHeader>
						<DialogTitle>Add Text</DialogTitle>
					</DialogHeader>
					<input
						type="text"
						value={textValue}
						onChange={(e) => setTextValue(e.target.value)}
						className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
						placeholder="Enter text"
						autoFocus
					/>
					<DialogFooter className="mt-4 gap-2 sm:justify-end">
						<button
							onClick={() => {
								setShowTextDialog(false);
								setTextPosition(null);
								setTextValue("");
							}}
							className="rounded-lg border px-4 py-2 transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
						>
							Cancel
						</button>
						<button
							onClick={confirmAddText}
							className="rounded-lg px-4 py-2 font-semibold [background:var(--primary)] [color:var(--primary-contrast)]"
						>
							Add Text
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
