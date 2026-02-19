/*
  # Create Ground Grid Design Tables

  1. New Tables
    - `ground_grid_designs`
      - `id` (uuid, primary key) - unique design identifier
      - `project_id` (uuid, nullable, FK to projects) - links design to a project
      - `name` (text) - design name e.g. "Main Substation Grid"
      - `description` (text, nullable) - optional notes
      - `status` (text) - draft, finalized, or archived
      - `config` (jsonb) - stores origin settings, block scale, toggles
      - `user_id` (text) - owner identifier
      - `created_at` / `updated_at` (timestamptz)
    - `ground_grid_rods`
      - `id` (uuid, primary key)
      - `design_id` (uuid, FK to ground_grid_designs) - parent design
      - `label` (text) - rod identifier e.g. "R1"
      - `grid_x` / `grid_y` (numeric) - position in grid coordinates
      - `depth` (numeric) - rod depth
      - `diameter` (numeric) - rod diameter
      - `sort_order` (integer) - display ordering
    - `ground_grid_conductors`
      - `id` (uuid, primary key)
      - `design_id` (uuid, FK to ground_grid_designs) - parent design
      - `label` (text) - conductor identifier e.g. "C1"
      - `length` (numeric, nullable) - conductor length
      - `x1` / `y1` / `x2` / `y2` (numeric) - start and end coordinates
      - `diameter` (numeric) - conductor diameter
      - `sort_order` (integer) - display ordering
    - `ground_grid_results`
      - `id` (uuid, primary key)
      - `design_id` (uuid, FK to ground_grid_designs) - parent design
      - `placements` (jsonb) - array of placement objects
      - `segment_count` / `tee_count` / `cross_count` / `rod_count` (integer)
      - `total_conductor_length` (numeric, nullable)
      - `generated_at` (timestamptz)

  2. Security
    - Enable RLS on all four tables
    - Policies for user_id = 'Dustin' on designs, rods, conductors
    - Policies for design ownership on results

  3. Notes
    - Follows existing pattern: user_id text default 'Dustin', uuid PKs
    - ground_grid_designs.project_id mirrors tasks.project_id FK pattern
    - Cascade delete from designs to rods, conductors, and results
*/

-- ground_grid_designs
CREATE TABLE IF NOT EXISTS ground_grid_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id text NOT NULL DEFAULT 'Dustin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ground_grid_designs_status_check CHECK (status = ANY (ARRAY['draft'::text, 'finalized'::text, 'archived'::text]))
);

ALTER TABLE ground_grid_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own grid designs"
  ON ground_grid_designs FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id OR user_id = 'Dustin');

CREATE POLICY "Users can insert own grid designs"
  ON ground_grid_designs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id OR user_id = 'Dustin');

CREATE POLICY "Users can update own grid designs"
  ON ground_grid_designs FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id OR user_id = 'Dustin')
  WITH CHECK (auth.uid()::text = user_id OR user_id = 'Dustin');

CREATE POLICY "Users can delete own grid designs"
  ON ground_grid_designs FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id OR user_id = 'Dustin');

-- ground_grid_rods
CREATE TABLE IF NOT EXISTS ground_grid_rods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES ground_grid_designs(id) ON DELETE CASCADE,
  label text NOT NULL,
  grid_x numeric NOT NULL,
  grid_y numeric NOT NULL,
  depth numeric NOT NULL DEFAULT 20,
  diameter numeric NOT NULL DEFAULT 1.5,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE ground_grid_rods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rods for own designs"
  ON ground_grid_rods FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_rods.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ));

CREATE POLICY "Users can insert rods for own designs"
  ON ground_grid_rods FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_rods.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ));

CREATE POLICY "Users can update rods for own designs"
  ON ground_grid_rods FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_rods.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_rods.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ));

CREATE POLICY "Users can delete rods for own designs"
  ON ground_grid_rods FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_rods.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ));

-- ground_grid_conductors
CREATE TABLE IF NOT EXISTS ground_grid_conductors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES ground_grid_designs(id) ON DELETE CASCADE,
  label text NOT NULL,
  length numeric,
  x1 numeric NOT NULL,
  y1 numeric NOT NULL,
  x2 numeric NOT NULL,
  y2 numeric NOT NULL,
  diameter numeric NOT NULL DEFAULT 1.5,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE ground_grid_conductors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view conductors for own designs"
  ON ground_grid_conductors FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_conductors.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ));

CREATE POLICY "Users can insert conductors for own designs"
  ON ground_grid_conductors FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_conductors.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ));

CREATE POLICY "Users can update conductors for own designs"
  ON ground_grid_conductors FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_conductors.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_conductors.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ));

CREATE POLICY "Users can delete conductors for own designs"
  ON ground_grid_conductors FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_conductors.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ));

-- ground_grid_results
CREATE TABLE IF NOT EXISTS ground_grid_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES ground_grid_designs(id) ON DELETE CASCADE,
  placements jsonb NOT NULL DEFAULT '[]'::jsonb,
  segment_count integer NOT NULL DEFAULT 0,
  tee_count integer NOT NULL DEFAULT 0,
  cross_count integer NOT NULL DEFAULT 0,
  rod_count integer NOT NULL DEFAULT 0,
  total_conductor_length numeric,
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ground_grid_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view results for own designs"
  ON ground_grid_results FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_results.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ));

CREATE POLICY "Users can insert results for own designs"
  ON ground_grid_results FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_results.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ));

CREATE POLICY "Users can update results for own designs"
  ON ground_grid_results FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_results.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_results.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ));

CREATE POLICY "Users can delete results for own designs"
  ON ground_grid_results FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ground_grid_designs d
    WHERE d.id = ground_grid_results.design_id
    AND (auth.uid()::text = d.user_id OR d.user_id = 'Dustin')
  ));

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ground_grid_designs_project_id ON ground_grid_designs(project_id);
CREATE INDEX IF NOT EXISTS idx_ground_grid_designs_user_id ON ground_grid_designs(user_id);
CREATE INDEX IF NOT EXISTS idx_ground_grid_rods_design_id ON ground_grid_rods(design_id);
CREATE INDEX IF NOT EXISTS idx_ground_grid_conductors_design_id ON ground_grid_conductors(design_id);
CREATE INDEX IF NOT EXISTS idx_ground_grid_results_design_id ON ground_grid_results(design_id);
