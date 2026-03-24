import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import styles from "./WhiteboardSaveDialog.module.css";

interface WhiteboardSaveDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (title: string, tags: string) => void | Promise<void>;
	panelContext: string;
}

export function WhiteboardSaveDialog({
	isOpen,
	onClose,
	onSave,
	panelContext,
}: WhiteboardSaveDialogProps) {
	const titleInputId = "whiteboard-save-title";
	const tagsInputId = "whiteboard-save-tags";
	const [title, setTitle] = useState("");
	const [tags, setTags] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		if (!isOpen) return;
		setError("");
	}, [isOpen]);

	const handleSubmit = () => {
		if (!title.trim()) {
			setError("Please enter a title.");
			return;
		}
		setError("");
		void onSave(title.trim(), tags);
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className={styles.dialogContent}>
				<DialogHeader>
					<DialogTitle>Save Whiteboard</DialogTitle>
					<DialogDescription className="sr-only">
						Save this whiteboard with a title and optional tags for the{" "}
						{panelContext} panel.
					</DialogDescription>
				</DialogHeader>

				<div className={styles.body}>
					<div>
						<label className={styles.label} htmlFor={titleInputId}>
							Title *
						</label>
						<input
							id={titleInputId}
							name="whiteboard_title"
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							className={styles.input}
							placeholder="Enter whiteboard title"
							autoFocus
						/>
					</div>

					<div>
						<label className={styles.label} htmlFor={tagsInputId}>
							Tags (comma separated)
						</label>
						<input
							id={tagsInputId}
							name="whiteboard_tags"
							type="text"
							value={tags}
							onChange={(e) => setTags(e.target.value)}
							className={styles.input}
							placeholder="e.g., calculations, circuit, notes"
						/>
					</div>

					{error && <div className={styles.error}>{error}</div>}

					<p className={styles.meta}>
						Panel: <span className={styles.metaValue}>{panelContext}</span>
					</p>
				</div>

				<DialogFooter className={styles.footer}>
					<button
						type="button"
						onClick={onClose}
						className={styles.cancelButton}
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSubmit}
						className={styles.primaryButton}
					>
						Save Whiteboard
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
