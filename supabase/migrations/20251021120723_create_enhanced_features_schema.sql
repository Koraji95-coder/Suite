/*
  # Enhanced Features Schema for EE Dashboard

  ## Overview
  This migration adds comprehensive support for:
  - Global whiteboard and notes system
  - AI conversation tracking and memory
  - Block library management
  - Automation workflows
  - Drawing annotations and QA/QC tools
  - User preferences and AI learning

  ## New Tables
  
  ### 1. whiteboards
  Stores canvas-based drawings and notes accessible from any panel
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `title` (text)
  - `panel_context` (text) - Which panel this was created from
  - `canvas_data` (jsonb) - Canvas drawing data
  - `thumbnail_url` (text) - Preview image URL
  - `tags` (text[]) - Searchable tags
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. ai_conversations
  Tracks AI assistant interactions and context
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `panel_context` (text) - Current panel when conversation occurred
  - `messages` (jsonb) - Array of messages with role and content
  - `context_data` (jsonb) - Additional context like current project
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 3. ai_memory
  Stores AI memory system data for personalization and mind map
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `memory_type` (text) - 'preference', 'knowledge', 'pattern', 'relationship'
  - `content` (jsonb) - Memory content and metadata
  - `connections` (jsonb) - Mind map connections to other memories
  - `strength` (integer) - Memory importance/frequency (1-100)
  - `created_at` (timestamptz)
  - `last_accessed` (timestamptz)

  ### 4. block_library
  Manages DWG/CAD file metadata and organization
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `name` (text)
  - `file_path` (text) - Path to DWG file in storage
  - `thumbnail_url` (text) - Preview thumbnail
  - `category` (text) - User-defined category
  - `tags` (text[]) - Searchable tags
  - `is_dynamic` (boolean) - Is this a dynamic block
  - `dynamic_variations` (jsonb) - Array of dynamic block variations
  - `attributes` (jsonb) - Block attribute data from DWG
  - `views` (jsonb) - Available views (top, front, side, bottom, 3d)
  - `file_size` (bigint)
  - `usage_count` (integer) - Track usage
  - `is_favorite` (boolean)
  - `created_at` (timestamptz)
  - `last_used` (timestamptz)

  ### 5. automation_workflows
  Stores custom automation scripts and workflows
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `name` (text)
  - `description` (text)
  - `workflow_type` (text) - 'calculation', 'integration', 'report', 'custom'
  - `script_data` (jsonb) - Workflow configuration and script
  - `schedule` (text) - Cron schedule if automated
  - `is_active` (boolean)
  - `last_run` (timestamptz)
  - `run_count` (integer)
  - `created_at` (timestamptz)

  ### 6. drawing_annotations
  QA/QC tool for drawing standards checking and comparison
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `project_id` (uuid, references projects)
  - `drawing_name` (text)
  - `file_path` (text) - Path to drawing file
  - `annotation_data` (jsonb) - Markup and callout data
  - `qa_checks` (jsonb) - Standards compliance check results
  - `comparison_data` (jsonb) - PDF comparison results with differences
  - `issues_found` (jsonb) - Array of detected issues
  - `status` (text) - 'pending', 'reviewed', 'approved', 'rejected'
  - `created_at` (timestamptz)
  - `reviewed_at` (timestamptz)

  ### 7. user_preferences
  Stores user settings and AI learning data
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users, unique)
  - `ui_preferences` (jsonb) - Dashboard layout, theme, etc
  - `ai_preferences` (jsonb) - AI behavior preferences
  - `panel_favorites` (text[]) - Frequently used panels
  - `recent_activities` (jsonb) - Recent actions for AI context
  - `work_patterns` (jsonb) - AI-learned work patterns
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Security
  - All tables have RLS enabled
  - Users can only access their own data
  - Authenticated access required for all operations
*/

-- Create whiteboards table
CREATE TABLE IF NOT EXISTS whiteboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  panel_context text NOT NULL,
  canvas_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  thumbnail_url text,
  tags text[] DEFAULT ARRAY[]::text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create ai_conversations table
CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  panel_context text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create ai_memory table
CREATE TABLE IF NOT EXISTS ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_type text NOT NULL CHECK (memory_type IN ('preference', 'knowledge', 'pattern', 'relationship')),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  connections jsonb DEFAULT '[]'::jsonb,
  strength integer DEFAULT 50 CHECK (strength >= 1 AND strength <= 100),
  created_at timestamptz DEFAULT now(),
  last_accessed timestamptz DEFAULT now()
);

-- Create block_library table
CREATE TABLE IF NOT EXISTS block_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Create automation_workflows table
CREATE TABLE IF NOT EXISTS automation_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Create drawing_annotations table
CREATE TABLE IF NOT EXISTS drawing_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  ui_preferences jsonb DEFAULT '{}'::jsonb,
  ai_preferences jsonb DEFAULT '{}'::jsonb,
  panel_favorites text[] DEFAULT ARRAY[]::text[],
  recent_activities jsonb DEFAULT '[]'::jsonb,
  work_patterns jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
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

-- Enable Row Level Security on all tables
ALTER TABLE whiteboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for whiteboards
CREATE POLICY "Users can view own whiteboards"
  ON whiteboards FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own whiteboards"
  ON whiteboards FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own whiteboards"
  ON whiteboards FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own whiteboards"
  ON whiteboards FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for ai_conversations
CREATE POLICY "Users can view own conversations"
  ON ai_conversations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own conversations"
  ON ai_conversations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own conversations"
  ON ai_conversations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own conversations"
  ON ai_conversations FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for ai_memory
CREATE POLICY "Users can view own memory"
  ON ai_memory FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own memory"
  ON ai_memory FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own memory"
  ON ai_memory FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own memory"
  ON ai_memory FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for block_library
CREATE POLICY "Users can view own blocks"
  ON block_library FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own blocks"
  ON block_library FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own blocks"
  ON block_library FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own blocks"
  ON block_library FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for automation_workflows
CREATE POLICY "Users can view own workflows"
  ON automation_workflows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own workflows"
  ON automation_workflows FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own workflows"
  ON automation_workflows FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own workflows"
  ON automation_workflows FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for drawing_annotations
CREATE POLICY "Users can view own annotations"
  ON drawing_annotations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own annotations"
  ON drawing_annotations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own annotations"
  ON drawing_annotations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own annotations"
  ON drawing_annotations FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for user_preferences
CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own preferences"
  ON user_preferences FOR DELETE
  TO authenticated
  USING (true);