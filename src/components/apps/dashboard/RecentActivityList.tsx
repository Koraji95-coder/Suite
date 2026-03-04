// src/components/apps/dashboard/RecentActivityList.tsx
import { Activity, Clock, FileText, FolderPlus, CheckCircle2, Edit3, Trash2 } from "lucide-react";
import type { ActivityLogRow } from "@/services/activityService";
import { getCategoryColor } from "./dashboardUtils";

// Primitives
import { Text } from "@/components/primitives/Text";
import { Panel } from "@/components/primitives/Panel";
import { Stack, HStack } from "@/components/primitives/Stack";

interface ProjectSummary {
  id: string;
  category: string | null;
}

interface RecentActivityListProps {
  activities: ActivityLogRow[];
  allProjectsMap: Map<string, ProjectSummary>;
}

// Map action types to icons
const ACTION_ICONS: Record<string, typeof Activity> = {
  created: FolderPlus,
  completed: CheckCircle2,
  updated: Edit3,
  deleted: Trash2,
  default: FileText,
};

function getActionIcon(description: string) {
  const lower = description.toLowerCase();
  if (lower.includes("created") || lower.includes("added")) return ACTION_ICONS.created;
  if (lower.includes("completed") || lower.includes("finished")) return ACTION_ICONS.completed;
  if (lower.includes("updated") || lower.includes("edited") || lower.includes("modified")) return ACTION_ICONS.updated;
  if (lower.includes("deleted") || lower.includes("removed")) return ACTION_ICONS.deleted;
  return ACTION_ICONS.default;
}

function formatTimeAgo(timestamp: string) {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentActivityList({
  activities,
  allProjectsMap,
}: RecentActivityListProps) {
  return (
    <Panel variant="default" padding="lg" className="h-full">
      <Stack gap={5}>
        {/* Header */}
        <HStack gap={3} align="center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Activity size={20} />
          </div>
          <Stack gap={0}>
            <Text size="lg" weight="bold">
              Recent Activity
            </Text>
            <Text size="xs" color="muted">
              Latest updates across your workspace
            </Text>
          </Stack>
        </HStack>

        {/* Activity timeline */}
        {activities.length === 0 ? (
          <Panel variant="inset" padding="lg" className="text-center">
            <Stack gap={3} align="center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2">
                <Activity size={24} className="text-text-muted" />
              </div>
              <Text size="sm" color="muted">
                No recent activity
              </Text>
            </Stack>
          </Panel>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-3 bottom-3 w-px bg-linear-to-b from-primary/30 via-border to-transparent" />
            
            <Stack gap={0}>
              {activities.map((activity, index) => {
                const project = activity.project_id
                  ? allProjectsMap.get(activity.project_id)
                  : undefined;
                const dotColor = project?.category
                  ? getCategoryColor(project.category)
                  : "var(--primary)";
                const Icon = getActionIcon(activity.description);
                const isLast = index === activities.length - 1;

                return (
                  <div
                    key={activity.id}
                    className={`
                      relative flex gap-4 pl-10 py-3
                      ${!isLast ? "border-b border-border/50" : ""}
                    `}
                  >
                    {/* Timeline dot */}
                    <div 
                      className="absolute left-3.5 top-5 h-3 w-3 rounded-full border-2 border-surface"
                      style={{ 
                        backgroundColor: dotColor,
                        boxShadow: `0 0 8px ${dotColor}50`,
                      }}
                    />

                    {/* Icon */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                      <Icon size={14} className="text-text-muted" />
                    </div>

                    {/* Content */}
                    <Stack gap={1} className="flex-1 min-w-0">
                      <Text size="sm" className="leading-relaxed">
                        {activity.description}
                      </Text>
                      <HStack gap={2} align="center">
                        <Clock size={10} className="text-text-muted" />
                        <Text size="xs" color="muted">
                          {formatTimeAgo(activity.timestamp)}
                        </Text>
                      </HStack>
                    </Stack>
                  </div>
                );
              })}
            </Stack>
          </div>
        )}
      </Stack>
    </Panel>
  );
}