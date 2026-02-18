/*
  Consolidated migration for new Supabase project (pexuedwhofspygsplwop)
  Combines all 7 migrations into a single clean script.
  All user_id columns are TEXT with default 'Dustin' (no auth.users FK).
*/

-- ============================================================
-- 1. FORMULAS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  formula text NOT NULL,
  description text NOT NULL,
  variables jsonb DEFAULT '[]'::jsonb,
  user_id text NOT NULL DEFAULT 'Dustin',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read formulas" ON formulas FOR SELECT USING (true);
CREATE POLICY "Anyone can insert formulas" ON formulas FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update formulas" ON formulas FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete formulas" ON formulas FOR DELETE USING (true);

-- ============================================================
-- 2. SAVED_CALCULATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'Dustin',
  calculation_type text NOT NULL,
  inputs jsonb DEFAULT '{}'::jsonb,
  results jsonb DEFAULT '{}'::jsonb,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE saved_calculations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read saved calculations" ON saved_calculations FOR SELECT USING (true);
CREATE POLICY "Anyone can insert saved calculations" ON saved_calculations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update saved calculations" ON saved_calculations FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete saved calculations" ON saved_calculations FOR DELETE USING (true);

-- ============================================================
-- 3. SAVED_CIRCUITS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_circuits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'Dustin',
  name text NOT NULL,
  circuit_data jsonb DEFAULT '{}'::jsonb,
  image_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE saved_circuits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read saved circuits" ON saved_circuits FOR SELECT USING (true);
CREATE POLICY "Anyone can insert saved circuits" ON saved_circuits FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update saved circuits" ON saved_circuits FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete saved circuits" ON saved_circuits FOR DELETE USING (true);

-- ============================================================
-- 4. PROJECTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  deadline timestamptz,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  color text DEFAULT '#00ffff',
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived', 'on-hold')),
  category text DEFAULT 'Uncategorized',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id text NOT NULL DEFAULT 'Dustin'
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for projects" ON projects FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 5. TASKS TABLE (with subtask + priority from migration 4)
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  completed boolean DEFAULT false,
  "order" integer DEFAULT 0,
  due_date timestamptz,
  parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  created_at timestamptz DEFAULT now(),
  user_id text NOT NULL DEFAULT 'Dustin'
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 6. FILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL,
  size bigint DEFAULT 0,
  mime_type text DEFAULT 'application/octet-stream',
  uploaded_at timestamptz DEFAULT now(),
  user_id text NOT NULL DEFAULT 'Dustin'
);

ALTER TABLE files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for files" ON files FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 7. ACTIVITY_LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  description text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  task_id uuid,
  timestamp timestamptz DEFAULT now(),
  user_id text NOT NULL DEFAULT 'Dustin'
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for activity_log" ON activity_log FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 8. CALENDAR_EVENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  task_id uuid,
  due_date date NOT NULL,
  title text NOT NULL,
  type text DEFAULT 'deadline' CHECK (type IN ('deadline', 'milestone', 'reminder')),
  user_id text NOT NULL DEFAULT 'Dustin'
);

-- ============================================================
-- 9. WHITEBOARDS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS whiteboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'Dustin',
  title text NOT NULL,
  panel_context text NOT NULL,
  canvas_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  thumbnail_url text,
  tags text[] DEFAULT ARRAY[]::text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE whiteboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for whiteboards" ON whiteboards FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 10. AI_CONVERSATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'Dustin',
  panel_context text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for ai_conversations" ON ai_conversations FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 11. AI_MEMORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'Dustin',
  memory_type text NOT NULL CHECK (memory_type IN ('preference', 'knowledge', 'pattern', 'relationship')),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  connections jsonb DEFAULT '[]'::jsonb,
  strength integer DEFAULT 50 CHECK (strength >= 1 AND strength <= 100),
  created_at timestamptz DEFAULT now(),
  last_accessed timestamptz DEFAULT now()
);

ALTER TABLE ai_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for ai_memory" ON ai_memory FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 12. BLOCK_LIBRARY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS block_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'Dustin',
  name text NOT NULL,
  file_path text NOT NULL,
  thumbnail_url text,
  category text NOT NULL DEFAULT 'uncategorized',
  tags text[] DEFAULT ARRAY[]::text[],
  is_dynamic boolean DEFAULT false,
  dynamic_variations jsonb DEFAULT '[]'::jsonb,
  attributes jsonb DEFAULT '{}'::jsonb,
  views jsonb DEFAULT '{}'::jsonb,
  file_size bigint DEFAULT 0,
  usage_count integer DEFAULT 0,
  is_favorite boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  last_used timestamptz
);

ALTER TABLE block_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for block_library" ON block_library FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 13. AUTOMATION_WORKFLOWS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS automation_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'Dustin',
  name text NOT NULL,
  description text,
  workflow_type text NOT NULL CHECK (workflow_type IN ('calculation', 'integration', 'report', 'custom')),
  script_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule text,
  is_active boolean DEFAULT true,
  last_run timestamptz,
  run_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE automation_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for automation_workflows" ON automation_workflows FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 14. DRAWING_ANNOTATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS drawing_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'Dustin',
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  drawing_name text NOT NULL,
  file_path text NOT NULL,
  annotation_data jsonb DEFAULT '{}'::jsonb,
  qa_checks jsonb DEFAULT '{}'::jsonb,
  comparison_data jsonb DEFAULT '{}'::jsonb,
  issues_found jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

ALTER TABLE drawing_annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for drawing_annotations" ON drawing_annotations FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for calendar_events" ON calendar_events FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 15. UPDATE user_preferences (already exists) - add text user_id
-- ============================================================
DO $$
BEGIN
  -- Drop old uuid user_id if it exists and add text one
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'user_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE user_preferences DROP COLUMN user_id;
    ALTER TABLE user_preferences ADD COLUMN user_id text NOT NULL DEFAULT 'Dustin';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN user_id text NOT NULL DEFAULT 'Dustin';
  END IF;
END $$;

-- Drop old restrictive policies on user_preferences and replace
DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can delete own preferences" ON user_preferences;
CREATE POLICY "Allow all for user_preferences" ON user_preferences FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 16. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_deadline ON projects(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_events_due_date ON calendar_events(due_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_whiteboards_user_id ON whiteboards(user_id);
CREATE INDEX IF NOT EXISTS idx_whiteboards_panel_context ON whiteboards(panel_context);
CREATE INDEX IF NOT EXISTS idx_whiteboards_created_at ON whiteboards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whiteboards_tags ON whiteboards USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_created_at ON ai_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_memory_user_id ON ai_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_memory_type ON ai_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_ai_memory_strength ON ai_memory(strength DESC);
CREATE INDEX IF NOT EXISTS idx_ai_memory_last_accessed ON ai_memory(last_accessed DESC);
CREATE INDEX IF NOT EXISTS idx_block_library_user_id ON block_library(user_id);
CREATE INDEX IF NOT EXISTS idx_block_library_category ON block_library(category);
CREATE INDEX IF NOT EXISTS idx_block_library_tags ON block_library USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_block_library_is_favorite ON block_library(is_favorite);
CREATE INDEX IF NOT EXISTS idx_block_library_usage_count ON block_library(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_automation_workflows_user_id ON automation_workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_workflows_is_active ON automation_workflows(is_active);
CREATE INDEX IF NOT EXISTS idx_automation_workflows_type ON automation_workflows(workflow_type);
CREATE INDEX IF NOT EXISTS idx_drawing_annotations_user_id ON drawing_annotations(user_id);
CREATE INDEX IF NOT EXISTS idx_drawing_annotations_project_id ON drawing_annotations(project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_annotations_status ON drawing_annotations(status);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- ============================================================
-- 17. TRIGGER: auto-update updated_at on projects
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 18. DEFAULT FORMULA DATA
-- ============================================================
INSERT INTO formulas (name, category, formula, description, variables) VALUES
  ('Ohm''s Law (Voltage)', 'Basic Laws', 'V = I × R', 'Calculate voltage from current and resistance', '[{"symbol": "V", "name": "Voltage", "unit": "V"}, {"symbol": "I", "name": "Current", "unit": "A"}, {"symbol": "R", "name": "Resistance", "unit": "Ω"}]'::jsonb),
  ('Ohm''s Law (Current)', 'Basic Laws', 'I = V / R', 'Calculate current from voltage and resistance', '[{"symbol": "I", "name": "Current", "unit": "A"}, {"symbol": "V", "name": "Voltage", "unit": "V"}, {"symbol": "R", "name": "Resistance", "unit": "Ω"}]'::jsonb),
  ('Ohm''s Law (Resistance)', 'Basic Laws', 'R = V / I', 'Calculate resistance from voltage and current', '[{"symbol": "R", "name": "Resistance", "unit": "Ω"}, {"symbol": "V", "name": "Voltage", "unit": "V"}, {"symbol": "I", "name": "Current", "unit": "A"}]'::jsonb),
  ('Power (DC)', 'Power', 'P = V × I', 'Calculate power from voltage and current', '[{"symbol": "P", "name": "Power", "unit": "W"}, {"symbol": "V", "name": "Voltage", "unit": "V"}, {"symbol": "I", "name": "Current", "unit": "A"}]'::jsonb),
  ('Power (Resistance)', 'Power', 'P = I² × R', 'Calculate power from current and resistance', '[{"symbol": "P", "name": "Power", "unit": "W"}, {"symbol": "I", "name": "Current", "unit": "A"}, {"symbol": "R", "name": "Resistance", "unit": "Ω"}]'::jsonb),
  ('Power (Voltage)', 'Power', 'P = V² / R', 'Calculate power from voltage and resistance', '[{"symbol": "P", "name": "Power", "unit": "W"}, {"symbol": "V", "name": "Voltage", "unit": "V"}, {"symbol": "R", "name": "Resistance", "unit": "Ω"}]'::jsonb),
  ('Capacitive Reactance', 'Reactance', 'Xc = 1 / (2πfC)', 'Calculate capacitive reactance', '[{"symbol": "Xc", "name": "Capacitive Reactance", "unit": "Ω"}, {"symbol": "f", "name": "Frequency", "unit": "Hz"}, {"symbol": "C", "name": "Capacitance", "unit": "F"}]'::jsonb),
  ('Inductive Reactance', 'Reactance', 'XL = 2πfL', 'Calculate inductive reactance', '[{"symbol": "XL", "name": "Inductive Reactance", "unit": "Ω"}, {"symbol": "f", "name": "Frequency", "unit": "Hz"}, {"symbol": "L", "name": "Inductance", "unit": "H"}]'::jsonb),
  ('Resonant Frequency', 'Resonance', 'f = 1 / (2π√(LC))', 'Calculate resonant frequency of LC circuit', '[{"symbol": "f", "name": "Frequency", "unit": "Hz"}, {"symbol": "L", "name": "Inductance", "unit": "H"}, {"symbol": "C", "name": "Capacitance", "unit": "F"}]'::jsonb),
  ('Time Constant (RC)', 'Time Constants', 'τ = R × C', 'Calculate RC time constant', '[{"symbol": "τ", "name": "Time Constant", "unit": "s"}, {"symbol": "R", "name": "Resistance", "unit": "Ω"}, {"symbol": "C", "name": "Capacitance", "unit": "F"}]'::jsonb),
  ('Time Constant (RL)', 'Time Constants', 'τ = L / R', 'Calculate RL time constant', '[{"symbol": "τ", "name": "Time Constant", "unit": "s"}, {"symbol": "L", "name": "Inductance", "unit": "H"}, {"symbol": "R", "name": "Resistance", "unit": "Ω"}]'::jsonb),
  ('Impedance (Series RC)', 'Impedance', 'Z = √(R² + Xc²)', 'Calculate impedance of series RC circuit', '[{"symbol": "Z", "name": "Impedance", "unit": "Ω"}, {"symbol": "R", "name": "Resistance", "unit": "Ω"}, {"symbol": "Xc", "name": "Capacitive Reactance", "unit": "Ω"}]'::jsonb),
  ('Impedance (Series RL)', 'Impedance', 'Z = √(R² + XL²)', 'Calculate impedance of series RL circuit', '[{"symbol": "Z", "name": "Impedance", "unit": "Ω"}, {"symbol": "R", "name": "Resistance", "unit": "Ω"}, {"symbol": "XL", "name": "Inductive Reactance", "unit": "Ω"}]'::jsonb)
ON CONFLICT DO NOTHING;

-- Done! All tables created with TEXT user_id, open RLS policies, and default data.

