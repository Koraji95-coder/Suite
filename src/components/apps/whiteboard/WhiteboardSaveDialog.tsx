import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";

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

	const inputClass =
		"w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text)]";

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-md border-(--border) bg-(--surface)">
				<DialogHeader>
					<DialogTitle>Save Whiteboard</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					<div>
						<label className="mb-1.5 block text-xs font-medium [color:var(--text-muted)]">
							Title *
						</label>
						<input
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							className={inputClass}
							placeholder="Enter whiteboard title"
							autoFocus
						/>
					</div>

					<div>
						<label className="mb-1.5 block text-xs font-medium [color:var(--text-muted)]">
							Tags (comma separated)
						</label>
						<input
							type="text"
							value={tags}
							onChange={(e) => setTags(e.target.value)}
							className={inputClass}
							placeholder="e.g., calculations, circuit, notes"
						/>
					</div>

					{error && (
						<div className="rounded-lg border px-3 py-2 text-sm
							[border-color:var(--danger)] [background:color-mix(in_srgb,var(--danger)_10%,transparent)] [color:var(--danger)]">
							{error}
						</div>
					)}

					<p className="text-xs [color:var(--text-muted)]">
						Panel: <span className="font-medium [color:var(--text)]">{panelContext}</span>
					</p>
				</div>

				<DialogFooter className="mt-4 gap-2 sm:justify-end">
					<button
						onClick={onClose}
						className="rounded-lg border px-4 py-2 text-sm transition
							[border-color:var(--border)] [background:var(--surface)] [color:var(--text)]
							hover:[background:var(--surface-2)]"
					>
						Cancel
					</button>
					<button
						onClick={handleSubmit}
						className="rounded-lg px-4 py-2 text-sm font-medium transition
							[background:var(--primary)] [color:var(--primary-contrast)] hover:opacity-90"
					>
						Save Whiteboard
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
