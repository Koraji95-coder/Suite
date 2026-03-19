import { Calendar, CheckSquare, FileDown, FilePenLine, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./ProjectDetailViewTabs.module.css";
import type { ViewMode } from "./projectmanagertypes";

interface ProjectDetailViewTabsProps {
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
}

const tabs: { mode: ViewMode; label: string; icon: typeof CheckSquare }[] = [
	{ mode: "tasks", label: "Tasks", icon: CheckSquare },
	{ mode: "calendar", label: "Calendar", icon: Calendar },
	{ mode: "files", label: "Files", icon: FileDown },
	{ mode: "revisions", label: "Revisions", icon: FilePenLine },
	{ mode: "ground-grids", label: "Ground Grids", icon: MapPin },
];

export function ProjectDetailViewTabs({
	viewMode,
	onViewModeChange,
}: ProjectDetailViewTabsProps) {
	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<p className={styles.eyebrow}>Workspace lanes</p>
				<p className={styles.copy}>
					Switch between tasks, calendar, files, revisions, and grid design views.
				</p>
			</div>
			<div className={styles.tabRow}>
				{tabs.map(({ mode, label, icon: Icon }) => (
					<button
						key={mode}
						type="button"
						onClick={() => onViewModeChange(mode)}
						aria-pressed={viewMode === mode}
						className={cn(styles.tab, viewMode === mode && styles.tabActive)}
					>
						<Icon className={styles.icon} />
						<span>{label}</span>
					</button>
				))}
			</div>
		</div>
	);
}
