import { AlertTriangle } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";

interface BackupManagerRestoreDialogProps {
	confirmRestore: string | null;
	onCancel: () => void;
	onConfirm: (filename: string) => void;
}

export function BackupManagerRestoreDialog({
	confirmRestore,
	onCancel,
	onConfirm,
}: BackupManagerRestoreDialogProps) {
	return (
		<Dialog
			open={Boolean(confirmRestore)}
			onOpenChange={(open) => !open && onCancel()}
		>
			<DialogContent className="max-w-md border-[var(--border)] bg-[var(--surface)]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AlertTriangle className="h-5 w-5 [color:var(--warning)]" />
						Confirm Restore
					</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-[var(--text-muted)]">
					This will upsert data from{" "}
					<strong className="text-[var(--text)]">
						{confirmRestore ?? "this backup"}
					</strong>{" "}
					into your database. Existing rows with matching IDs will be
					overwritten.
				</p>
				<DialogFooter className="mt-4 gap-2 sm:justify-end">
					<button
						onClick={onCancel}
						className="rounded-lg border px-4 py-2 transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					>
						Cancel
					</button>
					<button
						onClick={() => {
							if (confirmRestore) onConfirm(confirmRestore);
						}}
						className="rounded-lg px-4 py-2 font-semibold [background:var(--primary)] [color:var(--primary-contrast)]"
					>
						Restore
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
