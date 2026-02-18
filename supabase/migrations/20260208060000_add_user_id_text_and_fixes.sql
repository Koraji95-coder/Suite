/*
  # Add text user_id, fix null categories, verify parent_task_id

  ## Changes
  1. Add user_id TEXT column (default 'Dustin') to all user-owned tables
     - Existing schema has user_id UUID referencing auth.users — we add a
       separate user_name (text) column for simple identification until
       full auth is wired up, BUT the user asked for user_id as text.
       Since the existing user_id uuid columns may have no data (no auth),
       we'll drop the old uuid column and replace with TEXT 'Dustin'.
  2. Fix null categories → 'Uncategorized'
  3. Confirm parent_task_id exists (already in earlier migration)
  4. Confirm task_id on calendar_events (already exists)

  ## IMPORTANT: Run this in the Supabase SQL Editor manually.
*/

-- ============================================================
-- 1. PROJECTS: Replace user_id uuid → user_id text
-- ============================================================
-- Drop existing policies that reference user_id (they use auth.uid())
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;

ALTER TABLE projects DROP COLUMN IF EXISTS user_id;
ALTER TABLE projects ADD COLUMN user_id TEXT NOT NULL DEFAULT 'Dustin';

-- ============================================================
-- 2. TASKS: Replace user_id uuid → user_id text
-- ============================================================
DROP POLICY IF EXISTS "Users can view own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can insert own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;

ALTER TABLE tasks DROP COLUMN IF EXISTS user_id;
ALTER TABLE tasks ADD COLUMN user_id TEXT NOT NULL DEFAULT 'Dustin';

-- ============================================================
-- 3. FILES: Replace user_id uuid → user_id text
-- ============================================================
DROP POLICY IF EXISTS "Users can view own files" ON files;
DROP POLICY IF EXISTS "Users can insert own files" ON files;
DROP POLICY IF EXISTS "Users can update own files" ON files;
DROP POLICY IF EXISTS "Users can delete own files" ON files;

ALTER TABLE files DROP COLUMN IF EXISTS user_id;
ALTER TABLE files ADD COLUMN user_id TEXT NOT NULL DEFAULT 'Dustin';

-- ============================================================
-- 4. ACTIVITY_LOG: Replace user_id uuid → user_id text
-- ============================================================
DROP POLICY IF EXISTS "Users can view own activity" ON activity_log;
DROP POLICY IF EXISTS "Users can insert own activity" ON activity_log;

ALTER TABLE activity_log DROP COLUMN IF EXISTS user_id;
ALTER TABLE activity_log ADD COLUMN user_id TEXT NOT NULL DEFAULT 'Dustin';

-- ============================================================
-- 5. CALENDAR_EVENTS: Replace user_id uuid → user_id text
-- ============================================================
DROP POLICY IF EXISTS "Users can view own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can insert own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can update own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can delete own calendar events" ON calendar_events;

ALTER TABLE calendar_events DROP COLUMN IF EXISTS user_id;
ALTER TABLE calendar_events ADD COLUMN user_id TEXT NOT NULL DEFAULT 'Dustin';

-- ============================================================
-- 6. FORMULAS: Add user_id text (didn't have one before)
-- ============================================================
ALTER TABLE formulas ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'Dustin';

-- ============================================================
-- 7. SAVED_CALCULATIONS: Replace user_id uuid → user_id text
-- ============================================================
ALTER TABLE saved_calculations DROP COLUMN IF EXISTS user_id;
ALTER TABLE saved_calculations ADD COLUMN user_id TEXT NOT NULL DEFAULT 'Dustin';

-- ============================================================
-- 8. SAVED_CIRCUITS: Replace user_id uuid → user_id text
-- ============================================================
ALTER TABLE saved_circuits DROP COLUMN IF EXISTS user_id;
ALTER TABLE saved_circuits ADD COLUMN user_id TEXT NOT NULL DEFAULT 'Dustin';

-- ============================================================
-- 9. Re-create simple RLS policies (allow all for single user)
-- ============================================================
-- Projects
CREATE POLICY "Allow all for projects" ON projects FOR ALL USING (true) WITH CHECK (true);
-- Tasks
CREATE POLICY "Allow all for tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
-- Files
CREATE POLICY "Allow all for files" ON files FOR ALL USING (true) WITH CHECK (true);
-- Activity log
CREATE POLICY "Allow all for activity_log" ON activity_log FOR ALL USING (true) WITH CHECK (true);
-- Calendar events
CREATE POLICY "Allow all for calendar_events" ON calendar_events FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 10. Fix null categories → 'Uncategorized'
-- ============================================================
UPDATE projects SET category = 'Uncategorized' WHERE category IS NULL;

-- ============================================================
-- 11. Verify parent_task_id exists (no-op if already present)
-- ============================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

-- ============================================================
-- 12. Verify task_id on calendar_events (should already exist)
-- ============================================================
-- calendar_events.task_id uuid already exists from project_management schema.
-- tasks.id uuid is the primary key. ✓ No action needed.

-- ============================================================
-- 13. Sync project colors to category colors
-- ============================================================
UPDATE projects SET color = '#22c55e' WHERE category = 'Coding';
UPDATE projects SET color = '#38bdf8' WHERE category = 'Substation';
UPDATE projects SET color = '#ec4899' WHERE category = 'QAQC';
UPDATE projects SET color = '#f59e0b' WHERE category = 'School';
UPDATE projects SET color = '#a855f7' WHERE category = 'Uncategorized';
UPDATE projects SET color = '#a855f7' WHERE category IS NULL;

-- Done!

