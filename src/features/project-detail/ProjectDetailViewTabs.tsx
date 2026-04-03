import {
	CheckSquare,
	ClipboardList,
	FileCheck2,
	FileDown,
	FilePenLine,
	FolderTree,
	ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./ProjectDetailViewTabs.module.css";
import type { ViewMode } from "@/features/project-core";

interface ProjectDetailViewTabsProps {
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
}

const primaryTabs: { mode: ViewMode; label: string; icon: typeof CheckSquare }[] = [
	{ mode: "setup", label: "Setup", icon: FolderTree },
	{ mode: "readiness", label: "Readiness", icon: ClipboardList },
	{ mode: "review", label: "Review", icon: ShieldAlert },
	{ mode: "issue-sets", label: "Issue Sets", icon: FileCheck2 },
	{ mode: "revisions", label: "Revisions", icon: FilePenLine },
	{ mode: "files", label: "Files & activity", icon: FileDown },
];

function renderTab(
	mode: ViewMode,
	label: string,
	Icon: typeof CheckSquare,
	viewMode: ViewMode,
	onViewModeChange: (mode: ViewMode) => void,
) {
	return (
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
	);
}

export function ProjectDetailViewTabs({
	viewMode,
	onViewModeChange,
}: ProjectDetailViewTabsProps) {
	return (
		<div className={styles.root}>
			<div className={styles.group}>
				<div className={styles.groupLabel}>Project workflow</div>
				<div className={styles.tabRow}>
					{primaryTabs.map(({ mode, label, icon }) =>
						renderTab(mode, label, icon, viewMode, onViewModeChange),
					)}
				</div>
			</div>
		</div>
	);
}
