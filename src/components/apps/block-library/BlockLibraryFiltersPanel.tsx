import { Search } from "lucide-react";

interface BlockLibraryFiltersPanelProps {
	searchTerm: string;
	onSearchTermChange: (value: string) => void;
	selectedCategory: string;
	onSelectedCategoryChange: (value: string) => void;
	selectedTag: string;
	onSelectedTagChange: (value: string) => void;
	categories: string[];
	allTags: string[];
	totalBlocks: number;
	filteredBlocks: number;
	favorites: number;
	hasActiveFilters: boolean;
	onClearFilters: () => void;
}

export function BlockLibraryFiltersPanel({
	searchTerm,
	onSearchTermChange,
	selectedCategory,
	onSelectedCategoryChange,
	selectedTag,
	onSelectedTagChange,
	categories,
	allTags,
	totalBlocks,
	filteredBlocks,
	favorites,
	hasActiveFilters,
	onClearFilters,
}: BlockLibraryFiltersPanelProps) {
	const panelClass =
		"rounded-lg border p-6 [border-color:var(--border)] [background:var(--bg-mid)]";
	const inputClass =
		"w-full rounded-lg border px-4 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]";

	return (
		<div className={panelClass}>
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				<div className="relative md:col-span-2">
					<Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform [color:var(--text-muted)]" />
					<input
						type="text"
						value={searchTerm}
						onChange={(event) => onSearchTermChange(event.target.value)}
						placeholder="Search blocks..."
						className={`${inputClass} pl-10`}
					/>
				</div>

				<div>
					<select
						value={selectedCategory}
						onChange={(event) => onSelectedCategoryChange(event.target.value)}
						className={inputClass}
					>
						{categories.map((category) => (
							<option key={category} value={category}>
								{category === "all" ? "All Categories" : category}
							</option>
						))}
					</select>
				</div>

				<div>
					<select
						value={selectedTag}
						onChange={(event) => onSelectedTagChange(event.target.value)}
						className={inputClass}
					>
						{allTags.map((tag) => (
							<option key={tag} value={tag}>
								{tag === "all" ? "All Tags" : tag}
							</option>
						))}
					</select>
				</div>
			</div>

			<div className="mt-4 flex items-center justify-between text-sm [color:var(--text-muted)]">
				<div className="flex items-center space-x-4">
					<span>Total: {totalBlocks}</span>
					<span>Filtered: {filteredBlocks}</span>
					<span>Favorites: {favorites}</span>
				</div>
				{hasActiveFilters && (
					<button
						onClick={onClearFilters}
						className="transition hover:opacity-80 [color:var(--primary)]"
					>
						Clear Filters
					</button>
				)}
			</div>
		</div>
	);
}
