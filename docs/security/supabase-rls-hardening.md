# Supabase RLS Hardening Runbook

This runbook applies row-level security hardening for user-owned records (projects, tasks, files, calendar events, activity logs, settings).

## Why this is required

Frontend filtering is not enough for security. Real isolation must be enforced by database policies.

## SQL Script

Use:

- `backend/supabase/rls_hardening.sql`
- `backend/supabase/storage_policies.sql`

Apply in Supabase SQL Editor (dev first, then production).

## What the script does

- Enables RLS for core user-owned tables.
- Creates `select/insert/update/delete` policies scoped to `auth.uid() = user_id`.
- Adds relationship checks for `calendar_events.project_id` and `calendar_events.task_id`.
- Adds `before insert` trigger to auto-fill `user_id` from auth when omitted.
- Adds user_id indexes to support scoped query performance.

## Validation checklist

After applying the script:

- [ ] User A creates project/task/event and can read/update/delete it.
- [ ] User B cannot read/update/delete User A records.
- [ ] Calendar route only shows current user events.
- [ ] Project manager only shows current user projects/tasks/files.
- [ ] Dashboard counts are based only on current user records.

## Storage note

Supabase handles DB auth + RLS well, but storage bucket hardening depends on your object key strategy.

Current app uploads to `project-files` with key format:

- `<user_id>/<project_id>/<timestamp>_<filename>`

Apply bucket policies from:

- `backend/supabase/storage_policies.sql`

For strongest storage security, preferred options are:

1. Use a server/edge function to generate signed upload URLs and validate project ownership before upload.
2. Or migrate object keys to include user id prefix and enforce storage policies by path.

## Backend requirement guidance

You do **not** need a traditional backend for core CRUD if RLS is configured correctly.

You **do** need backend/edge logic for:

- Secret-bearing integrations (private API keys, webhooks verification)
- Trusted automation jobs and cross-user admin actions
- Strict storage upload validation if path-only policies are insufficient
- Existing AutoCAD/coordinates Python API flows
