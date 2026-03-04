// src/components/apps/dashboard/CalendarWidget.tsx
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getUrgencyLevel } from "../calendar/urgencyUtils";
import { formatDateString } from "./dashboardUtils";

// Primitives
import { Text } from "@/components/primitives/Text";
import { Panel } from "@/components/primitives/Panel";
import { Stack, HStack } from "@/components/primitives/Stack";
import { Button, IconButton } from "@/components/primitives/Button";

interface TaskDueItem {
  id: string;
  name: string;
  due_date: string;
  project_id: string;
  completed: boolean;
}

interface Project {
  id: string;
  name: string;
  deadline: string | null;
  status: string;
  priority: string;
  color: string;
  category: string | null;
}

interface CalendarWidgetProps {
  calendarMonth: Date;
  onMonthChange: (month: Date) => void;
  selectedDate: string | null;
  onDateSelect: (date: string | null) => void;
  projects: Project[];
  allTasksWithDates: TaskDueItem[];
  allProjectsMap: Map<string, Project>;
  onNavigateToProject?: (projectId: string) => void;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function CalendarWidget({
  calendarMonth,
  onMonthChange,
  selectedDate,
  onDateSelect,
  projects,
  allTasksWithDates,
  allProjectsMap,
  onNavigateToProject,
}: CalendarWidgetProps) {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();
  
  const today = new Date();
  const todayStr = formatDateString(today.getFullYear(), today.getMonth(), today.getDate());

  const navigateMonth = (direction: number) => {
    const newMonth = new Date(year, month + direction, 1);
    onMonthChange(newMonth);
  };

  const handleToday = () => {
    onMonthChange(new Date());
    onDateSelect(todayStr);
  };

  const handleDateClick = (dateStr: string) => {
    onDateSelect(selectedDate === dateStr ? null : dateStr);
  };

  // Build calendar days
  const calendarDays = [];
  
  // Empty cells before first day
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(<div key={`empty-${i}`} className="h-9" />);
  }

  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDateString(year, month, day);
    const isToday = dateStr === todayStr;
    const isSelected = selectedDate === dateStr;
    
    const hasProjectDeadline = projects.some((p) => {
      if (!p.deadline) return false;
      return p.deadline.split("T")[0] === dateStr;
    });
    const hasTaskDue = allTasksWithDates.some((t) => t.due_date.split("T")[0] === dateStr);
    const hasDueDate = hasProjectDeadline || hasTaskDue;

    let urgencyClass = "";
    if (hasDueDate) {
      const allDatesOnDay = [
        ...projects.filter((p) => p.deadline?.split("T")[0] === dateStr).map((p) => p.deadline!),
        ...allTasksWithDates.filter((t) => t.due_date.split("T")[0] === dateStr).map((t) => t.due_date),
      ];
      const urgency = getUrgencyLevel(allDatesOnDay[0]);
      urgencyClass = urgency === "OVERDUE" ? "bg-danger/20 text-danger border-danger/30" :
                     urgency === "CRITICAL" ? "bg-warning/20 text-warning border-warning/30" :
                     urgency === "WARNING" ? "bg-info/20 text-info border-info/30" :
                     "bg-success/20 text-success border-success/30";
    }

    calendarDays.push(
      <button
        key={day}
        type="button"
        onClick={() => handleDateClick(dateStr)}
        className={`
          h-9 w-9 flex items-center justify-center rounded-lg text-sm font-medium
          transition-all duration-150
          ${isSelected 
            ? "bg-primary text-primary-contrast ring-2 ring-primary/30" 
            : isToday
              ? "bg-primary/20 text-primary font-bold"
              : hasDueDate
                ? `border ${urgencyClass}`
                : "text-text-muted hover:bg-surface-2 hover:text-text"
          }
        `}
      >
        {day}
      </button>
    );
  }

  // Selected date content
  const selectedDateContent = selectedDate && (() => {
    const tasksOnDate = allTasksWithDates.filter((t) => t.due_date.split("T")[0] === selectedDate);
    const projectsOnDate = projects.filter((p) => p.deadline?.split("T")[0] === selectedDate);
    const hasContent = tasksOnDate.length > 0 || projectsOnDate.length > 0;
    
    const [y, m, d] = selectedDate.split("-").map(Number);
    const dateLabel = new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    return (
      <Panel variant="inset" padding="md" className="mt-4">
        <Stack gap={2}>
          <Text size="sm" weight="semibold">{dateLabel}</Text>
          
          {!hasContent ? (
            <Text size="xs" color="muted">No events this day</Text>
          ) : (
            <Stack gap={1}>
              {tasksOnDate.map((task) => {
                const project = allProjectsMap.get(task.project_id);
                return (
                  <div
                    key={task.id}
                    className={`text-sm ${task.completed ? "line-through text-text-muted" : "text-primary"}`}
                  >
                    📋 {task.name}
                    {project && (
                      <Text size="xs" color="muted" className="ml-1">
                        ({project.name})
                      </Text>
                    )}
                  </div>
                );
              })}
              {projectsOnDate.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onNavigateToProject?.(project.id)}
                  className="text-sm text-left text-primary hover:underline"
                >
                  📁 {project.name} — deadline
                </button>
              ))}
            </Stack>
          )}
        </Stack>
      </Panel>
    );
  })();

  return (
    <Panel variant="default" padding="lg">
      <Stack gap={4}>
        {/* Header */}
        <HStack justify="between" align="center">
          <HStack gap={3} align="center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <CalendarIcon size={20} />
            </div>
            <Text size="lg" weight="bold">
              {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </Text>
          </HStack>
          
          <HStack gap={1}>
            <IconButton
              icon={<ChevronLeft size={16} />}
              aria-label="Previous month"
              variant="ghost"
              size="sm"
              onClick={() => navigateMonth(-1)}
            />
            <Button variant="ghost" size="sm" onClick={handleToday}>
              Today
            </Button>
            <IconButton
              icon={<ChevronRight size={16} />}
              aria-label="Next month"
              variant="ghost"
              size="sm"
              onClick={() => navigateMonth(1)}
            />
          </HStack>
        </HStack>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((day, i) => (
            <div key={i} className="h-8 flex items-center justify-center">
              <Text size="xs" color="muted" weight="semibold">
                {day}
              </Text>
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays}
        </div>

        {/* Selected date details */}
        {selectedDateContent}
      </Stack>
    </Panel>
  );
}