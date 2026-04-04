-- Legacy/operator fallback copy of Suite row-level security hardening.
-- Primary local-dev source of truth lives in supabase/migrations/.
-- Hosted SQL Editor fallback: run after supabase/consolidated_migration.sql.

-- ============================================================================
-- Helper functions
-- ============================================================================
create or replace function public.project_belongs_to_auth_user(p_project_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
	select
		p_project_id is null
		or exists (
			select 1
			from public.projects p
			where p.id = p_project_id
			  and p.user_id = auth.uid()
		);
$$;

create or replace function public.task_belongs_to_auth_user(p_task_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
	select
		p_task_id is null
		or exists (
			select 1
			from public.tasks t
			where t.id = p_task_id
			  and t.user_id = auth.uid()
		);
$$;

create or replace function public.set_user_id_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if new.user_id is null then
		new.user_id := auth.uid();
	end if;
	return new;
end;
$$;

-- ============================================================================
-- Enable RLS
-- ============================================================================
alter table if exists public.profiles enable row level security;
alter table if exists public.projects enable row level security;
alter table if exists public.tasks enable row level security;
alter table if exists public.files enable row level security;
alter table if exists public.activity_log enable row level security;
alter table if exists public.calendar_events enable row level security;
alter table if exists public.recent_files enable row level security;
alter table if exists public.user_settings enable row level security;
alter table if exists public.project_drawing_work_segments enable row level security;
alter table if exists public.user_preferences enable row level security;
alter table if exists public.user_passkeys enable row level security;
alter table if exists public.formulas enable row level security;
alter table if exists public.saved_calculations enable row level security;
alter table if exists public.saved_circuits enable row level security;
alter table if exists public.whiteboards enable row level security;
alter table if exists public.block_library enable row level security;
alter table if exists public.automation_workflows enable row level security;
alter table if exists public.drawing_annotations enable row level security;

-- ============================================================================
-- Auto user_id triggers
-- ============================================================================
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

drop trigger if exists set_user_id_project_drawing_work_segments on public.project_drawing_work_segments;
create trigger set_user_id_project_drawing_work_segments
before insert on public.project_drawing_work_segments
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_user_preferences on public.user_preferences;
create trigger set_user_id_user_preferences
before insert on public.user_preferences
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_user_passkeys on public.user_passkeys;
create trigger set_user_id_user_passkeys
before insert on public.user_passkeys
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_formulas on public.formulas;
create trigger set_user_id_formulas
before insert on public.formulas
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_saved_calculations on public.saved_calculations;
create trigger set_user_id_saved_calculations
before insert on public.saved_calculations
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_saved_circuits on public.saved_circuits;
create trigger set_user_id_saved_circuits
before insert on public.saved_circuits
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_whiteboards on public.whiteboards;
create trigger set_user_id_whiteboards
before insert on public.whiteboards
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_block_library on public.block_library;
create trigger set_user_id_block_library
before insert on public.block_library
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_automation_workflows on public.automation_workflows;
create trigger set_user_id_automation_workflows
before insert on public.automation_workflows
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_drawing_annotations on public.drawing_annotations;
create trigger set_user_id_drawing_annotations
before insert on public.drawing_annotations
for each row execute function public.set_user_id_from_auth();

-- ============================================================================
-- Policies: profiles
-- ============================================================================
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
for delete to authenticated
using (id = auth.uid());

-- ============================================================================
-- Policies: common user_id tables
-- ============================================================================
drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects
for select to authenticated
using (user_id = auth.uid());

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own on public.projects
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own on public.tasks
for select to authenticated
using (user_id = auth.uid());

drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own on public.tasks
for insert to authenticated
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own on public.tasks
for update to authenticated
using (user_id = auth.uid())
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own on public.tasks
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists files_select_own on public.files;
create policy files_select_own on public.files
for select to authenticated
using (user_id = auth.uid());

drop policy if exists files_insert_own on public.files;
create policy files_insert_own on public.files
for insert to authenticated
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists files_update_own on public.files;
create policy files_update_own on public.files
for update to authenticated
using (user_id = auth.uid())
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists files_delete_own on public.files;
create policy files_delete_own on public.files
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists activity_log_select_own on public.activity_log;
create policy activity_log_select_own on public.activity_log
for select to authenticated
using (user_id = auth.uid());

drop policy if exists activity_log_insert_own on public.activity_log;
create policy activity_log_insert_own on public.activity_log
for insert to authenticated
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
	and public.task_belongs_to_auth_user(task_id)
);

drop policy if exists activity_log_update_own on public.activity_log;
create policy activity_log_update_own on public.activity_log
for update to authenticated
using (user_id = auth.uid())
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
	and public.task_belongs_to_auth_user(task_id)
);

drop policy if exists activity_log_delete_own on public.activity_log;
create policy activity_log_delete_own on public.activity_log
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists calendar_events_select_own on public.calendar_events;
create policy calendar_events_select_own on public.calendar_events
for select to authenticated
using (user_id = auth.uid());

drop policy if exists calendar_events_insert_own on public.calendar_events;
create policy calendar_events_insert_own on public.calendar_events
for insert to authenticated
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
	and public.task_belongs_to_auth_user(task_id)
);

drop policy if exists calendar_events_update_own on public.calendar_events;
create policy calendar_events_update_own on public.calendar_events
for update to authenticated
using (user_id = auth.uid())
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
	and public.task_belongs_to_auth_user(task_id)
);

drop policy if exists calendar_events_delete_own on public.calendar_events;
create policy calendar_events_delete_own on public.calendar_events
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists recent_files_select_own on public.recent_files;
create policy recent_files_select_own on public.recent_files
for select to authenticated
using (user_id = auth.uid());

drop policy if exists recent_files_insert_own on public.recent_files;
create policy recent_files_insert_own on public.recent_files
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists recent_files_update_own on public.recent_files;
create policy recent_files_update_own on public.recent_files
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists recent_files_delete_own on public.recent_files;
create policy recent_files_delete_own on public.recent_files
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists user_settings_select_own on public.user_settings;
create policy user_settings_select_own on public.user_settings
for select to authenticated
using (user_id = auth.uid());

drop policy if exists user_settings_insert_own on public.user_settings;
create policy user_settings_insert_own on public.user_settings
for insert to authenticated
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_update_own on public.user_settings
for update to authenticated
using (user_id = auth.uid())
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists user_settings_delete_own on public.user_settings;
create policy user_settings_delete_own on public.user_settings
for delete to authenticated
using (user_id = auth.uid());

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

drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own on public.user_preferences
for select to authenticated
using (user_id = auth.uid());

drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own on public.user_preferences
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own on public.user_preferences
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_preferences_delete_own on public.user_preferences;
create policy user_preferences_delete_own on public.user_preferences
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists user_passkeys_select_own on public.user_passkeys;
create policy user_passkeys_select_own on public.user_passkeys
for select to authenticated
using (user_id = auth.uid());

drop policy if exists user_passkeys_insert_own on public.user_passkeys;
create policy user_passkeys_insert_own on public.user_passkeys
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists user_passkeys_update_own on public.user_passkeys;
create policy user_passkeys_update_own on public.user_passkeys
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_passkeys_delete_own on public.user_passkeys;
create policy user_passkeys_delete_own on public.user_passkeys
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists formulas_select_own on public.formulas;
create policy formulas_select_own on public.formulas
for select to authenticated
using (user_id = auth.uid());

drop policy if exists formulas_insert_own on public.formulas;
create policy formulas_insert_own on public.formulas
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists formulas_update_own on public.formulas;
create policy formulas_update_own on public.formulas
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists formulas_delete_own on public.formulas;
create policy formulas_delete_own on public.formulas
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists saved_calculations_select_own on public.saved_calculations;
create policy saved_calculations_select_own on public.saved_calculations
for select to authenticated
using (user_id = auth.uid());

drop policy if exists saved_calculations_insert_own on public.saved_calculations;
create policy saved_calculations_insert_own on public.saved_calculations
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists saved_calculations_update_own on public.saved_calculations;
create policy saved_calculations_update_own on public.saved_calculations
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists saved_calculations_delete_own on public.saved_calculations;
create policy saved_calculations_delete_own on public.saved_calculations
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists saved_circuits_select_own on public.saved_circuits;
create policy saved_circuits_select_own on public.saved_circuits
for select to authenticated
using (user_id = auth.uid());

drop policy if exists saved_circuits_insert_own on public.saved_circuits;
create policy saved_circuits_insert_own on public.saved_circuits
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists saved_circuits_update_own on public.saved_circuits;
create policy saved_circuits_update_own on public.saved_circuits
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists saved_circuits_delete_own on public.saved_circuits;
create policy saved_circuits_delete_own on public.saved_circuits
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists whiteboards_select_own on public.whiteboards;
create policy whiteboards_select_own on public.whiteboards
for select to authenticated
using (user_id = auth.uid());

drop policy if exists whiteboards_insert_own on public.whiteboards;
create policy whiteboards_insert_own on public.whiteboards
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists whiteboards_update_own on public.whiteboards;
create policy whiteboards_update_own on public.whiteboards
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists whiteboards_delete_own on public.whiteboards;
create policy whiteboards_delete_own on public.whiteboards
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists block_library_select_own on public.block_library;
create policy block_library_select_own on public.block_library
for select to authenticated
using (user_id = auth.uid());

drop policy if exists block_library_insert_own on public.block_library;
create policy block_library_insert_own on public.block_library
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists block_library_update_own on public.block_library;
create policy block_library_update_own on public.block_library
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists block_library_delete_own on public.block_library;
create policy block_library_delete_own on public.block_library
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists automation_workflows_select_own on public.automation_workflows;
create policy automation_workflows_select_own on public.automation_workflows
for select to authenticated
using (user_id = auth.uid());

drop policy if exists automation_workflows_insert_own on public.automation_workflows;
create policy automation_workflows_insert_own on public.automation_workflows
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists automation_workflows_update_own on public.automation_workflows;
create policy automation_workflows_update_own on public.automation_workflows
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists automation_workflows_delete_own on public.automation_workflows;
create policy automation_workflows_delete_own on public.automation_workflows
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists drawing_annotations_select_own on public.drawing_annotations;
create policy drawing_annotations_select_own on public.drawing_annotations
for select to authenticated
using (user_id = auth.uid());

drop policy if exists drawing_annotations_insert_own on public.drawing_annotations;
create policy drawing_annotations_insert_own on public.drawing_annotations
for insert to authenticated
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists drawing_annotations_update_own on public.drawing_annotations;
create policy drawing_annotations_update_own on public.drawing_annotations
for update to authenticated
using (user_id = auth.uid())
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists drawing_annotations_delete_own on public.drawing_annotations;
create policy drawing_annotations_delete_own on public.drawing_annotations
for delete to authenticated
using (user_id = auth.uid());
