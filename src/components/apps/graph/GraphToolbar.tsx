import { Box, Layers, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./GraphToolbar.module.css";
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
		<div className={styles.root}>
			<div className={styles.segment}>
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

			<div className={styles.divider} />

			<div className={styles.segment}>
				<button
					onClick={() => onViewModeChange("3d")}
					className={cn(
						styles.buttonBase,
						styles.iconButton,
						viewMode === "3d" ? styles.buttonActive : styles.buttonInactive,
					)}
				>
					<Box size={14} className={styles.buttonIcon} />
					3D
				</button>
				<button
					onClick={() => onViewModeChange("2d")}
					className={cn(
						styles.buttonBase,
						styles.iconButton,
						viewMode === "2d" ? styles.buttonActive : styles.buttonInactive,
					)}
				>
					<Layers size={14} className={styles.buttonIcon} />
					2D
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

			<button
				onClick={onAddMemory}
				className={cn(
					styles.buttonBase,
					styles.buttonInactive,
					styles.iconButton,
				)}
				title="Add Memory"
			>
				<Plus size={14} className={styles.buttonIcon} />
				Memory
			</button>
		</div>
	);
}
