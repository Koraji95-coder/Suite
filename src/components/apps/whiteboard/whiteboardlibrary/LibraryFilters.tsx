import { Filter, Search, Tag } from "lucide-react";
import styles from "./LibraryFilters.module.css";

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
		<div className={styles.root}>
			<div className={styles.controlsGrid}>
				<div className={styles.searchWrap}>
					<Search className={styles.searchIcon} />
					<input
						type="text"
						value={searchTerm}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Search whiteboards…"
						className={styles.searchInput}
					/>
				</div>

				{!hidePanelFilter && (
					<select
						value={selectedPanel}
						onChange={(e) => onPanelChange(e.target.value)}
						className={styles.input}
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
					className={styles.input}
				>
					{tags.map((tag) => (
						<option key={tag} value={tag}>
							{tag === "all" ? "All Tags" : tag}
						</option>
					))}
				</select>
			</div>

			<div className={styles.summaryRow}>
				<span>
					{totalCount} total · {filteredCount} shown
				</span>
				{!hidePanelFilter && selectedPanel !== "all" && (
					<span className={styles.summaryChip}>
						<Filter className={styles.summaryIcon} /> {selectedPanel}
					</span>
				)}
				{selectedTag !== "all" && (
					<span className={styles.summaryChip}>
						<Tag className={styles.summaryIcon} /> {selectedTag}
					</span>
				)}
			</div>
		</div>
	);
}
