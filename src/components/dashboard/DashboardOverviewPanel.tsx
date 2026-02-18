import { memo, useState, useEffect, useCallback } from 'react';
import { Sparkles, Clock, Settings2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PanelInfoDialog } from '../PanelInfoDialog';
import { dashboardInfo } from '../../data/panelInfo';
import { logger } from '../../lib/errorLogger';
import { StatsCards } from './StatsCards';
import { CalendarWidget } from './CalendarWidget';
import { RecentActivityList } from './RecentActivityList';
import { ActiveProjectsList } from './ActiveProjectsList';
import { DashboardCustomizer } from './DashboardCustomizer';
import { useDashboardLayout } from './useDashboardLayout';
import { useTheme, hexToRgba, glassCardInnerStyle } from '@/lib/palette';
import { GlassPanel } from '../ui/GlassPanel';

/* ── Isolated live clock (prevents full dashboard rerender every second) ── */
const LiveClockBadge = memo(function LiveClockBadge() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="text-lg font-mono">
      {now.toLocaleTimeString()}
    </span>
  );
});

interface Project {
  id: string;
  name: string;
  deadline: string | null;
  status: string;
  priority: string;
  color: string;
  category: string | null;
}

interface ActivityItem {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  project_id: string | null;
}

interface TaskCount {
  total: number;
  completed: number;
  nextDue: { name: string; date: string } | null;
  hasOverdue: boolean;
}

interface TaskDueItem {
  id: string;
  name: string;
  due_date: string;
  project_id: string;
  completed: boolean;
}

interface DashboardOverviewPanelProps {
  onNavigateToProject?: (projectId: string) => void;
  onNavigateToProjectsHub?: () => void;
  selectedCalendarDate?: string | null;
  onCalendarDateChange?: (date: string | null) => void;
  calendarMonth?: Date;
  onCalendarMonthChange?: (month: Date) => void;
}

export function DashboardOverviewPanel({
  onNavigateToProject,
  onNavigateToProjectsHub,
  selectedCalendarDate,
  onCalendarDateChange,
  calendarMonth: externalMonth,
  onCalendarMonthChange,
}: DashboardOverviewPanelProps) {
  const { palette } = useTheme();
  const { widgets, editMode, setEditMode, toggleWidget, reorderWidgets, resetLayout } = useDashboardLayout();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [storageUsed, setStorageUsed] = useState(0);
  const [internalCalendarMonth, setInternalCalendarMonth] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [projectTaskCounts, setProjectTaskCounts] = useState<Map<string, TaskCount>>(new Map());
  const [allTasksWithDates, setAllTasksWithDates] = useState<TaskDueItem[]>([]);

  const calendarMonth = externalMonth ?? internalCalendarMonth;
  const setCalendarMonth = (month: Date) => {
    if (onCalendarMonthChange) onCalendarMonthChange(month);
    else setInternalCalendarMonth(month);
  };

  const toLocalDay = (iso: string) => {
    const [y, m, d] = iso.split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const loadAllProjectTaskCounts = useCallback(async (projectList: Project[]) => {
    if (projectList.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, project_id, completed, due_date, name')
        .in('project_id', projectList.map(p => p.id)) as { data: TaskDueItem[] | null; error: any };

      if (error) throw error;
      if (!data) return;

      // Group tasks by project_id once
      const byProject = new Map<string, TaskDueItem[]>();
      for (const t of data) {
        const arr = byProject.get(t.project_id);
        if (arr) arr.push(t);
        else byProject.set(t.project_id, [t]);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const counts = new Map<string, TaskCount>();

      for (const p of projectList) {
        const projectTasks = byProject.get(p.id) ?? [];
        const total = projectTasks.length;

        let completed = 0;
        let hasOverdue = false;
        let nextDue: { name: string; date: string } | null = null;
        let nextDueDate: Date | null = null;

        for (const t of projectTasks) {
          if (t.completed) {
            completed += 1;
            continue;
          }
          if (!t.due_date) continue;

          const due = toLocalDay(t.due_date);

          if (due < today) {
            hasOverdue = true;
            continue;
          }

          if (!nextDueDate || due < nextDueDate) {
            nextDueDate = due;
            nextDue = { name: t.name, date: t.due_date };
          }
        }

        counts.set(p.id, { total, completed, nextDue, hasOverdue });
      }

      setProjectTaskCounts(counts);

      // Only keep tasks with due dates for calendar
      setAllTasksWithDates(
        data
          .filter(t => t.due_date)
          .map(t => ({
            id: t.id,
            name: t.name,
            due_date: t.due_date!,
            project_id: t.project_id,
            completed: t.completed,
          })),
      );
    } catch {
      // silent
    }
  }, []);

  const loadDashboardData = useCallback(async () => {
    let alive = true;
    try {
      setIsLoading(true);
      logger.info('MainDashboard', 'Loading dashboard data...');

      const projectsQ = supabase
        .from('projects')
        .select('*')
        .eq('status', 'active')
        .order('deadline', { ascending: true, nullsFirst: false })
        .limit(5);

      const activitiesQ = supabase
        .from('activity_log')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(7);

      const filesQ = supabase
        .from('files')
        .select('size') as any;

      const [{ data: projectsData, error: projectsError }, { data: activitiesData, error: activitiesError }, { data: filesData, error: filesError }] =
        await Promise.all([projectsQ, activitiesQ, filesQ]);

      if (!alive) return;

      if (projectsError) logger.error('MainDashboard', 'Failed to load projects', { error: projectsError });
      if (activitiesError) logger.error('MainDashboard', 'Failed to load activities', { error: activitiesError });
      if (filesError) logger.error('MainDashboard', 'Failed to load files data', { error: filesError });

      if (projectsData) {
        setProjects(projectsData);
        loadAllProjectTaskCounts(projectsData);
      }
      if (activitiesData) setActivities(activitiesData);

      if (filesData) {
        const totalSize = filesData.reduce((sum: number, f: any) => sum + (f.size || 0), 0);
        setStorageUsed(totalSize);
      }
    } catch (error) {
      logger.critical('MainDashboard', 'Critical error loading dashboard data', { error });
    } finally {
      if (alive) setIsLoading(false);
    }

    return () => {
      alive = false;
    };
  }, [loadAllProjectTaskCounts]);

  useEffect(() => {
    const cleanupPromise = loadDashboardData();
    return () => {
      cleanupPromise.then(cleanup => {
        if (typeof cleanup === 'function') cleanup();
      });
    };
  }, [loadDashboardData]);

  // Build map of all projects (including inactive) for activity colors
  const [allProjectsMap, setAllProjectsMap] = useState<Map<string, Project>>(new Map());
  useEffect(() => {
    const loadProjectsForActivities = async () => {
      const activityProjectIds = activities
        .filter(a => a.project_id && !projects.some(p => p.id === a.project_id))
        .map(a => a.project_id!);
      if (activityProjectIds.length === 0) {
        setAllProjectsMap(new Map(projects.map(p => [p.id, p])));
        return;
      }
      const { data } = await supabase
        .from('projects')
        .select('id, name, deadline, status, priority, color, category')
        .in('id', activityProjectIds) as { data: Project[] | null };
      const merged = new Map(projects.map(p => [p.id, p]));
      if (data) data.forEach(p => merged.set(p.id, p));
      setAllProjectsMap(merged);
    };
    loadProjectsForActivities();
  }, [activities, projects]);

  const handleDateSelect = (date: string | null) => {
    if (onCalendarDateChange) onCalendarDateChange(date);
  };

  const visibleWidgets = widgets.filter(w => w.visible);

  const widgetMap: Record<string, React.ReactNode> = {
    stats: (
      <StatsCards
        key="stats"
        projectsCount={projects.length}
        storageUsed={storageUsed}
        activitiesCount={activities.length}
        isLoading={isLoading}
      />
    ),
    calendar: (
      <CalendarWidget
        key="calendar"
        calendarMonth={calendarMonth}
        onMonthChange={setCalendarMonth}
        selectedDate={selectedCalendarDate ?? null}
        onDateSelect={handleDateSelect}
        projects={projects}
        allTasksWithDates={allTasksWithDates}
        allProjectsMap={allProjectsMap}
        onNavigateToProject={onNavigateToProject}
      />
    ),
    activity: (
      <RecentActivityList key="activity" activities={activities} allProjectsMap={allProjectsMap} />
    ),
    projects: (
      <ActiveProjectsList
        key="projects"
        projects={projects}
        projectTaskCounts={projectTaskCounts}
        onNavigateToProject={onNavigateToProject}
        onNavigateToProjectsHub={onNavigateToProjectsHub}
      />
    ),
  };

  const gridIds = new Set(['calendar', 'activity']);

  const renderWidgets = () => {
    const elements: React.ReactNode[] = [];
    let i = 0;
    while (i < visibleWidgets.length) {
      const w = visibleWidgets[i];
      if (gridIds.has(w.id)) {
        const gridChildren: React.ReactNode[] = [widgetMap[w.id]];
        if (i + 1 < visibleWidgets.length && gridIds.has(visibleWidgets[i + 1].id)) {
          gridChildren.push(widgetMap[visibleWidgets[i + 1].id]);
          i += 2;
        } else {
          i += 1;
        }
        elements.push(
          <div key={`grid-${w.id}`} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {gridChildren}
          </div>
        );
      } else {
        elements.push(widgetMap[w.id]);
        i += 1;
      }
    }
    return elements;
  };

  return (
    <div className="space-y-6">
      <GlassPanel
        tint={palette.primary}
        hoverEffect={false}
        className="flex items-center justify-between p-5 group"
      >
        <div className="relative z-10 flex items-center space-x-4">
          <div
            className="p-3 rounded-xl"
            style={{
              background: `linear-gradient(135deg, ${hexToRgba(palette.primary, 0.3)} 0%, ${hexToRgba(palette.primary, 0.08)} 100%)`,
              boxShadow: `0 0 24px ${hexToRgba(palette.primary, 0.18)}`,
            }}
          >
            <Sparkles className="w-8 h-8 animate-pulse" style={{ color: palette.primary }} />
          </div>
          <div>
            <h2 className="text-3xl font-bold" style={{ color: hexToRgba(palette.text, 0.95) }}>Dashboard Overview</h2>
            <p className="mt-1 text-sm" style={{ color: hexToRgba(palette.text, 0.45) }}>Welcome back! Here's what's happening.</p>
          </div>
        </div>

        <div className="relative z-10 flex items-center space-x-4">
          <button
            onClick={() => setEditMode(!editMode)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{
              ...glassCardInnerStyle(palette, palette.primary),
              color: editMode ? palette.text : palette.primary,
              background: editMode ? hexToRgba(palette.primary, 0.2) : undefined,
            }}
            aria-label="Customize dashboard"
          >
            <Settings2 className="w-4 h-4" />
            Customize
          </button>
          <div
            className="flex items-center space-x-2 px-3 py-2 rounded-lg"
            style={{
              ...glassCardInnerStyle(palette, palette.primary),
              color: hexToRgba(palette.text, 0.6),
            }}
          >
            <Clock className="w-5 h-5" style={{ color: palette.primary }} />
            <LiveClockBadge />
          </div>
          <PanelInfoDialog
            title={dashboardInfo.title}
            sections={dashboardInfo.sections}
            colorScheme={dashboardInfo.colorScheme}
          />
        </div>
      </GlassPanel>

      {editMode && (
        <DashboardCustomizer
          widgets={widgets}
          onToggle={toggleWidget}
          onReorder={reorderWidgets}
          onReset={resetLayout}
          onClose={() => setEditMode(false)}
        />
      )}

      {renderWidgets()}
    </div>
  );
}