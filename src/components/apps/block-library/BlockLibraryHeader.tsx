import { Grid, List, Package, Upload } from "lucide-react";
import type { BlockViewMode } from "./blockLibraryModels";

interface BlockLibraryHeaderProps {
	viewMode: BlockViewMode;
	onToggleViewMode: () => void;
	onOpenUpload: () => void;
}

export function BlockLibraryHeader({
	viewMode,
	onToggleViewMode,
	onOpenUpload,
}: BlockLibraryHeaderProps) {
	const primaryButtonClass =
		"inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition [background:var(--primary)] [color:var(--primary-contrast)] hover:opacity-90";

	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center space-x-3">
				<div className="rounded-lg p-3 [background:var(--surface-2)]">
					<Package className="h-8 w-8 [color:var(--primary)]" />
				</div>
				<div>
					<h2 className="text-3xl font-bold [color:var(--text)]">
						Block Library
					</h2>
					<p className="[color:var(--text-muted)]">
						Manage your CAD block collection
					</p>
				</div>
			</div>
			<div className="flex items-center space-x-3">
				<button
					onClick={onToggleViewMode}
					className="rounded-lg border p-2 transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)]"
					title={viewMode === "grid" ? "List View" : "Grid View"}
				>
					{viewMode === "grid" ? (
						<List className="h-5 w-5 [color:var(--primary)]" />
					) : (
						<Grid className="h-5 w-5 [color:var(--primary)]" />
					)}
				</button>
				<button onClick={onOpenUpload} className={primaryButtonClass}>
					<Upload className="w-5 h-5" />
					<span>Upload Block</span>
				</button>
			</div>
		</div>
	);
}
