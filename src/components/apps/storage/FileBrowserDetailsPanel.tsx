import { Download, Trash2, X } from "lucide-react";
import { formatSize, getFileIcon } from "./fileBrowserModels";
import type { StorageFile } from "./storageTypes";

interface FileBrowserDetailsPanelProps {
	selected: StorageFile;
	onClose: () => void;
	onDownload: (file: StorageFile) => void;
	onRequestDelete: (file: StorageFile) => void;
}

export function FileBrowserDetailsPanel({
	selected,
	onClose,
	onDownload,
	onRequestDelete,
}: FileBrowserDetailsPanelProps) {
	const details: [string, string][] = [
		["Name", selected.name],
		["Type", selected.type || "Unknown"],
		["Size", selected.size ? formatSize(selected.size) : "--"],
		[
			"Created",
			selected.created_at
				? new Date(selected.created_at).toLocaleString()
				: "--",
		],
		[
			"Updated",
			selected.updated_at
				? new Date(selected.updated_at).toLocaleString()
				: "--",
		],
	];

	return (
		<div className="w-full rounded-[10px] border p-4 lg:w-65 lg:shrink-0 border-[color-mix(in_srgb,var(--primary)_12%,transparent)] [background:color-mix(in_srgb,var(--surface)_60%,transparent)]">
			<div className="mb-4 flex items-center justify-between">
				<span className="text-sm font-semibold [color:var(--text)]">
					Details
				</span>
				<button
					onClick={onClose}
					className="border-none bg-transparent [color:var(--text-muted)]"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			<div className="mb-4 flex justify-center [color:var(--primary)]">
				{getFileIcon(selected.type)}
			</div>

			{details.map(([label, value]) => (
				<div key={label} className="mb-2.5">
					<div className="mb-0.5 text-[11px] [color:var(--text-muted)]">
						{label}
					</div>
					<div className="break-all text-[13px] [color:var(--text)]">
						{value}
					</div>
				</div>
			))}

			<div className="mt-4 flex gap-2">
				<button
					onClick={() => onDownload(selected)}
					className="flex flex-1 items-center justify-center gap-1 rounded-md border py-2 text-[13px] border-[color-mix(in_srgb,var(--primary)_30%,transparent)] [background:color-mix(in_srgb,var(--primary)_15%,transparent)] [color:var(--text)]"
				>
					<Download className="h-3.5 w-3.5" /> Download
				</button>
				<button
					onClick={() => onRequestDelete(selected)}
					className="rounded-md border px-3 py-2 border-[color-mix(in_srgb,var(--danger)_30%,transparent)] [background:color-mix(in_srgb,var(--danger)_15%,transparent)] [color:var(--danger)]"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	);
}
