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

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
	{ value: "architecture", label: "Architecture" },
	{ value: "memory", label: "Memory" },
	{ value: "both", label: "Both" },
];

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
				{SOURCE_OPTIONS.map((opt) => (
					<button
						key={opt.value}
						onClick={() => onSourceFilterChange(opt.value)}
						className={cn(
							styles.buttonBase,
							sourceFilter === opt.value
								? styles.buttonActive
								: styles.buttonInactive,
						)}
					>
						{opt.label}
					</button>
				))}
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
