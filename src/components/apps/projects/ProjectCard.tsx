import { AlertCircle, Edit, Trash2 } from "lucide-react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { Project, TaskCount } from "./projectmanagertypes";
import {
	categoryColor,
	formatDateOnly,
	getPriorityChipStyle,
} from "./projectmanagerutils";

interface ProjectCardProps {
	project: Project;
	isSelected: boolean;
	taskInfo?: TaskCount;
	onSelect: (project: Project) => void;
	onEdit: (project: Project) => void;
	onDelete: (projectId: string) => void;
	onToggleArchive?: (project: Project) => void;
}

export function ProjectCard({
	project,
	isSelected,
	taskInfo,
	onSelect,
	onEdit,
	onDelete,
}: ProjectCardProps) {
	const { palette } = useTheme();
	const isArchived = project.status === "completed";
	const taskCount = taskInfo?.total ?? 0;
	const completedCount = taskInfo?.completed ?? 0;
	const completionPct =
		taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0;
	const nextDue = taskInfo?.nextDue ?? null;
	const hasOverdue = taskInfo?.hasOverdue ?? false;

	const showUpcomingTask =
		!isArchived &&
		nextDue &&
		project.deadline &&
		nextDue.date.split("T")[0] < project.deadline.split("T")[0];

	return (
		<div
			onClick={() => onSelect(project)}
			className="p-4 rounded-lg cursor-pointer transition-all border hover:scale-[1.01]"
			style={{
				background: isSelected
					? `linear-gradient(135deg, ${hexToRgba(palette.primary, 0.18)} 0%, ${hexToRgba(
							palette.surface,
							0.55,
						)} 100%)`
					: `linear-gradient(135deg, ${hexToRgba(palette.surface, 0.4)} 0%, ${hexToRgba(
							palette.surface,
							0.6,
						)} 100%)`,
				border: `1px solid ${hexToRgba(
					isSelected ? palette.primary : palette.text,
					isSelected ? 0.5 : 0.08,
				)}`,
				boxShadow: `0 12px 30px ${hexToRgba(
					isSelected ? palette.primary : "#000000",
					isSelected ? 0.12 : 0.18,
				)}`,
			}}
		>
			<div className="flex items-start justify-between mb-2">
				<div className="flex items-center space-x-2">
					<div
						className="w-4 h-4 rounded-full flex-shrink-0"
						style={{ backgroundColor: categoryColor(project.category) }}
					/>
					<h4
						className="font-semibold"
						style={{ color: hexToRgba(palette.text, 0.92) }}
					>
						{project.name}
					</h4>
				</div>
				<div className="flex space-x-1">
					<button
						onClick={(e) => {
							e.stopPropagation();
							onEdit(project);
						}}
						className="p-1 rounded transition-colors hover:bg-white/5"
					>
						<Edit
							className="w-4 h-4"
							style={{ color: hexToRgba(palette.primary, 0.85) }}
						/>
					</button>
					<button
						onClick={(e) => {
							e.stopPropagation();
							onDelete(project.id);
						}}
						className="p-1 rounded transition-colors hover:bg-white/5"
					>
						<Trash2
							className="w-4 h-4"
							style={{ color: hexToRgba(palette.accent, 0.9) }}
						/>
					</button>
				</div>
			</div>
			<div className="flex items-center space-x-2">
				{isArchived ? (
					<span
						className="text-xs capitalize"
						style={{ color: hexToRgba(palette.text, 0.4) }}
					>
						Archived
					</span>
				) : (
					<>
						<span
							className="text-xs capitalize"
							style={{ color: hexToRgba(palette.text, 0.45) }}
						>
							{project.status}
						</span>
						<span
							className="text-xs px-2 py-1 rounded border"
							style={getPriorityChipStyle(palette, project.priority)}
						>
							{project.priority}
						</span>
					</>
				)}
			</div>
			{project.deadline && (
				<div
					className="text-xs mt-2"
					style={{ color: hexToRgba(palette.primary, 0.85) }}
				>
					{isArchived
						? `Archived ${formatDateOnly(project.deadline)}`
						: `Due ${formatDateOnly(project.deadline)}`}
				</div>
			)}
			{taskCount > 0 && (
				<div className="flex items-center space-x-2 mt-2">
					<div
						className="flex-1 rounded-full h-1.5 overflow-hidden"
						style={{ background: hexToRgba(palette.surface, 0.6) }}
					>
						<div
							className="h-full transition-all duration-500"
							style={{
								background: `linear-gradient(90deg, ${palette.primary} 0%, ${palette.tertiary} 100%)`,
								width: `${completionPct}%`,
							}}
						/>
					</div>
					<span
						className="text-xs whitespace-nowrap"
						style={{ color: hexToRgba(palette.text, 0.45) }}
					>
						{completedCount}/{taskCount} • {completionPct}%
					</span>
				</div>
			)}
			{!isArchived && hasOverdue && (
				<div
					className="text-xs mt-1 flex items-center space-x-1"
					style={{ color: hexToRgba(palette.accent, 0.9) }}
				>
					<AlertCircle className="w-3 h-3" />
					<span>Overdue tasks</span>
				</div>
			)}
			{showUpcomingTask && nextDue && (
				<div
					className="text-xs mt-1 flex items-center space-x-1"
					style={{ color: hexToRgba(palette.tertiary, 0.9) }}
				>
					<AlertCircle className="w-3 h-3" />
					<span className="truncate">
						Task "{nextDue.name}" due {formatDateOnly(nextDue.date)}
					</span>
				</div>
			)}
		</div>
	);
}
