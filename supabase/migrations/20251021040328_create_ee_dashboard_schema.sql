/*
  # Electrical Engineering Dashboard Schema

  1. New Tables
    - `formulas`
      - `id` (uuid, primary key)
      - `name` (text) - Formula name
      - `category` (text) - Category (e.g., "Ohm's Law", "Power", "Capacitance")
      - `formula` (text) - The actual formula
      - `description` (text) - Description of what it calculates
      - `variables` (jsonb) - Variable definitions
      - `created_at` (timestamptz)
    
    - `saved_calculations`
      - `id` (uuid, primary key)
      - `user_id` (uuid) - For future auth integration
      - `calculation_type` (text) - Type of calculation
      - `inputs` (jsonb) - Input values
      - `results` (jsonb) - Calculation results
      - `notes` (text) - User notes
      - `created_at` (timestamptz)
    
    - `saved_circuits`
      - `id` (uuid, primary key)
      - `user_id` (uuid) - For future auth integration
      - `name` (text) - Circuit name
      - `circuit_data` (jsonb) - Circuit component data
      - `image_url` (text) - Optional image URL
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add public read policies for formulas
    - Add policies for saved data (open for now, can be restricted later with auth)
*/

-- Create formulas table
CREATE TABLE IF NOT EXISTS formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  formula text NOT NULL,
  description text NOT NULL,
  variables jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create saved_calculations table
CREATE TABLE IF NOT EXISTS saved_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  calculation_type text NOT NULL,
  inputs jsonb DEFAULT '{}'::jsonb,
  results jsonb DEFAULT '{}'::jsonb,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Create saved_circuits table
CREATE TABLE IF NOT EXISTS saved_circuits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  circuit_data jsonb DEFAULT '{}'::jsonb,
  image_url text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_circuits ENABLE ROW LEVEL SECURITY;

-- Policies for formulas (public read)
CREATE POLICY "Anyone can read formulas"
  ON formulas FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert formulas"
  ON formulas FOR INSERT
  WITH CHECK (true);

-- Policies for saved_calculations (open for now)
CREATE POLICY "Anyone can read saved calculations"
  ON saved_calculations FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert saved calculations"
  ON saved_calculations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update saved calculations"
  ON saved_calculations FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete saved calculations"
  ON saved_calculations FOR DELETE
  USING (true);

-- Policies for saved_circuits (open for now)
CREATE POLICY "Anyone can read saved circuits"
  ON saved_circuits FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert saved circuits"
  ON saved_circuits FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update saved circuits"
  ON saved_circuits FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete saved circuits"
  ON saved_circuits FOR DELETE
  USING (true);

-- Insert default formulas
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