import { RefreshCw, Search, Upload } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";

interface FileBrowserToolbarProps {
	search: string;
	onSearchChange: (value: string) => void;
	fileInputRef: RefObject<HTMLInputElement | null>;
	onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onRefresh: () => void;
	loading: boolean;
}

export function FileBrowserToolbar({
	search,
	onSearchChange,
	fileInputRef,
	onFileInputChange,
	onRefresh,
	loading,
}: FileBrowserToolbarProps) {
	return (
		<div className="mb-3 flex flex-wrap items-center gap-2">
			<div className="relative min-w-55 flex-1 basis-full sm:basis-auto">
				<Search className="absolute left-2.5 top-2.5 h-4 w-4 [color:var(--primary)]" />
				<input
					value={search}
					onChange={(event) => onSearchChange(event.target.value)}
					placeholder="Search files..."
					className="w-full rounded-lg border py-2 pr-3 pl-8.5 text-sm outline-none border-[color-mix(in_srgb,var(--primary)_25%,transparent)] [background:color-mix(in_srgb,var(--background)_60%,transparent)] [color:var(--text)]"
				/>
			</div>
			<button
				onClick={() => fileInputRef.current?.click()}
				className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm border-[color-mix(in_srgb,var(--primary)_30%,transparent)] [background:color-mix(in_srgb,var(--primary)_15%,transparent)] [color:var(--text)]"
			>
				<Upload className="h-4 w-4" /> Upload
			</button>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				className="hidden"
				onChange={onFileInputChange}
			/>
			<button
				onClick={onRefresh}
				disabled={loading}
				className="rounded-lg border p-2 border-[color-mix(in_srgb,var(--primary)_20%,transparent)] [background:color-mix(in_srgb,var(--primary)_10%,transparent)] [color:var(--text)]"
			>
				<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
			</button>
		</div>
	);
}
