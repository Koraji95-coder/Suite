import { Calendar, CheckSquare, FileDown, MapPin } from "lucide-react";
import type { CSSProperties } from "react";
import type { ViewMode } from "./projectmanagertypes";

interface ProjectDetailViewTabsProps {
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
	tabButtonStyle: (active: boolean) => CSSProperties;
}

export function ProjectDetailViewTabs({
	viewMode,
	onViewModeChange,
	tabButtonStyle,
}: ProjectDetailViewTabsProps) {
	return (
		<div className="flex flex-wrap items-center gap-2 mb-2">
			<button
				onClick={() => onViewModeChange("tasks")}
				className="px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2"
				style={tabButtonStyle(viewMode === "tasks")}
			>
				<CheckSquare className="w-4 h-4" />
				<span>Tasks</span>
			</button>
			<button
				onClick={() => onViewModeChange("calendar")}
				className="px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2"
				style={tabButtonStyle(viewMode === "calendar")}
			>
				<Calendar className="w-4 h-4" />
				<span>Calendar</span>
			</button>
			<button
				onClick={() => onViewModeChange("files")}
				className="px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2"
				style={tabButtonStyle(viewMode === "files")}
			>
				<FileDown className="w-4 h-4" />
				<span>Files</span>
			</button>
			<button
				onClick={() => onViewModeChange("ground-grids")}
				className="px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2"
				style={tabButtonStyle(viewMode === "ground-grids")}
			>
				<MapPin className="w-4 h-4" />
				<span>Ground Grids</span>
			</button>
		</div>
	);
}
