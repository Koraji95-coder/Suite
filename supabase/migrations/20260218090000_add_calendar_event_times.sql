/*
  # Add calendar event time fields

  - Adds start/end timestamps and metadata columns to calendar_events
  - Backfills time fields from due_date for existing rows
*/

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz,
  ADD COLUMN IF NOT EXISTS all_day boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS location text DEFAULT '',
  ADD COLUMN IF NOT EXISTS color text;

UPDATE calendar_events
SET
  start_at = COALESCE(start_at, due_date::timestamptz),
  end_at = COALESCE(end_at, (due_date::timestamptz + interval '1 day') - interval '1 second'),
  all_day = COALESCE(all_day, true)
WHERE start_at IS NULL OR end_at IS NULL;
