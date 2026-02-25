# Supabase Apply + Verify Runbook

This is the exact execution flow to apply database/storage hardening and verify isolation.

## 0) Prerequisites

- You are logged into the correct Supabase project.
- You have an admin role for SQL Editor.
- Application env points at the same Supabase project (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

## 1) Apply SQL scripts (in order)

Run in Supabase SQL Editor:

1. `backend/supabase/rls_hardening.sql`
2. `backend/supabase/storage_policies.sql`

## 2) Confirm RLS is enabled

Execute:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'projects',
    'tasks',
    'files',
    'activity_log',
    'calendar_events',
    'recent_files',
    'user_settings'
  )
order by tablename;
```

Expected: `rowsecurity = true` for all rows.

## 3) Confirm public table policies exist

Execute:

```sql
select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'projects',
    'tasks',
    'files',
    'activity_log',
    'calendar_events',
    'recent_files',
    'user_settings'
  )
order by tablename, cmd, policyname;
```

Expected: per table `select/insert/update/delete` policies scoped to `auth.uid() = user_id`.

## 4) Confirm storage policies exist

Execute:

```sql
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'project_files_%'
order by cmd, policyname;
```

Expected policies:

- `project_files_select_own`
- `project_files_insert_own`
- `project_files_update_own`
- `project_files_delete_own`

## 5) Confirm helper trigger coverage

Execute:

```sql
select event_object_table as table_name, trigger_name
from information_schema.triggers
where event_object_schema = 'public'
  and trigger_name like 'set_user_id_%'
order by table_name;
```

Expected triggers on:

- `projects`, `tasks`, `files`, `activity_log`, `calendar_events`, `recent_files`, `user_settings`

## 6) Functional verification matrix

Create two test users: `user_a`, `user_b`.

### A. Projects/tasks/events isolation

1. Log in as `user_a`.
2. Create project, task, and calendar event from app routes:
   - `/app/projects`
   - `/app/calendar`
3. Log out, log in as `user_b`.
4. Verify `user_b` cannot see `user_a` records in dashboard/projects/calendar.

### B. Storage isolation

1. Log in as `user_a` and upload a file from project manager.
2. In table `files`, verify `file_path` format is:
   - `<user_id>/<project_id>/<timestamp>_<filename>`
3. Log in as `user_b` and verify file is not listed and cannot be accessed.

### C. Update/delete isolation

1. As `user_b`, attempt update/delete on any known `user_a` IDs via SQL (as authenticated session simulation).
2. Expect operation denied by policy.

## 7) App-level smoke checks

- Login + logout
- Create/update/delete project and task
- Create/update/delete calendar event
- Upload/download project file
- Dashboard counts match user data only

## 8) Rollback strategy

If needed:

1. Revert app deployment to previous known-good revision.
2. Disable newly added storage policies temporarily (only in emergency, document reason).
3. Reapply SQL scripts in staging with test users and repeat verification matrix.

## 9) Production go-live gate

Proceed only when all checks in this file and `docs/development/public-rollout-readiness.md` are complete.
