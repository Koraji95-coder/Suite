import { Calendar, CheckSquare, FileDown, MapPin } from "lucide-react";
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
	{ mode: "ground-grids", label: "Ground Grids", icon: MapPin },
];

export function ProjectDetailViewTabs({
	viewMode,
	onViewModeChange,
}: ProjectDetailViewTabsProps) {
	return (
		<div className={styles.root}>
			{tabs.map(({ mode, label, icon: Icon }) => (
				<button
					key={mode}
					type="button"
					onClick={() => onViewModeChange(mode)}
					className={cn(styles.tab, viewMode === mode && styles.tabActive)}
				>
					<Icon className={styles.icon} />
					<span>{label}</span>
				</button>
			))}
		</div>
	);
}
