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
import styles from "./Whiteboard.module.css";
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
				<DialogContent className={styles.dialogContent} showCloseButton={false}>
					<div className={styles.root}>
						{/* Header */}
						<div className={styles.header}>
							<div className={styles.headerTitle}>
								<Pen className={styles.headerIcon} />
								<h3 className={styles.headerHeading}>
									Whiteboard — {panelContext}
								</h3>
							</div>
							<div className={styles.headerActions}>
								<button
									onClick={() => setShowSaveDialog(true)}
									className={styles.actionButton}
								>
									<Save className={styles.actionIcon} />
									{isSaving ? "Saving…" : "Save"}
								</button>
								<button onClick={exportAsImage} className={styles.actionButton}>
									<Download className={styles.actionIcon} />
									Export
								</button>
								<button onClick={onClose} className={styles.closeButton}>
									<X className={styles.closeIcon} />
								</button>
							</div>
						</div>

						{/* Canvas area */}
						<div className={styles.canvasArea}>
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

							<div className={styles.canvasViewport}>
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

			{/* Clear confirmation */}
			<Dialog
				open={showClearDialog}
				onOpenChange={(open) => !open && setShowClearDialog(false)}
			>
				<DialogContent className={styles.confirmDialogContent}>
					<DialogHeader>
						<DialogTitle>Clear whiteboard?</DialogTitle>
					</DialogHeader>
					<p className={styles.dialogText}>
						This will remove all strokes and cannot be undone.
					</p>
					<DialogFooter className={styles.dialogFooter}>
						<button
							onClick={() => setShowClearDialog(false)}
							className={styles.cancelButton}
						>
							Cancel
						</button>
						<button
							onClick={confirmClearCanvas}
							className={styles.dangerButton}
						>
							Clear
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Text input */}
			<Dialog
				open={showTextDialog}
				onOpenChange={(open) => {
					if (!open) {
						setShowTextDialog(false);
						setTextPosition(null);
					}
				}}
			>
					<DialogContent className={styles.textDialogContent}>
						<DialogHeader>
							<DialogTitle>Add Text</DialogTitle>
						</DialogHeader>
						<input
							id="whiteboard-text-input"
							name="whiteboard_text"
							aria-label="Whiteboard text"
							type="text"
							value={textValue}
							onChange={(e) => setTextValue(e.target.value)}
						className={styles.textInput}
						placeholder="Enter text"
						autoFocus
					/>
					<DialogFooter className={styles.dialogFooter}>
						<button
							onClick={() => {
								setShowTextDialog(false);
								setTextPosition(null);
								setTextValue("");
							}}
							className={styles.cancelButton}
						>
							Cancel
						</button>
						<button onClick={confirmAddText} className={styles.primaryButton}>
							Add Text
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
