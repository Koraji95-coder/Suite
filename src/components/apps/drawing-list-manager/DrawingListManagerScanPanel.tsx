import { FolderOpen, Search, Shuffle } from "lucide-react";

interface DrawingListManagerScanPanelProps {
	scanQuery: string;
	setScanQuery: (value: string) => void;
	onFolderScan: (files: FileList | null) => void;
	onRenumber: () => void;
	skipped: string[];
}

export function DrawingListManagerScanPanel({
	scanQuery,
	setScanQuery,
	onFolderScan,
	onRenumber,
	skipped,
}: DrawingListManagerScanPanelProps) {
	return (
		<div className="grid gap-3 rounded-xl border p-4 [border-color:var(--border)] [background:var(--surface)]">
			{/* Header row */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2.5">
					<FolderOpen size={18} className="[color:var(--primary)]" />
					<div>
						<div className="text-sm font-semibold [color:var(--text)]">
							Scan a drawing folder
						</div>
						<div className="text-xs [color:var(--text-muted)]">
							Drag in a folder of DWG/PDF files or select a directory to
							validate.
						</div>
					</div>
				</div>
				<label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition border-[color-mix(in_srgb,var(--primary)_20%,transparent)] [background:color-mix(in_srgb,var(--primary)_10%,transparent)] [color:var(--primary)] hover:opacity-80">
					<FolderOpen size={14} />
					Select Folder
					<input
						type="file"
						multiple
						// @ts-expect-error - webkitdirectory is needed for folder pickers.
						webkitdirectory="true"
						onChange={(e) => onFolderScan(e.target.files)}
						className="hidden"
					/>
				</label>
			</div>

			{/* Search + renumber */}
			<div className="flex items-center gap-2">
				<Search size={16} className="shrink-0 [color:var(--text-muted)]" />
				<input
					value={scanQuery}
					onChange={(e) => setScanQuery(e.target.value)}
					placeholder="Search drawings, titles, or numbers"
					className="min-w-0 flex-1 rounded-lg border px-2.5 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text)]"
				/>
				<button
					type="button"
					onClick={onRenumber}
					className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition border-[color-mix(in_srgb,var(--primary)_20%,transparent)] [background:color-mix(in_srgb,var(--primary)_12%,transparent)] [color:var(--primary)] hover:opacity-80"
				>
					<Shuffle size={14} />
					Auto Renumber
				</button>
			</div>

			{/* Skipped sequences */}
			{skipped.length > 0 && (
				<div className="text-xs [color:var(--text-muted)]">
					Skipped sequences: {skipped.slice(0, 8).join(", ")}
					{skipped.length > 8 ? ` +${skipped.length - 8} more` : ""}
				</div>
			)}
		</div>
	);
}
