-- Create public.profiles with RLS + owner-only policies and backfill from auth.users metadata.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  theme_preference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_profile_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "Profiles: read own" on public.profiles;
create policy "Profiles: read own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "Profiles: insert own" on public.profiles;
create policy "Profiles: insert own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "Profiles: update own" on public.profiles;
create policy "Profiles: update own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Profiles: delete own" on public.profiles;
create policy "Profiles: delete own"
on public.profiles
for delete
using (auth.uid() = id);

insert into public.profiles (id, email, display_name, avatar_url, theme_preference, created_at, updated_at)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data ->> 'display_name',
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name'
  ) as display_name,
  u.raw_user_meta_data ->> 'avatar_url' as avatar_url,
  u.raw_user_meta_data ->> 'theme_preference' as theme_preference,
  u.created_at,
  coalesce(u.updated_at, u.created_at, now())
from auth.users as u
on conflict (id) do nothing;
