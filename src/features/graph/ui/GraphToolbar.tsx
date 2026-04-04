import { Layers, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./GraphToolbar.module.css";
import type { SourceFilter } from "./types";

interface GraphToolbarProps {
	sourceFilter: SourceFilter;
	onSourceFilterChange: (filter: SourceFilter) => void;
	searchQuery: string;
	onSearchChange: (query: string) => void;
}

export function GraphToolbar({
	sourceFilter,
	onSourceFilterChange,
	searchQuery,
	onSearchChange,
}: GraphToolbarProps) {
	return (
		<div className={styles.root}>
			<div className={styles.segment}>
				<div className={styles.scopeLabel}>
					<Layers size={14} className={styles.scopeIcon} />
					Source
				</div>
				<button
					onClick={() => onSourceFilterChange("architecture")}
					className={cn(
						styles.buttonBase,
						sourceFilter === "architecture"
							? styles.buttonActive
							: styles.buttonInactive,
					)}
				>
					Architecture
				</button>
			</div>

			<div className={styles.searchWrap}>
				<Search size={14} className={styles.searchIcon} />
				<input
					type="text"
					placeholder="Search nodes..."
					value={searchQuery}
					onChange={(e) => onSearchChange(e.target.value)}
					className={styles.searchInput}
					name="graphtoolbar_input_79"
				/>
			</div>
		</div>
	);
}
