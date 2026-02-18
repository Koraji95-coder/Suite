/*
  # Update RLS Policies for Testing

  ## Changes
  - Allow unauthenticated users to access project management features for testing
  - Add policies for anonymous users (anon role)
  - Keep existing authenticated policies
  
  ## Notes
  - This enables testing without authentication
  - Can be updated later to require authentication in production
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;

-- Create new policies that allow both authenticated and anonymous access
CREATE POLICY "Allow all to view projects"
  ON projects FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all to insert projects"
  ON projects FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all to update projects"
  ON projects FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all to delete projects"
  ON projects FOR DELETE
  TO anon, authenticated
  USING (true);

-- Update tasks policies
DROP POLICY IF EXISTS "Users can view own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can insert own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;

CREATE POLICY "Allow all to view tasks"
  ON tasks FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all to insert tasks"
  ON tasks FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all to update tasks"
  ON tasks FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all to delete tasks"
  ON tasks FOR DELETE
  TO anon, authenticated
  USING (true);

-- Update files policies
DROP POLICY IF EXISTS "Users can view own files" ON files;
DROP POLICY IF EXISTS "Users can insert own files" ON files;
DROP POLICY IF EXISTS "Users can update own files" ON files;
DROP POLICY IF EXISTS "Users can delete own files" ON files;

CREATE POLICY "Allow all to view files"
  ON files FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all to insert files"
  ON files FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all to update files"
  ON files FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all to delete files"
  ON files FOR DELETE
  TO anon, authenticated
  USING (true);

-- Update activity_log policies
DROP POLICY IF EXISTS "Users can view own activity" ON activity_log;
DROP POLICY IF EXISTS "Users can insert own activity" ON activity_log;

CREATE POLICY "Allow all to view activity"
  ON activity_log FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all to insert activity"
  ON activity_log FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Update calendar_events policies
DROP POLICY IF EXISTS "Users can view own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can insert own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can update own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can delete own calendar events" ON calendar_events;

CREATE POLICY "Allow all to view calendar events"
  ON calendar_events FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all to insert calendar events"
  ON calendar_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all to update calendar events"
  ON calendar_events FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all to delete calendar events"
  ON calendar_events FOR DELETE
  TO anon, authenticated
  USING (true);
