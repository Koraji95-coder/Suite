import { Search } from "lucide-react";
import styles from "./BlockLibraryFiltersPanel.module.css";

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
	return (
		<div className={styles.panel}>
			<div className={styles.filtersGrid}>
				<div className={styles.searchWrap}>
					<Search className={styles.searchIcon} />
					<input
						type="text"
						value={searchTerm}
						onChange={(event) => onSearchTermChange(event.target.value)}
						placeholder="Search blocks..."
						className={styles.searchInput}
					name="blocklibraryfilterspanel_input_40"
					/>
				</div>

				<div>
					<select
						value={selectedCategory}
						onChange={(event) => onSelectedCategoryChange(event.target.value)}
						className={styles.select}
					 name="blocklibraryfilterspanel_select_50">
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
						className={styles.select}
					 name="blocklibraryfilterspanel_select_64">
						{allTags.map((tag) => (
							<option key={tag} value={tag}>
								{tag === "all" ? "All Tags" : tag}
							</option>
						))}
					</select>
				</div>
			</div>

			<div className={styles.summaryRow}>
				<div className={styles.summaryStats}>
					<span>Total: {totalBlocks}</span>
					<span>Filtered: {filteredBlocks}</span>
					<span>Favorites: {favorites}</span>
				</div>
				{hasActiveFilters && (
					<button onClick={onClearFilters} className={styles.clearButton}>
						Clear Filters
					</button>
				)}
			</div>
		</div>
	);
}
