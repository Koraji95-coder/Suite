/*
  # Add Project Categories

  1. Changes
    - Add `category` column to `projects` table
    - Categories: 'Coding', 'Substation', 'QAQC', or null for uncategorized
    - No default value, allowing projects to be uncategorized

  2. Notes
    - Existing projects will have null category (uncategorized)
    - Frontend will display category with color designation
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'category'
  ) THEN
    ALTER TABLE projects ADD COLUMN category text;
  END IF;
END $$;
