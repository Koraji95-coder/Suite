import { Filter, Search, Tag } from "lucide-react";

interface LibraryFiltersProps {
	searchTerm: string;
	onSearchChange: (value: string) => void;
	selectedPanel: string;
	onPanelChange: (panel: string) => void;
	panels: string[];
	selectedTag: string;
	onTagChange: (tag: string) => void;
	tags: string[];
	totalCount: number;
	filteredCount: number;
	hidePanelFilter?: boolean;
}

const inputClass =
	"w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text)]";

export function LibraryFilters({
	searchTerm,
	onSearchChange,
	selectedPanel,
	onPanelChange,
	panels,
	selectedTag,
	onTagChange,
	tags,
	totalCount,
	filteredCount,
	hidePanelFilter = false,
}: LibraryFiltersProps) {
	return (
		<div className="rounded-xl border p-5 [border-color:var(--border)] [background:var(--surface)]">
			<div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 [color:var(--text-muted)]" />
					<input
						type="text"
						value={searchTerm}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Search whiteboards…"
						className={`${inputClass} pl-9`}
					/>
				</div>

				{!hidePanelFilter && (
					<select
						value={selectedPanel}
						onChange={(e) => onPanelChange(e.target.value)}
						className={inputClass}
					>
						{panels.map((panel) => (
							<option key={panel} value={panel}>
								{panel === "all" ? "All Panels" : panel}
							</option>
						))}
					</select>
				)}

				<select
					value={selectedTag}
					onChange={(e) => onTagChange(e.target.value)}
					className={inputClass}
				>
					{tags.map((tag) => (
						<option key={tag} value={tag}>
							{tag === "all" ? "All Tags" : tag}
						</option>
					))}
				</select>
			</div>

			<div className="flex items-center gap-4 text-xs [color:var(--text-muted)]">
				<span>
					{totalCount} total · {filteredCount} shown
				</span>
				{!hidePanelFilter && selectedPanel !== "all" && (
					<span className="flex items-center gap-1">
						<Filter className="h-3 w-3" /> {selectedPanel}
					</span>
				)}
				{selectedTag !== "all" && (
					<span className="flex items-center gap-1">
						<Tag className="h-3 w-3" /> {selectedTag}
					</span>
				)}
			</div>
		</div>
	);
}
