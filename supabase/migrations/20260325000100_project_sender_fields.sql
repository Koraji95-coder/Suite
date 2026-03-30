alter table if exists public.projects
	add column if not exists pe_name text not null default '',
	add column if not exists firm_number text not null default '';
