/*
  # Add Subtasks and Task Due Dates

  ## Changes
  1. Add due_date column to tasks table
  2. Add parent_task_id to tasks table for subtasks
  3. Add priority column to tasks
  4. Update indexes for better query performance

  ## New Features
  - Tasks can now have due dates
  - Tasks can have subtasks (hierarchical structure)
  - Tasks can have priority levels
  - Improved calendar integration
*/

-- Add new columns to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);

-- Update calendar_events to automatically sync with task due dates
DO $$
BEGIN
  -- Insert calendar events for existing tasks with due dates
  INSERT INTO calendar_events (project_id, task_id, due_date, title, type, user_id)
  SELECT 
    t.project_id,
    t.id,
    t.due_date::date,
    t.name,
    'deadline',
    t.user_id
  FROM tasks t
  WHERE t.due_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM calendar_events ce 
    WHERE ce.task_id = t.id
  );
END $$;
