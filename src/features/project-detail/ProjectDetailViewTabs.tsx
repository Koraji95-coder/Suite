import {
	CalendarDays,
	ClipboardList,
	FileDown,
	PackageCheck,
	ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./ProjectDetailViewTabs.module.css";
import type { ViewMode } from "@/features/project-core";
import {
	resolveProjectNotebookSection,
	type ProjectNotebookSection,
} from "@/lib/projectWorkflowNavigation";

interface ProjectDetailViewTabsProps {
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
}

const primaryTabs: {
	section: ProjectNotebookSection;
	label: string;
	icon: typeof ClipboardList;
	defaultViewMode: ViewMode;
}[] = [
	{ section: "overview", label: "Overview", icon: ClipboardList, defaultViewMode: "setup" },
	{ section: "calendar", label: "Calendar", icon: CalendarDays, defaultViewMode: "calendar" },
	{ section: "files", label: "Files", icon: FileDown, defaultViewMode: "files" },
	{ section: "release", label: "Release", icon: PackageCheck, defaultViewMode: "issue-sets" },
	{ section: "review", label: "Review", icon: ShieldAlert, defaultViewMode: "review" },
];

function renderTab(
	section: ProjectNotebookSection,
	label: string,
	Icon: typeof ClipboardList,
	activeSection: ProjectNotebookSection,
	defaultViewMode: ViewMode,
	onViewModeChange: (mode: ViewMode) => void,
) {
	return (
		<button
			key={section}
			type="button"
			onClick={() => onViewModeChange(defaultViewMode)}
			aria-pressed={activeSection === section}
			className={cn(styles.tab, activeSection === section && styles.tabActive)}
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
	const activeSection = resolveProjectNotebookSection(viewMode);

	return (
		<div className={styles.root}>
			<div className={styles.group}>
				<div className={styles.groupLabel}>Notebook sections</div>
				<div className={styles.tabRow}>
					{primaryTabs.map(({ section, label, icon, defaultViewMode }) =>
						renderTab(
							section,
							label,
							icon,
							activeSection,
							defaultViewMode,
							onViewModeChange,
						),
					)}
				</div>
			</div>
		</div>
	);
}
