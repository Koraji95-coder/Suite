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
import { cn } from "@/lib/utils";
import { Task } from "./projectmanagertypes";
import {
	formatDateOnly,
	getPriorityTone,
	getUrgencyTone,
} from "./projectmanagerutils";
import styles from "./TaskItem.module.css";

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
	const hasSubtasks = subtasks.length > 0;
	const urgencyTone = getUrgencyTone(task.due_date);
	const priorityTone = getPriorityTone(task.priority);

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
		<div ref={setNodeRef} style={style} className={styles.root}>
			<div
				className={cn(
					styles.row,
					priorityTone === "urgent" && styles.rowUrgent,
					priorityTone === "high" && styles.rowHigh,
					priorityTone === "medium" && styles.rowMedium,
					priorityTone === "low" && styles.rowLow,
				)}
				style={{
					marginLeft: `${level * 24}px`,
				}}
			>
				{!isProjectArchived && (
					<div {...attributes} {...listeners} className={styles.dragHandle}>
						<GripVertical className={styles.dragIcon} />
					</div>
				)}

				{hasSubtasks && (
					<button
						onClick={() => onToggleExpand(task.id)}
						className={styles.iconButton}
						type="button"
					>
						{isExpanded ? (
							<ChevronDown className={styles.chevronIcon} />
						) : (
							<ChevronRight className={styles.chevronIcon} />
						)}
					</button>
				)}

				<button
					onClick={() => onToggleComplete(task)}
					className={styles.iconButton}
					type="button"
				>
					{task.completed ? (
						<CheckSquare className={cn(styles.checkIcon, styles.checkDone)} />
					) : (
						<Square className={cn(styles.checkIcon, styles.checkOpen)} />
					)}
				</button>

				<div className={styles.content}>
					<span
						className={cn(styles.title, task.completed && styles.titleDone)}
					>
						{task.name}
					</span>
					{task.due_date && (
						<div
							className={cn(
								styles.dueChip,
								urgencyTone === "danger" && styles.urgencyDanger,
								urgencyTone === "warning" && styles.urgencyWarning,
								urgencyTone === "success" && styles.urgencySuccess,
							)}
						>
							<Clock className={styles.clockIcon} />
							<span>{formatDateOnly(task.due_date)}</span>
						</div>
					)}
				</div>

				<span
					className={cn(
						styles.priorityChip,
						priorityTone === "urgent" && styles.priorityChipUrgent,
						priorityTone === "high" && styles.priorityChipHigh,
						priorityTone === "medium" && styles.priorityChipMedium,
						priorityTone === "low" && styles.priorityChipLow,
					)}
				>
					{task.priority}
				</span>

				{!isProjectArchived && (
					<>
						<button
							onClick={() => onAddSubtask(task.id)}
							className={styles.iconButton}
							title="Add subtask"
							type="button"
						>
							<Plus className={cn(styles.actionIcon, styles.actionPrimary)} />
						</button>
						<button
							onClick={() => onEdit(task)}
							className={styles.iconButton}
							type="button"
						>
							<Edit className={cn(styles.actionIcon, styles.actionPrimary)} />
						</button>
					</>
				)}

				<button
					onClick={() => onDelete(task.id)}
					className={styles.iconButton}
					type="button"
				>
					<Trash2 className={cn(styles.actionIcon, styles.actionDanger)} />
				</button>
			</div>
		</div>
	);
}
