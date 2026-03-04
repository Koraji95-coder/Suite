import { Box, Layers, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceFilter, ViewMode } from "./types";

interface GraphToolbarProps {
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
	sourceFilter: SourceFilter;
	onSourceFilterChange: (filter: SourceFilter) => void;
	searchQuery: string;
	onSearchChange: (query: string) => void;
	onAddMemory: () => void;
}

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
	{ value: "architecture", label: "Architecture" },
	{ value: "memory", label: "Memory" },
	{ value: "both", label: "Both" },
];

const btnBase =
	"rounded-md border px-3.5 py-1.5 text-[13px] font-medium transition-all cursor-pointer [border-color:color-mix(in_srgb,var(--primary)_25%,transparent)] [background:color-mix(in_srgb,var(--surface)_60%,transparent)] [color:var(--text-muted)]";

const btnActive =
	"rounded-md border px-3.5 py-1.5 text-[13px] font-medium transition-all cursor-pointer [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_20%,transparent)] [color:var(--primary)]";

export function GraphToolbar({
	viewMode,
	onViewModeChange,
	sourceFilter,
	onSourceFilterChange,
	searchQuery,
	onSearchChange,
	onAddMemory,
}: GraphToolbarProps) {
	return (
		<div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 [background:color-mix(in_srgb,var(--surface)_85%,transparent)] border-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
			<div className="flex flex-wrap gap-1">
				{SOURCE_OPTIONS.map((opt) => (
					<button
						key={opt.value}
						onClick={() => onSourceFilterChange(opt.value)}
						className={sourceFilter === opt.value ? btnActive : btnBase}
					>
						{opt.label}
					</button>
				))}
			</div>

			<div className="hidden h-6 w-px md:block [background:color-mix(in_srgb,var(--text-muted)_20%,transparent)]" />

			<div className="flex flex-wrap gap-1">
				<button
					onClick={() => onViewModeChange("3d")}
					className={cn(
						viewMode === "3d" ? btnActive : btnBase,
						"inline-flex items-center",
					)}
				>
					<Box size={14} className="mr-1" />
					3D
				</button>
				<button
					onClick={() => onViewModeChange("2d")}
					className={cn(
						viewMode === "2d" ? btnActive : btnBase,
						"inline-flex items-center",
					)}
				>
					<Layers size={14} className="mr-1" />
					2D
				</button>
			</div>

			<div className="order-last flex min-w-55 flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5 md:order-0 border-[color-mix(in_srgb,var(--primary)_20%,transparent)] [background:color-mix(in_srgb,var(--background)_80%,transparent)]">
				<Search size={14} className="shrink-0 [color:var(--text-muted)]" />
				<input
					type="text"
					placeholder="Search nodes..."
					value={searchQuery}
					onChange={(e) => onSearchChange(e.target.value)}
					className="min-w-0 flex-1 border-none bg-transparent p-0 text-[13px] outline-none [color:var(--text)]"
				/>
			</div>

			<button
				onClick={onAddMemory}
				className={cn(btnBase, "inline-flex items-center")}
				title="Add Memory"
			>
				<Plus size={14} className="mr-1" />
				Memory
			</button>
		</div>
	);
}
