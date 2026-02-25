-- Supabase RLS hardening for user-owned app data
-- Apply in Supabase SQL Editor (dev first, then production)

begin;

-- 1) Helper trigger: default user_id from auth context when omitted
create or replace function public.set_user_id_from_auth()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

-- 2) Enable RLS on core user-owned tables
alter table if exists public.projects enable row level security;
alter table if exists public.tasks enable row level security;
alter table if exists public.files enable row level security;
alter table if exists public.activity_log enable row level security;
alter table if exists public.calendar_events enable row level security;
alter table if exists public.recent_files enable row level security;
alter table if exists public.user_settings enable row level security;

-- 3) Keep policies idempotent
-- projects

drop policy if exists projects_select_own on public.projects;
drop policy if exists projects_insert_own on public.projects;
drop policy if exists projects_update_own on public.projects;
drop policy if exists projects_delete_own on public.projects;

create policy projects_select_own
on public.projects
for select
using (auth.uid() = user_id);

create policy projects_insert_own
on public.projects
for insert
to authenticated
with check (auth.uid() = coalesce(user_id, auth.uid()));

create policy projects_update_own
on public.projects
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy projects_delete_own
on public.projects
for delete
to authenticated
using (auth.uid() = user_id);

-- tasks

drop policy if exists tasks_select_own on public.tasks;
drop policy if exists tasks_insert_own on public.tasks;
drop policy if exists tasks_update_own on public.tasks;
drop policy if exists tasks_delete_own on public.tasks;

create policy tasks_select_own
on public.tasks
for select
using (auth.uid() = user_id);

create policy tasks_insert_own
on public.tasks
for insert
to authenticated
with check (
  auth.uid() = coalesce(user_id, auth.uid())
  and (
    project_id is null
    or exists (
      select 1
      from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  )
);

create policy tasks_update_own
on public.tasks
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (
    project_id is null
    or exists (
      select 1
      from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  )
);

create policy tasks_delete_own
on public.tasks
for delete
to authenticated
using (auth.uid() = user_id);

-- files

drop policy if exists files_select_own on public.files;
drop policy if exists files_insert_own on public.files;
drop policy if exists files_update_own on public.files;
drop policy if exists files_delete_own on public.files;

create policy files_select_own
on public.files
for select
using (auth.uid() = user_id);

create policy files_insert_own
on public.files
for insert
to authenticated
with check (
  auth.uid() = coalesce(user_id, auth.uid())
  and (
    project_id is null
    or exists (
      select 1
      from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  )
);

create policy files_update_own
on public.files
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy files_delete_own
on public.files
for delete
to authenticated
using (auth.uid() = user_id);

-- activity_log

drop policy if exists activity_log_select_own on public.activity_log;
drop policy if exists activity_log_insert_own on public.activity_log;
drop policy if exists activity_log_update_own on public.activity_log;
drop policy if exists activity_log_delete_own on public.activity_log;

create policy activity_log_select_own
on public.activity_log
for select
using (auth.uid() = user_id);

create policy activity_log_insert_own
on public.activity_log
for insert
to authenticated
with check (auth.uid() = coalesce(user_id, auth.uid()));

create policy activity_log_update_own
on public.activity_log
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy activity_log_delete_own
on public.activity_log
for delete
to authenticated
using (auth.uid() = user_id);

-- calendar_events

drop policy if exists calendar_events_select_own on public.calendar_events;
drop policy if exists calendar_events_insert_own on public.calendar_events;
drop policy if exists calendar_events_update_own on public.calendar_events;
drop policy if exists calendar_events_delete_own on public.calendar_events;

create policy calendar_events_select_own
on public.calendar_events
for select
using (auth.uid() = user_id);

create policy calendar_events_insert_own
on public.calendar_events
for insert
to authenticated
with check (
  auth.uid() = coalesce(user_id, auth.uid())
  and (
    project_id is null
    or exists (
      select 1
      from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  )
  and (
    task_id is null
    or exists (
      select 1
      from public.tasks t
      where t.id = task_id and t.user_id = auth.uid()
    )
  )
);

create policy calendar_events_update_own
on public.calendar_events
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (
    project_id is null
    or exists (
      select 1
      from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  )
  and (
    task_id is null
    or exists (
      select 1
      from public.tasks t
      where t.id = task_id and t.user_id = auth.uid()
    )
  )
);

create policy calendar_events_delete_own
on public.calendar_events
for delete
to authenticated
using (auth.uid() = user_id);

-- recent_files

drop policy if exists recent_files_select_own on public.recent_files;
drop policy if exists recent_files_insert_own on public.recent_files;
drop policy if exists recent_files_update_own on public.recent_files;
drop policy if exists recent_files_delete_own on public.recent_files;

create policy recent_files_select_own
on public.recent_files
for select
using (auth.uid() = user_id);

create policy recent_files_insert_own
on public.recent_files
for insert
to authenticated
with check (auth.uid() = coalesce(user_id, auth.uid()));

create policy recent_files_update_own
on public.recent_files
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy recent_files_delete_own
on public.recent_files
for delete
to authenticated
using (auth.uid() = user_id);

-- user_settings

drop policy if exists user_settings_select_own on public.user_settings;
drop policy if exists user_settings_insert_own on public.user_settings;
drop policy if exists user_settings_update_own on public.user_settings;
drop policy if exists user_settings_delete_own on public.user_settings;

create policy user_settings_select_own
on public.user_settings
for select
using (auth.uid() = user_id);

create policy user_settings_insert_own
on public.user_settings
for insert
to authenticated
with check (auth.uid() = coalesce(user_id, auth.uid()));

create policy user_settings_update_own
on public.user_settings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy user_settings_delete_own
on public.user_settings
for delete
to authenticated
using (auth.uid() = user_id);

-- 4) Triggers to auto-populate user_id (safe no-op if already set)
drop trigger if exists set_user_id_projects on public.projects;
create trigger set_user_id_projects
before insert on public.projects
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_tasks on public.tasks;
create trigger set_user_id_tasks
before insert on public.tasks
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_files on public.files;
create trigger set_user_id_files
before insert on public.files
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_activity_log on public.activity_log;
create trigger set_user_id_activity_log
before insert on public.activity_log
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_calendar_events on public.calendar_events;
create trigger set_user_id_calendar_events
before insert on public.calendar_events
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_recent_files on public.recent_files;
create trigger set_user_id_recent_files
before insert on public.recent_files
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_user_settings on public.user_settings;
create trigger set_user_id_user_settings
before insert on public.user_settings
for each row execute function public.set_user_id_from_auth();

-- 5) Optional performance indexes for scoped queries
create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_tasks_user_id on public.tasks(user_id);
create index if not exists idx_files_user_id on public.files(user_id);
create index if not exists idx_activity_log_user_id on public.activity_log(user_id);
create index if not exists idx_calendar_events_user_id on public.calendar_events(user_id);
create index if not exists idx_recent_files_user_id on public.recent_files(user_id);
create index if not exists idx_user_settings_user_id on public.user_settings(user_id);

commit;
