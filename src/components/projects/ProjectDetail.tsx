import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, FileDown, Archive, AlertCircle, CheckSquare, MapPin, Plus } from 'lucide-react';
import { Project, Task, ProjectFile, CalendarEvent, TaskFilter, ViewMode } from './projectmanagertypes';
import { categoryColor, formatDateOnly } from './projectmanagerutils';
import { TaskList } from './TaskList';
import { CalendarView } from './CalanderView';
import { FilesBrowser } from './FilesBrowser';
import { supabase } from '@/lib/supabase';
import type { GridDesign } from '@/components/apps/ground-grid/types';

interface ProjectDetailProps {
  project: Project;
  tasks: Task[];
  files: ProjectFile[];
  calendarEvents: CalendarEvent[];
  onToggleArchive: (project: Project) => void;
  onExportMarkdown: () => void;
  onAddTask: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleTaskComplete: (task: Task) => void;
  onAddSubtask: (parentId: string) => void;
  onDragEnd: (event: any) => void;
  expandedTasks: Set<string>;
  onToggleExpand: (taskId: string) => void;
  sensors: any;
  taskFilter: TaskFilter;
  onTaskFilterChange: (filter: TaskFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedCalendarDate: string | null;
  onCalendarDateSelect: (date: string | null) => void;
  currentMonth: Date;
  onMonthChange: (month: Date) => void;
  fileFilter: string;
  onFileFilterChange: (filter: string) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadFile: (file: ProjectFile) => void;
}

export function ProjectDetail({
  project,
  tasks,
  files,
  calendarEvents,
  onToggleArchive,
  onExportMarkdown,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onToggleTaskComplete,
  onAddSubtask,
  onDragEnd,
  expandedTasks,
  onToggleExpand,
  sensors,
  taskFilter,
  onTaskFilterChange,
  viewMode,
  onViewModeChange,
  selectedCalendarDate,
  onCalendarDateSelect,
  currentMonth,
  onMonthChange,
  fileFilter,
  onFileFilterChange,
  onFileUpload,
  onDownloadFile,
}: ProjectDetailProps) {
  const navigate = useNavigate();
  const [gridDesigns, setGridDesigns] = useState<GridDesign[]>([]);

  useEffect(() => {
    if (project?.id) {
      supabase.from('ground_grid_designs')
        .select('*')
        .eq('project_id', project.id)
        .order('updated_at', { ascending: false })
        .then(({ data }) => { if (data) setGridDesigns(data as GridDesign[]); });
    }
  }, [project?.id]);

  async function createLinkedDesign() {
    const { data } = await supabase.from('ground_grid_designs')
      .insert({ name: `${project.name} - Grid Design`, project_id: project.id })
      .select()
      .maybeSingle();
    if (data) {
      navigate(`/apps/ground-grid-generator?design=${data.id}`);
    }
  }

  const completionPercentage = tasks.length > 0
    ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-white/80">{project.name}</h3>
            <p className="text-white/50 mt-1">{project.description}</p>
            <div className="flex items-center space-x-4 mt-3">
              {project.deadline && (
                <div className="flex items-center space-x-2 text-white/60">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm">
                    {project.status === 'completed'
                      ? `Archived ${formatDateOnly(project.deadline)}`
                      : `Due ${formatDateOnly(project.deadline)}`}
                  </span>
                </div>
              )}
              {project.category && (
                <span
                  className="text-xs px-2 py-0.5 rounded border"
                  style={{ borderColor: categoryColor(project.category), color: categoryColor(project.category) }}
                >
                  {project.category}
                </span>
              )}
            </div>
            <div className="text-xs text-orange-400/80 mt-2">
              Status: {(project.status === 'completed' ? 'Archived' : project.status).replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onToggleArchive(project)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 border ${
                project.status === 'completed'
                  ? 'bg-green-500/10 border-green-500/40 text-green-300 hover:bg-green-500/20'
                  : 'bg-yellow-500/10 border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/20'
              }`}
              title={project.status === 'completed' ? 'Unarchive project' : 'Archive project'}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{project.status === 'completed' ? 'Unarchive' : 'Archive'}</span>
            </button>
            <button
              onClick={onExportMarkdown}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 border bg-orange-500/10 border-orange-500/40 text-white/60 hover:bg-orange-500/20"
              title="Copy project as Markdown"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-white/60">Progress</span>
            <span className="text-white/90 font-semibold">{completionPercentage}%</span>
          </div>
          <div key={project.id} className="w-full bg-black/50 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-orange-500 to-amber-500 h-full transition-all duration-700 ease-out"
              style={{ width: `${completionPercentage}%`, willChange: 'width' }}
            ></div>
          </div>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex space-x-2 mb-4">
        <button
          onClick={() => onViewModeChange('tasks')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            viewMode === 'tasks'
              ? 'bg-orange-500/30 text-white/90 border border-orange-400'
              : 'bg-black/30 text-white/60 border border-white/10 hover:border-orange-500/40'
          }`}
        >
          Tasks
        </button>
        <button
          onClick={() => onViewModeChange('calendar')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            viewMode === 'calendar'
              ? 'bg-orange-500/30 text-white/90 border border-orange-400'
              : 'bg-black/30 text-white/60 border border-white/10 hover:border-orange-500/40'
          }`}
        >
          Calendar
        </button>
        <button
          onClick={() => onViewModeChange('files')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            viewMode === 'files'
              ? 'bg-orange-500/30 text-white/90 border border-orange-400'
              : 'bg-black/30 text-white/60 border border-white/10 hover:border-orange-500/40'
          }`}
        >
          Files
        </button>
        <button
          onClick={() => onViewModeChange('ground-grids')}
          className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center space-x-2 ${
            viewMode === 'ground-grids'
              ? 'bg-orange-500/30 text-white/90 border border-orange-400'
              : 'bg-black/30 text-white/60 border border-white/10 hover:border-orange-500/40'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Ground Grids</span>
        </button>
      </div>

      {/* Content based on view mode */}
      {viewMode === 'tasks' && (
        <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xl font-bold text-white/80">Tasks</h4>
            <button
              onClick={onAddTask}
              className="bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-white/90 px-4 py-2 rounded-lg transition-all flex items-center space-x-2"
            >
              <span>+</span>
              <span>Add Task</span>
            </button>
          </div>

          {tasks.length > 0 && (
            <div className="flex space-x-2 mb-4">
              {(['all', 'pending', 'completed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => onTaskFilterChange(f)}
                  className={`px-3 py-1 text-xs rounded-full transition-all ${
                    taskFilter === f
                      ? 'bg-orange-600 text-white'
                      : 'bg-black/40 text-white/60 hover:bg-orange-900/40'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          )}

          {tasks.length === 0 ? (
            <div className="text-center py-12 text-orange-400/60">
              <CheckSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No tasks in this project</p>
              <p className="text-sm mt-1 opacity-80">
                Click <span className="text-white/60 font-medium">Add Task</span> to begin
              </p>
            </div>
          ) : (
            <TaskList
              tasks={tasks}
              onToggleComplete={onToggleTaskComplete}
              onAddSubtask={onAddSubtask}
              onEditTask={onEditTask}
              onDeleteTask={onDeleteTask}
              onDragEnd={onDragEnd}
              expandedTasks={expandedTasks}
              onToggleExpand={onToggleExpand}
              isProjectArchived={project.status === 'completed'}
              sensors={sensors}
              filter={taskFilter}
            />
          )}
        </div>
      )}

      {viewMode === 'calendar' && (
        <CalendarView
          currentMonth={currentMonth}
          onMonthChange={onMonthChange}
          selectedDate={selectedCalendarDate}
          onDateSelect={onCalendarDateSelect}
          calendarEvents={calendarEvents}
        />
      )}

      {viewMode === 'files' && (
        <FilesBrowser
          files={files}
          filter={fileFilter}
          onFilterChange={onFileFilterChange}
          onUpload={onFileUpload}
          onDownload={onDownloadFile}
          projectName={project.name}
        />
      )}

      {viewMode === 'ground-grids' && (
        <div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xl font-bold text-white/80">Ground Grid Designs</h4>
            <button
              onClick={createLinkedDesign}
              className="bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-white/90 px-4 py-2 rounded-lg transition-all flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>New Design</span>
            </button>
          </div>

          {gridDesigns.length === 0 ? (
            <div className="text-center py-12 text-orange-400/60">
              <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No ground grid designs linked</p>
              <p className="text-sm mt-1 opacity-80">
                Create a new design or link an existing one from the Grid Generator
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {gridDesigns.map(d => (
                <button
                  key={d.id}
                  onClick={() => navigate(`/apps/ground-grid-generator?design=${d.id}`)}
                  className="w-full text-left bg-black/20 hover:bg-black/30 border border-orange-500/20 hover:border-orange-500/40 rounded-lg p-4 transition-all flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <MapPin className="w-5 h-5 text-orange-400" />
                    <div>
                      <div className="text-white/80 font-semibold">{d.name}</div>
                      <div className="text-xs text-white/40 mt-0.5">
                        {new Date(d.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    d.status === 'finalized' ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                    : d.status === 'archived' ? 'bg-white/10 text-white/40 border border-white/10'
                    : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                  }`}>
                    {d.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}