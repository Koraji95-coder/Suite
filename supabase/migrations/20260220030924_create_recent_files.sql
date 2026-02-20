/*
  # Create recent files tracking table

  1. New Tables
    - `recent_files`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `file_name` (text) - display name of the file
      - `file_path` (text) - route or storage path
      - `file_type` (text) - mime type or category
      - `context` (text) - which panel/app the file was opened from
      - `accessed_at` (timestamptz) - when the file was last accessed
  2. Security
    - Enable RLS on `recent_files` table
    - Authenticated users can only access their own recent files
  3. Notes
    - Unique constraint on (user_id, file_path) to allow upsert behavior
    - Index on user_id + accessed_at for fast recent file queries
*/

CREATE TABLE IF NOT EXISTS recent_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text NOT NULL DEFAULT 'unknown',
  context text NOT NULL DEFAULT '',
  accessed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_recent_files_user_accessed
  ON recent_files (user_id, accessed_at DESC);

ALTER TABLE recent_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recent files"
  ON recent_files FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recent files"
  ON recent_files FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recent files"
  ON recent_files FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recent files"
  ON recent_files FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
