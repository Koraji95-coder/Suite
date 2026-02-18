import { useMemo } from 'react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task } from './projectmanagertypes';
import { TaskItem } from './TaskItem';

interface TaskListProps {
  tasks: Task[];
  onToggleComplete: (task: Task) => void;
  onAddSubtask: (parentId: string) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
  expandedTasks: Set<string>;
  onToggleExpand: (taskId: string) => void;
  isProjectArchived?: boolean;
  sensors: any;
  filter?: 'all' | 'pending' | 'completed';
}

export function TaskList({
  tasks,
  onToggleComplete,
  onAddSubtask,
  onEditTask,
  onDeleteTask,
  onDragEnd,
  expandedTasks,
  onToggleExpand,
  isProjectArchived = false,
  sensors,
  filter = 'all',
}: TaskListProps) {
  // Build task hierarchy
  const tasksByParent = useMemo(() => {
    const map = new Map<string | null, Task[]>();
    tasks.forEach(t => {
      const key = t.parent_task_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    map.forEach(arr => arr.sort((a, b) => a.order - b.order));
    return map;
  }, [tasks]);

  const rootTasks = useMemo(() => tasksByParent.get(null) ?? [], [tasksByParent]);

  const filteredRootTasks = useMemo(() => {
    if (filter === 'all') return rootTasks;
    if (filter === 'pending') return rootTasks.filter(t => !t.completed);
    return rootTasks.filter(t => t.completed);
  }, [rootTasks, filter]);

  const renderTaskTree = (task: Task, level: number = 0) => {
    const subtasks = tasksByParent.get(task.id) ?? [];
    return (
      <div key={task.id}>
        <TaskItem
          task={task}
          level={level}
          subtasks={subtasks}
          isExpanded={expandedTasks.has(task.id)}
          onToggleExpand={onToggleExpand}
          onToggleComplete={onToggleComplete}
          onAddSubtask={onAddSubtask}
          onEdit={onEditTask}
          onDelete={onDeleteTask}
          isProjectArchived={isProjectArchived}
        />
        {expandedTasks.has(task.id) && subtasks.length > 0 && (
          <div className="space-y-2">
            {subtasks.map(subtask => renderTaskTree(subtask, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={filteredRootTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {filteredRootTasks.map(task => renderTaskTree(task))}
        </div>
      </SortableContext>
    </DndContext>
  );
}