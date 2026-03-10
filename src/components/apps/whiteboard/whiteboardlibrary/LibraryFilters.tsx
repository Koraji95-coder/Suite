import { Filter, Search, Tag } from "lucide-react";
import { useId } from "react";
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
	const fieldPrefix = useId().replace(/:/g, "");
	return (
		<div className={styles.root}>
			<div className={styles.controlsGrid}>
				<div className={styles.searchWrap}>
					<Search className={styles.searchIcon} />
					<input
						id={`${fieldPrefix}-search`}
						name="whiteboard_library_search"
						type="text"
						value={searchTerm}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Search whiteboards…"
						className={styles.searchInput}
					/>
				</div>

				{!hidePanelFilter && (
					<select
						id={`${fieldPrefix}-panel-filter`}
						name="whiteboard_library_panel"
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
					id={`${fieldPrefix}-tag-filter`}
					name="whiteboard_library_tag"
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
