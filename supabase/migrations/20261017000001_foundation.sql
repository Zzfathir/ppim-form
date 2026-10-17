-- PPI Form — Phase 1 foundation: lookup tables, profiles, settings, activity log,
-- profile bootstrap on first sign-in, and onboarding.
-- Forms, questions, responses and templates are added in the Phase 2 migration.

create extension if not exists pgcrypto with schema extensions;

create type public.user_role   as enum ('respondent', 'admin', 'superadmin');
create type public.user_status as enum ('pending', 'active', 'suspended');

-- ---------------------------------------------------------------------------
-- Lookup tables (managed by superadmins)
-- ---------------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 120),
  description text,
  color text not null default '#6B7280' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.chapters (               -- campus / branch; separate from departments
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 120),
  description text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 120),
  sort int not null default 0,
  is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Profiles: one row per signed-in Google user, created by trigger on auth.users.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role public.user_role not null default 'respondent',
  status public.user_status not null default 'active',
  department_id uuid references public.departments(id),
  chapter_id uuid references public.chapters(id),      -- optional
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index on public.profiles (department_id);
create index on public.profiles (role, status);

create table public.app_settings (            -- single-row table
  id boolean primary key default true check (id),
  require_admin_approval boolean not null default true
);
insert into public.app_settings (id, require_admin_approval) values (true, true);

create table public.activity_log (            -- P1 UI, but entries are written from day one
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.activity_log (entity_type, entity_id);
create index on public.activity_log (created_at);

-- ---------------------------------------------------------------------------
-- Helpers used by RLS policies. SECURITY DEFINER so policies on `profiles`
-- can read the caller's own profile without recursing into RLS.
-- ---------------------------------------------------------------------------
create function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() $$;

create function public.is_superadmin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select role = 'superadmin' and status <> 'suspended' from public.profiles where id = auth.uid()),
    false)
$$;

-- Admin or superadmin, regardless of status (pending admins can still draft).
create function public.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select role in ('admin', 'superadmin') from public.profiles where id = auth.uid()),
    false)
$$;

create function public.current_department_id()
returns uuid
language sql stable security definer set search_path = ''
as $$ select department_id from public.profiles where id = auth.uid() $$;

-- Exposes only the approval flag, so onboarding can tell the user what happens next.
create function public.admin_approval_required()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select require_admin_approval from public.app_settings where id), true) $$;

-- Internal: append to the activity log from other SECURITY DEFINER functions.
create function public.log_activity(p_action text, p_entity_type text, p_entity_id uuid, p_meta jsonb default '{}')
returns void
language sql security definer set search_path = ''
as $$
  insert into public.activity_log (actor_id, action, entity_type, entity_id, meta)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_meta, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- Profile bootstrap: every new auth user becomes a `respondent`.
-- Superadmin bootstrap from SUPERADMIN_EMAILS happens in the app's auth
-- callback (the env var is not visible to the database).
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Onboarding: upgrades a respondent to admin (pending or active depending on
-- app_settings), or fills in the department of an existing admin/superadmin
-- that has none (e.g. a bootstrapped superadmin).
-- ---------------------------------------------------------------------------
create function public.complete_onboarding(p_full_name text, p_department_id uuid, p_chapter_id uuid default null)
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_name text := trim(coalesce(p_full_name, ''));
  v_status public.user_status;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if not exists (select 1 from public.departments where id = p_department_id and not is_archived) then
    raise exception 'invalid_department' using errcode = '22023';
  end if;
  if p_chapter_id is not null
     and not exists (select 1 from public.chapters where id = p_chapter_id and not is_archived) then
    raise exception 'invalid_chapter' using errcode = '22023';
  end if;

  if v_profile.role = 'respondent' then
    select case when require_admin_approval then 'pending' else 'active' end::public.user_status
      into v_status from public.app_settings where id;

    update public.profiles
       set role = 'admin', status = v_status, full_name = v_name,
           department_id = p_department_id, chapter_id = p_chapter_id
     where id = auth.uid()
     returning * into v_profile;

    perform public.log_activity('admin_requested', 'profile', auth.uid(),
      jsonb_build_object('status', v_status, 'department_id', p_department_id));
  elsif v_profile.department_id is null then
    update public.profiles
       set full_name = v_name, department_id = p_department_id, chapter_id = p_chapter_id
     where id = auth.uid()
     returning * into v_profile;
  else
    raise exception 'already_onboarded' using errcode = '22023';
  end if;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security. Anonymous clients get no direct table access: public
-- form endpoints go through server handlers using the service role.
-- ---------------------------------------------------------------------------
alter table public.departments  enable row level security;
alter table public.chapters     enable row level security;
alter table public.categories   enable row level security;
alter table public.profiles     enable row level security;
alter table public.app_settings enable row level security;
alter table public.activity_log enable row level security;

revoke all on public.departments, public.chapters, public.categories, public.profiles,
              public.app_settings, public.activity_log from anon;

-- Lookups: any signed-in user reads; superadmin writes.
create policy departments_read  on public.departments for select to authenticated using (true);
create policy departments_write on public.departments for all    to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create policy chapters_read  on public.chapters for select to authenticated using (true);
create policy chapters_write on public.chapters for all    to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create policy categories_read  on public.categories for select to authenticated using (true);
create policy categories_write on public.categories for all    to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Profiles: own row; superadmin all. No self-update policy: role/status/department
-- changes go through complete_onboarding() or superadmin actions only.
create policy profiles_read_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_superadmin());
create policy profiles_superadmin_update on public.profiles for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Admins see only names of people in their own department (not emails/roles).
create view public.department_members
with (security_barrier = true) as
select p.id, p.full_name, p.avatar_url, p.department_id
from public.profiles p
where p.role in ('admin', 'superadmin')
  and p.department_id is not null
  and (public.is_superadmin()
       or (public.is_staff() and p.department_id = public.current_department_id()));
revoke all on public.department_members from anon;
grant select on public.department_members to authenticated;

create policy app_settings_superadmin on public.app_settings for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Activity log: superadmins read; admins' own-form entries are added in Phase 2.
-- Inserts happen only through SECURITY DEFINER functions or the service role.
create policy activity_log_superadmin_read on public.activity_log for select to authenticated
  using (public.is_superadmin());

-- Function privileges: nothing callable by anon; internals not callable by clients.
revoke execute on function public.log_activity(text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.complete_onboarding(text, uuid, uuid) from public, anon;
grant  execute on function public.complete_onboarding(text, uuid, uuid) to authenticated;
revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.is_superadmin() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.current_department_id() from public, anon;
revoke execute on function public.admin_approval_required() from public, anon;
grant execute on function public.current_user_role(), public.is_superadmin(), public.is_staff(),
                          public.current_department_id(), public.admin_approval_required() to authenticated;
