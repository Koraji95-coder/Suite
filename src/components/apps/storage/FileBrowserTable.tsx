import { ArrowDown, ArrowUp, ArrowUpDown, Trash2 } from "lucide-react";
import type { DragEvent } from "react";
import { cn } from "@/lib/utils";
import { formatSize, getFileIcon, type SortKey } from "./fileBrowserModels";
import type { StorageFile } from "./storageTypes";

interface FileBrowserTableProps {
	dragging: boolean;
	onDragStateChange: (dragging: boolean) => void;
	onDrop: (event: DragEvent) => void;
	sortKey: SortKey;
	sortAsc: boolean;
	onSort: (key: SortKey) => void;
	error: string | null;
	loading: boolean;
	filesLength: number;
	filteredFiles: StorageFile[];
	search: string;
	selectedName: string | null;
	onFileClick: (file: StorageFile) => void;
	onRequestDelete: (file: StorageFile) => void;
}

const gridCols = "grid-cols-[minmax(220px,1fr)_80px_120px_40px]";

export function FileBrowserTable({
	dragging,
	onDragStateChange,
	onDrop,
	sortKey,
	sortAsc,
	onSort,
	error,
	loading,
	filesLength,
	filteredFiles,
	search,
	selectedName,
	onFileClick,
	onRequestDelete,
}: FileBrowserTableProps) {
	const sortIcon = (column: SortKey) => {
		if (sortKey !== column)
			return <ArrowUpDown className="h-3 w-3 opacity-40" />;
		return sortAsc ? (
			<ArrowUp className="h-3 w-3" />
		) : (
			<ArrowDown className="h-3 w-3" />
		);
	};

	return (
		<div
			onDragOver={(event) => {
				event.preventDefault();
				onDragStateChange(true);
			}}
			onDragLeave={() => onDragStateChange(false)}
			onDrop={onDrop}
			className={cn(
				"overflow-x-auto rounded-[10px] border-2 border-dashed transition-colors",
				dragging
					? "[border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_5%,transparent)]"
					: "border-[color-mix(in_srgb,var(--primary)_15%,transparent)] bg-transparent",
			)}
		>
			<div className="min-w-130">
				{/* Header */}
				<div
					className={`grid ${gridCols} border-b px-4 py-2 text-xs font-semibold border-[color-mix(in_srgb,var(--primary)_10%,transparent)] [color:var(--text-muted)]`}
				>
					<button
						onClick={() => onSort("name")}
						className="flex items-center gap-1 border-none bg-transparent p-0 text-xs font-semibold [color:var(--text-muted)]"
					>
						Name {sortIcon("name")}
					</button>
					<button
						onClick={() => onSort("size")}
						className="flex items-center gap-1 border-none bg-transparent p-0 text-xs font-semibold [color:var(--text-muted)]"
					>
						Size {sortIcon("size")}
					</button>
					<button
						onClick={() => onSort("created_at")}
						className="flex items-center gap-1 border-none bg-transparent p-0 text-xs font-semibold [color:var(--text-muted)]"
					>
						Date {sortIcon("created_at")}
					</button>
					<span />
				</div>

				{error && (
					<div className="p-3 text-[13px] [color:var(--danger)]">{error}</div>
				)}

				{loading && !filesLength && (
					<div className="py-8 text-center [color:var(--text-muted)]">
						Loading...
					</div>
				)}

				{!loading && filteredFiles.length === 0 && (
					<div className="py-8 text-center text-sm [color:var(--text-muted)]">
						{search
							? "No files match your search"
							: "Drop files here or click Upload"}
					</div>
				)}

				{filteredFiles.map((file) => (
					<div
						key={file.id || file.name}
						onClick={() => onFileClick(file)}
						className={cn(
							`grid ${gridCols} cursor-pointer items-center border-b px-4 py-2.5 transition-colors`,
							"border-[color-mix(in_srgb,var(--primary)_5%,transparent)]",
							"hover:[background:color-mix(in_srgb,var(--primary)_6%,transparent)]",
							selectedName === file.name &&
								"[background:color-mix(in_srgb,var(--primary)_8%,transparent)]",
						)}
					>
						<div className="flex items-center gap-2.5 overflow-hidden [color:var(--text)]">
							<span className="shrink-0 [color:var(--primary)]">
								{getFileIcon(file.type)}
							</span>
							<span className="truncate text-sm">{file.name}</span>
						</div>
						<span className="text-[13px] [color:var(--text-muted)]">
							{file.size ? formatSize(file.size) : "--"}
						</span>
						<span className="text-[13px] [color:var(--text-muted)]">
							{file.created_at
								? new Date(file.created_at).toLocaleDateString()
								: "--"}
						</span>
						<button
							onClick={(event) => {
								event.stopPropagation();
								onRequestDelete(file);
							}}
							className="border-none bg-transparent p-1 [color:var(--text-muted)]"
						>
							<Trash2 className="h-4 w-4" />
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
