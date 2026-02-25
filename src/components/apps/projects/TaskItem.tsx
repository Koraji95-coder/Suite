import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	CheckSquare,
	ChevronDown,
	ChevronRight,
	Clock,
	Edit,
	GripVertical,
	Plus,
	Square,
	Trash2,
} from "lucide-react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { Task } from "./projectmanagertypes";
import {
	formatDateOnly,
	getPriorityChipStyle,
	getPriorityRowStyle,
	getUrgencyColor,
} from "./projectmanagerutils";

interface TaskItemProps {
	task: Task;
	level?: number;
	subtasks?: Task[];
	isExpanded: boolean;
	onToggleExpand: (taskId: string) => void;
	onToggleComplete: (task: Task) => void;
	onAddSubtask: (parentId: string) => void;
	onEdit: (task: Task) => void;
	onDelete: (taskId: string) => void;
	isProjectArchived?: boolean;
}

export function TaskItem({
	task,
	level = 0,
	subtasks = [],
	isExpanded,
	onToggleExpand,
	onToggleComplete,
	onAddSubtask,
	onEdit,
	onDelete,
	isProjectArchived = false,
}: TaskItemProps) {
	const { palette } = useTheme();
	const hasSubtasks = subtasks.length > 0;

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: task.id, disabled: isProjectArchived });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div ref={setNodeRef} style={style} className="space-y-2">
			<div
				className="flex items-center space-x-3 p-3 rounded-lg transition-all"
				style={{
					marginLeft: `${level * 24}px`,
					...getPriorityRowStyle(palette, task.priority),
				}}
			>
				{!isProjectArchived && (
					<div
						{...attributes}
						{...listeners}
						className="cursor-grab active:cursor-grabbing p-1 touch-none"
					>
						<GripVertical
							className="w-4 h-4"
							style={{ color: hexToRgba(palette.primary, 0.6) }}
						/>
					</div>
				)}
				{hasSubtasks && (
					<button onClick={() => onToggleExpand(task.id)} className="p-1">
						{isExpanded ? (
							<ChevronDown
								className="w-4 h-4"
								style={{ color: hexToRgba(palette.primary, 0.85) }}
							/>
						) : (
							<ChevronRight
								className="w-4 h-4"
								style={{ color: hexToRgba(palette.primary, 0.85) }}
							/>
						)}
					</button>
				)}
				<button onClick={() => onToggleComplete(task)}>
					{task.completed ? (
						<CheckSquare className="w-5 h-5 text-green-400" />
					) : (
						<Square
							className="w-5 h-5"
							style={{ color: hexToRgba(palette.primary, 0.85) }}
						/>
					)}
				</button>
				<div className="flex-1">
					<span
						className="block"
						style={{
							color: hexToRgba(palette.text, task.completed ? 0.35 : 0.9),
							textDecoration: task.completed ? "line-through" : "none",
						}}
					>
						{task.name}
					</span>
					{task.due_date && (
						<div
							className={`flex items-center space-x-1 text-xs mt-1 ${getUrgencyColor(task.due_date)}`}
						>
							<Clock className="w-3 h-3" />
							<span>{formatDateOnly(task.due_date)}</span>
						</div>
					)}
				</div>
				<span
					className="text-xs px-2 py-1 rounded border"
					style={getPriorityChipStyle(palette, task.priority)}
				>
					{task.priority}
				</span>
				{!isProjectArchived && (
					<>
						<button
							onClick={() => onAddSubtask(task.id)}
							className="p-1 rounded transition-colors hover:bg-white/5"
							title="Add subtask"
						>
							<Plus
								className="w-4 h-4"
								style={{ color: hexToRgba(palette.primary, 0.85) }}
							/>
						</button>
						<button
							onClick={() => onEdit(task)}
							className="p-1 rounded transition-colors hover:bg-white/5"
						>
							<Edit
								className="w-4 h-4"
								style={{ color: hexToRgba(palette.primary, 0.85) }}
							/>
						</button>
					</>
				)}
				<button
					onClick={() => onDelete(task.id)}
					className="p-1 rounded transition-colors hover:bg-white/5"
				>
					<Trash2
						className="w-4 h-4"
						style={{ color: hexToRgba(palette.accent, 0.9) }}
					/>
				</button>
			</div>
		</div>
	);
}
