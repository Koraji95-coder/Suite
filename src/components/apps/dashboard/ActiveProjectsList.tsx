// src/components/apps/dashboard/ActiveProjectsList.tsx
import { AlertCircle, AlertTriangle, ChevronRight, FolderKanban } from "lucide-react";
import { useState } from "react";

// Primitives
import { Text } from "@/components/primitives/Text";
import { Panel } from "@/components/primitives/Panel";
import { Stack, HStack } from "@/components/primitives/Stack";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";

import {
  formatDateOnly,
  formatDeadline,
  getCategoryColor,
  getTaskUrgencyColor,
  getUrgencyColor,
} from "./dashboardUtils";

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
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);

  return (
    <Panel variant="default" padding="lg">
      <Stack gap={5}>
        {/* Header */}
        <HStack justify="between" align="center">
          <HStack gap={3} align="center">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
              <FolderKanban size={18} />
            </div>
            <Text size="lg" weight="bold" color="primary">
              Active Projects
            </Text>
            <Badge variant="soft" size="sm">
              {projects.length} active
            </Badge>
          </HStack>
          
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigateToProjectsHub?.()}
            iconRight={<ChevronRight size={14} />}
          >
            View All
          </Button>
        </HStack>

        {/* Project list */}
        <Stack gap={3}>
          {projects.length === 0 ? (
            <Text size="sm" color="muted">
              No active projects
            </Text>
          ) : (
            projects.map((project) => {
              const taskCount = projectTaskCounts.get(project.id);
              const catColor = getCategoryColor(project.category);
              const isHovered = hoveredProjectId === project.id;

              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onNavigateToProject?.(project.id)}
                  onMouseEnter={() => setHoveredProjectId(project.id)}
                  onMouseLeave={() => setHoveredProjectId(null)}
                  className={`
                    w-full rounded-xl border p-4 text-left transition-all duration-200
                    ${isHovered 
                      ? "border-primary/30 bg-surface-2 -translate-y-1 shadow-lg" 
                      : "border-border bg-surface hover:bg-surface-2"
                    }
                  `}
                >
                  <HStack justify="between" align="start">
                    <HStack gap={3} align="start" className="flex-1">
                      {/* Category dot */}
                      <div
                        className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                        style={{
                          backgroundColor: catColor,
                          boxShadow: `0 0 8px ${catColor}50`,
                        }}
                      />
                      
                      {/* Project info */}
                      <Stack gap={2} className="flex-1">
                        <Text size="sm" weight="semibold">
                          {project.name}
                        </Text>
                        
                        <HStack gap={3} align="center">
                          <Text 
                            size="sm" 
                            style={{ color: getUrgencyColor(project.deadline) }}
                          >
                            {formatDeadline(project.deadline)}
                          </Text>
                          {taskCount && (
                            <Text size="xs" color="muted">
                              {taskCount.completed}/{taskCount.total} tasks
                            </Text>
                          )}
                        </HStack>

                        {/* Overdue warning */}
                        {taskCount?.hasOverdue && (
                          <HStack gap={2} align="center">
                            <AlertCircle size={12} className="text-danger" />
                            <Text size="xs" color="danger">
                              Overdue tasks
                            </Text>
                          </HStack>
                        )}

                        {/* Next due task */}
                        {taskCount?.nextDue && (
                          <HStack gap={2} align="center">
                            <AlertTriangle size={12} className="text-warning" />
                            <Text 
                              size="xs"
                              style={{ color: getTaskUrgencyColor(taskCount.nextDue.date) }}
                            >
                              Task: "{taskCount.nextDue.name}" Due {formatDateOnly(taskCount.nextDue.date)}
                            </Text>
                          </HStack>
                        )}
                      </Stack>
                    </HStack>

                    <ChevronRight size={18} className="text-primary/60 shrink-0" />
                  </HStack>
                </button>
              );
            })
          )}
        </Stack>
      </Stack>
    </Panel>
  );
}