import { ChevronRight, AlertCircle, AlertTriangle } from 'lucide-react';
import { getCategoryColor, formatDeadline, getUrgencyColor, getTaskUrgencyColor, formatDateOnly } from './dashboardUtils';
import { useTheme, hexToRgba, glassCardInnerStyle } from '@/lib/palette';
import { GlassPanel } from '../ui/GlassPanel';
import { useState } from 'react';

interface Project {
  id: string;
  name: string;
  deadline: string | null;
  status: string;
  priority: string;
  color: string;
  category: string | null;
}

interface TaskCount {
  total: number;
  completed: number;
  nextDue: { name: string; date: string } | null;
  hasOverdue: boolean;
}

interface ActiveProjectsListProps {
  projects: Project[];
  projectTaskCounts: Map<string, TaskCount>;
  onNavigateToProject?: (projectId: string) => void;
  onNavigateToProjectsHub?: () => void;
}

export function ActiveProjectsList({
  projects,
  projectTaskCounts,
  onNavigateToProject,
  onNavigateToProjectsHub,
}: ActiveProjectsListProps) {
  const { palette } = useTheme();
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  return (
    <GlassPanel
      tint={palette.secondary}
      hoverEffect={false}
      className="p-6 group"
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold" style={{ color: hexToRgba(palette.text, 0.9) }}>Active Projects</h3>
          <button
            onClick={() => onNavigateToProjectsHub?.()}
            className="text-sm flex items-center space-x-1 px-3 py-1 rounded-lg transition-all hover:opacity-90"
            style={{
              ...glassCardInnerStyle(palette, palette.primary),
              color: palette.primary,
            }}
          >
            <span>View All</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {projects.length === 0 ? (
            <p className="text-sm" style={{ color: hexToRgba(palette.text, 0.3) }}>No active projects</p>
          ) : (
            projects.map((project) => {
              const taskCount = projectTaskCounts.get(project.id);
              const catColor = getCategoryColor(project.category);
              const isHovered = hoveredProjectId === project.id;

              return (
                <div
                  key={project.id}
                  className="p-4 cursor-pointer transition-all duration-300 hover:scale-[1.01] hover:-translate-y-px"
                  style={{
                    ...glassCardInnerStyle(palette, catColor),
                    border: `1px solid ${isHovered
                      ? hexToRgba(catColor, 0.3)
                      : hexToRgba(palette.text, 0.06)}`,
                  }}
                  onClick={() => onNavigateToProject?.(project.id)}
                  onMouseEnter={() => setHoveredProjectId(project.id)}
                  onMouseLeave={() => setHoveredProjectId(null)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div
                        className="w-3 h-3 rounded-full mt-1"
                        style={{ backgroundColor: catColor, boxShadow: `0 0 8px ${hexToRgba(catColor, 0.5)}` }}
                      />
                      <div className="flex-1">
                        <h4 className="font-semibold" style={{ color: hexToRgba(palette.text, 0.9) }}>
                          {project.name}
                        </h4>
                        <div className="flex items-center space-x-3 mt-2">
                          <span className="text-sm" style={{ color: getUrgencyColor(project.deadline) }}>
                            {formatDeadline(project.deadline)}
                          </span>
                          {taskCount && (
                            <span className="text-xs" style={{ color: hexToRgba(palette.text, 0.4) }}>
                              {taskCount.completed}/{taskCount.total} tasks
                            </span>
                          )}
                        </div>
                        {taskCount?.hasOverdue && (
                          <div className="flex items-center space-x-2 mt-1">
                            <AlertCircle className="w-3 h-3" style={{ color: palette.tertiary }} />
                            <span className="text-xs" style={{ color: hexToRgba(palette.tertiary, 0.9) }}>
                              Overdue tasks
                            </span>
                          </div>
                        )}
                        {taskCount?.nextDue && (
                          <div className="flex items-center space-x-2 mt-1">
                            <AlertTriangle className="w-3 h-3" style={{ color: palette.secondary }} />
                            <span className="text-xs" style={{ color: getTaskUrgencyColor(taskCount.nextDue.date) }}>
                              Task: &quot;{taskCount.nextDue.name}&quot; Due {formatDateOnly(taskCount.nextDue.date)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5" style={{ color: hexToRgba(palette.primary, 0.6) }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </GlassPanel>
  );
}