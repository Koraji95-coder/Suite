import { Edit, Trash2, AlertCircle } from 'lucide-react';
import { Project, TaskCount } from './projectmanagertypes';
import { categoryColor, formatDateOnly, getPriorityColor } from './projectmanagerutils';

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
  const isArchived = project.status === 'completed';
  const taskCount = taskInfo?.total ?? 0;
  const completedCount = taskInfo?.completed ?? 0;
  const completionPct = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0;
  const nextDue = taskInfo?.nextDue ?? null;
  const hasOverdue = taskInfo?.hasOverdue ?? false;

  const showUpcomingTask = !isArchived && nextDue && project.deadline && nextDue.date.split('T')[0] < project.deadline.split('T')[0];

  return (
    <div
      onClick={() => onSelect(project)}
      className={`p-4 rounded-lg cursor-pointer transition-all border ${
        isSelected
          ? 'bg-orange-500/20 border-orange-500'
          : 'bg-black/30 border-white/10 hover:border-orange-500/40'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div
            className="w-4 h-4 rounded-full flex-shrink-0"
            style={{ backgroundColor: categoryColor(project.category) }}
          />
          <h4 className="text-white/90 font-semibold">{project.name}</h4>
        </div>
        <div className="flex space-x-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(project);
            }}
            className="p-1 hover:bg-orange-500/20 rounded"
          >
            <Edit className="w-4 h-4 text-orange-400" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project.id);
            }}
            className="p-1 hover:bg-red-500/20 rounded"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {isArchived ? (
          <span className="text-xs text-white/35 capitalize">Archived</span>
        ) : (
          <>
            <span className="text-xs text-white/35 capitalize">{project.status}</span>
            <span className={`text-xs px-2 py-1 rounded border ${getPriorityColor(project.priority)}`}>
              {project.priority}
            </span>
          </>
        )}
      </div>
      {project.deadline && (
        <div className="text-xs text-orange-400 mt-2">
          {isArchived
            ? `Archived ${formatDateOnly(project.deadline)}`
            : `Due ${formatDateOnly(project.deadline)}`}
        </div>
      )}
      {taskCount > 0 && (
        <div className="flex items-center space-x-2 mt-2">
          <div className="flex-1 bg-black/40 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-orange-500 to-amber-500 h-full transition-all duration-500"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <span className="text-xs text-white/40 whitespace-nowrap">
            {completedCount}/{taskCount} • {completionPct}%
          </span>
        </div>
      )}
      {!isArchived && hasOverdue && (
        <div className="text-xs text-red-400/90 mt-1 flex items-center space-x-1">
          <AlertCircle className="w-3 h-3" />
          <span>Overdue tasks</span>
        </div>
      )}
      {showUpcomingTask && nextDue && (
        <div className="text-xs text-yellow-400/80 mt-1 flex items-center space-x-1">
          <AlertCircle className="w-3 h-3" />
          <span className="truncate">Task "{nextDue.name}" due {formatDateOnly(nextDue.date)}</span>
        </div>
      )}
    </div>
  );
}