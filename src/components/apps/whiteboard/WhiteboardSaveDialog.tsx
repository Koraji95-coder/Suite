import { useState } from "react";

interface WhiteboardSaveDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (title: string, tags: string) => void;
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

	if (!isOpen) return null;

	const handleSubmit = () => {
		if (!title.trim()) {
			alert("Please enter a title");
			return;
		}
		onSave(title.trim(), tags);
	};

	return (
		<div className="absolute inset-0 flex items-center justify-center bg-[color:rgb(10_10_10_/_0.62)] backdrop-blur-sm">
			<div className="m-4 w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 backdrop-blur-xl">
				<h4 className="mb-4 text-xl font-bold text-[var(--color-text)]">
					Save Whiteboard
				</h4>
				<div className="space-y-4">
					<div>
						<label className="mb-2 block text-sm font-medium text-[var(--color-text-muted)]">
							Title *
						</label>
						<input
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
							placeholder="Enter whiteboard title"
							autoFocus
						/>
					</div>
					<div>
						<label className="mb-2 block text-sm font-medium text-[var(--color-text-muted)]">
							Tags (comma separated)
						</label>
						<input
							type="text"
							value={tags}
							onChange={(e) => setTags(e.target.value)}
							className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
							placeholder="e.g., calculations, circuit, notes"
						/>
					</div>
					<p className="text-sm text-[var(--color-text-muted)]">
						Panel Context:{" "}
						<span className="font-semibold text-[var(--color-text)]">
							{panelContext}
						</span>
					</p>
				</div>
				<div className="mt-6 flex gap-3">
					<button
						onClick={handleSubmit}
						className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-2 rounded-lg transition-all"
					>
						Save Whiteboard
					</button>
					<button
						onClick={onClose}
						className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-6 py-2 text-[var(--color-text-muted)] transition-all hover:bg-[var(--color-surface)]"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}
