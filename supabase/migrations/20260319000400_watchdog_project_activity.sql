-- Shared Watchdog project attribution and drawing activity history.
-- Adds canonical project root mapping plus synced drawing work segments.

alter table if exists public.projects
	add column if not exists watchdog_root_path text null;

create table if not exists public.project_drawing_work_segments (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	project_id uuid not null references public.projects (id) on delete cascade,
	drawing_path text not null,
	drawing_name text not null default '',
	work_date date not null,
	segment_started_at timestamptz not null,
	segment_ended_at timestamptz not null,
	tracked_ms bigint not null default 0 check (tracked_ms >= 0),
	idle_ms bigint not null default 0 check (idle_ms >= 0),
	command_count integer not null default 0 check (command_count >= 0),
	workstation_id text not null default '',
	source_session_id text not null default '',
	sync_key text not null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	constraint project_drawing_work_segments_sync_key_key unique (sync_key)
);

create index if not exists idx_projects_watchdog_root_path
	on public.projects (watchdog_root_path)
	where watchdog_root_path is not null;

create index if not exists idx_project_drawing_work_segments_user_id
	on public.project_drawing_work_segments (user_id, work_date desc, segment_ended_at desc);

create index if not exists idx_project_drawing_work_segments_project_id
	on public.project_drawing_work_segments (project_id, work_date desc, segment_ended_at desc);

create index if not exists idx_project_drawing_work_segments_drawing_path
	on public.project_drawing_work_segments (project_id, drawing_path, work_date desc);

drop trigger if exists set_project_drawing_work_segments_updated_at on public.project_drawing_work_segments;
create trigger set_project_drawing_work_segments_updated_at
before update on public.project_drawing_work_segments
for each row execute function public.set_updated_at();

alter table if exists public.project_drawing_work_segments enable row level security;

drop trigger if exists set_user_id_project_drawing_work_segments on public.project_drawing_work_segments;
create trigger set_user_id_project_drawing_work_segments
before insert on public.project_drawing_work_segments
for each row execute function public.set_user_id_from_auth();

drop policy if exists project_drawing_work_segments_select_own on public.project_drawing_work_segments;
create policy project_drawing_work_segments_select_own on public.project_drawing_work_segments
for select to authenticated
using (user_id = auth.uid());

drop policy if exists project_drawing_work_segments_insert_own on public.project_drawing_work_segments;
create policy project_drawing_work_segments_insert_own on public.project_drawing_work_segments
for insert to authenticated
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists project_drawing_work_segments_update_own on public.project_drawing_work_segments;
create policy project_drawing_work_segments_update_own on public.project_drawing_work_segments
for update to authenticated
using (user_id = auth.uid())
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists project_drawing_work_segments_delete_own on public.project_drawing_work_segments;
create policy project_drawing_work_segments_delete_own on public.project_drawing_work_segments
for delete to authenticated
using (user_id = auth.uid());
