import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
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

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-md border-[var(--border)] bg-[var(--surface)] p-6">
				<DialogHeader className="mb-4">
					<DialogTitle className="text-xl font-bold text-[var(--text)]">
						Save Whiteboard
					</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div>
						<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
							Title *
						</label>
						<input
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
							placeholder="Enter whiteboard title"
							autoFocus
						/>
					</div>
					<div>
						<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
							Tags (comma separated)
						</label>
						<input
							type="text"
							value={tags}
							onChange={(e) => setTags(e.target.value)}
							className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
							placeholder="e.g., calculations, circuit, notes"
						/>
					</div>
					{error ? (
						<div className="rounded-lg border border-[var(--danger)] bg-[color:color-mix(in_srgb,var(--danger)_18%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
							{error}
						</div>
					) : null}
					<p className="text-sm text-[var(--text-muted)]">
						Panel Context:{" "}
						<span className="font-semibold text-[var(--text)]">
							{panelContext}
						</span>
					</p>
				</div>
				<div className="mt-6 flex gap-3">
					<button
						onClick={handleSubmit}
						className="flex-1 [background:linear-gradient(to_right,var(--primary),color-mix(in_srgb,var(--primary)_70%,var(--warning)))] hover:opacity-90 [color:var(--text)] font-semibold px-6 py-2 rounded-lg transition-all"
					>
						Save Whiteboard
					</button>
					<button
						onClick={onClose}
						className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-6 py-2 text-[var(--text-muted)] transition-all hover:bg-[var(--surface)]"
					>
						Cancel
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
