-- PPI Form — Phase 2: templates, forms, questions, responses, stats, and the
-- authorization rules from build prompt §5. Business rules that must hold no
-- matter which client calls the API (publishing, status transitions, question
-- soft-delete, activity log) are enforced here with triggers.

create type public.form_status   as enum ('draft', 'open', 'closed', 'archived');
create type public.question_type as enum
  ('short_text', 'paragraph', 'single_choice', 'multiple_choice', 'dropdown', 'scale', 'date');

-- Random, URL-safe, 10-char share slug (never derived from the title).
create function public.generate_share_slug()
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(10);
  slug text := '';
begin
  for i in 0..9 loop
    slug := slug || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  category_id uuid references public.categories(id),
  questions jsonb not null default '[]' check (jsonb_typeof(questions) = 'array'),
  is_published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  department_id uuid references public.departments(id),
  category_id uuid references public.categories(id),
  chapter_id uuid references public.chapters(id),      -- optional, never required to publish
  template_id uuid references public.templates(id) on delete set null,
  title text not null default 'Untitled form' check (length(title) <= 300),
  description text check (length(description) <= 5000),
  internal_note text,                                  -- P1
  status public.form_status not null default 'draft',
  share_slug text not null unique default public.generate_share_slug(),
  requires_login boolean not null default false,
  limit_one_response boolean not null default true,    -- only meaningful if requires_login
  collect_name boolean not null default false,         -- only meaningful if NOT requires_login
  confirmation_message text check (length(confirmation_message) <= 2000),
  theme_color text not null default '#E8080A' check (theme_color ~ '^#[0-9A-Fa-f]{6}$'),
  closes_at timestamptz,                               -- P1
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                              -- soft delete
  constraint tracking_required_to_publish check
    (status = 'draft' or (department_id is not null and category_id is not null))
);
create index on public.forms (department_id);
create index on public.forms (chapter_id);
create index on public.forms (category_id);
create index on public.forms (owner_id);
create index on public.forms (status);
create index on public.forms (template_id);
create index on public.forms (created_at);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  position int not null,
  type public.question_type not null,
  title text not null default '' check (length(title) <= 1000),
  description text check (length(description) <= 2000),
  required boolean not null default false,
  options jsonb check (options is null or jsonb_typeof(options) = 'array'),  -- string[] for choice types
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  is_deleted boolean not null default false
);
create index on public.questions (form_id, position);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  respondent_id uuid references public.profiles(id) on delete set null,  -- null for anonymous
  respondent_email text,
  respondent_name text,
  dedupe_key uuid,                     -- = respondent_id when requires_login and limit_one_response
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),  -- { "<question_id>": "text" | ["a","b"] | 4 }
  submitted_at timestamptz not null default now()
);
create unique index one_response_per_person on public.responses (form_id, dedupe_key) where dedupe_key is not null;
create index on public.responses (form_id, submitted_at);
create index on public.responses (submitted_at);

-- Response counts are always derived from `responses` (never stored on forms).
create view public.form_stats with (security_invoker = true) as
select f.id as form_id,
       count(r.id)         as response_count,
       max(r.submitted_at) as last_response_at
from public.forms f left join public.responses r on r.form_id = f.id
group by f.id;

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER: evaluate against the real rows)
-- ---------------------------------------------------------------------------

-- The caller is a staff member who may create/edit (pending allowed, suspended not).
create function public.is_active_or_pending_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select role in ('admin', 'superadmin') and status <> 'suspended' from public.profiles where id = auth.uid()),
    false)
$$;

-- Read: superadmin; or the owner; or staff of the form's department. Soft-deleted
-- forms are visible to superadmins only (so they can be restored).
create function public.can_read_form(p_form_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_superadmin() or exists (
    select 1 from public.forms f
    where f.id = p_form_id
      and f.deleted_at is null
      and (f.owner_id = auth.uid()
           or (public.is_staff() and f.department_id is not null
               and f.department_id = public.current_department_id()))
  )
$$;

-- Edit: superadmin; or the (non-suspended) owner of a non-deleted form.
create function public.can_edit_form(p_form_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_superadmin() or (
    public.is_active_or_pending_staff() and exists (
      select 1 from public.forms f
      where f.id = p_form_id and f.deleted_at is null and f.owner_id = auth.uid()
    )
  )
$$;

-- Problems that block publishing, as stable codes the UI can translate.
create function public.publish_problems(p_form_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  with f as (
    select f.*, p.status as owner_status, p.role as owner_role
    from public.forms f join public.profiles p on p.id = f.owner_id
    where f.id = p_form_id
  ), q as (
    select * from public.questions where form_id = p_form_id and not is_deleted
  )
  select coalesce(array_agg(code order by ord), '{}') from (
    select 1 as ord, 'owner_not_active' as code from f
      where f.owner_status <> 'active' or f.owner_role not in ('admin', 'superadmin')
    union all
    select 2, 'department_required' from f where f.department_id is null
    union all
    select 3, 'category_required' from f where f.category_id is null
    union all
    select 4, 'no_questions' where not exists (select 1 from q)
    union all
    select 5, 'question_untitled' where exists (select 1 from q where length(trim(q.title)) = 0)
    union all
    select 6, 'choice_needs_options' where exists (
      select 1 from q
      where q.type in ('single_choice', 'multiple_choice', 'dropdown')
        and (select count(*) from jsonb_array_elements_text(coalesce(q.options, '[]'::jsonb)) o
             where length(trim(o)) > 0) < 2)
  ) problems
$$;

-- ---------------------------------------------------------------------------
-- Form rules (trigger): protected columns, status transitions, publishing.
-- Runs for every client, including the service role (auth.uid() is null).
-- ---------------------------------------------------------------------------
create function public.forms_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_problems text[];
  v_is_super boolean := public.is_superadmin();
  v_service boolean := auth.uid() is null;   -- service role / migrations
begin
  if tg_op = 'INSERT' then
    -- The service role (seed scripts) may insert historical rows; clients may not.
    if not v_service then
      if new.status <> 'draft' then
        raise exception 'new_forms_are_drafts' using errcode = '22023';
      end if;
      new.created_at := now();
      new.published_at := null;
      new.closed_at := null;
      new.deleted_at := null;
    end if;
  else
    -- Immutable / system-managed columns.
    new.id := old.id;
    new.share_slug := old.share_slug;
    new.created_at := old.created_at;
    if not v_service then
      new.published_at := old.published_at;
      new.closed_at := old.closed_at;
    end if;
    if new.owner_id <> old.owner_id and not (v_is_super or v_service) then
      raise exception 'only_superadmin_can_transfer' using errcode = '42501';
    end if;
    if old.deleted_at is not null and new.deleted_at is not null and not (v_is_super or v_service) then
      raise exception 'form_deleted' using errcode = '42501';
    end if;
    if new.deleted_at is null and old.deleted_at is not null and not (v_is_super or v_service) then
      raise exception 'only_superadmin_can_restore' using errcode = '42501';
    end if;

    if new.status <> old.status then
      if not (
        (old.status = 'draft'    and new.status = 'open') or
        (old.status = 'open'     and new.status = 'closed') or
        (old.status = 'closed'   and new.status = 'open') or
        (old.status = 'closed'   and new.status = 'archived') or
        (old.status = 'archived' and new.status = 'closed')
      ) then
        raise exception 'invalid_status_transition' using errcode = '22023',
          detail = format('%s -> %s', old.status, new.status);
      end if;
      if new.status = 'closed' then new.closed_at := now(); end if;
    end if;
    new.updated_at := now();
  end if;

  -- Publishing (or reopening) requires an active owner and a complete form.
  if new.status = 'open' and (tg_op = 'INSERT' or old.status <> 'open') then
    -- The caller must be active too (pending/suspended staff cannot publish).
    if not v_service and not exists (
      select 1 from public.profiles where id = auth.uid() and status = 'active' and role in ('admin', 'superadmin')
    ) then
      raise exception 'publish_requires_active_account' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' then
      -- Question checks come from publish_problems(); row-level checks use the row
      -- as it will be after this update (department, category, owner may change too).
      v_problems := array(
        select p from unnest(public.publish_problems(new.id)) p
        where p not in ('owner_not_active', 'department_required', 'category_required')
      );
      if not exists (select 1 from public.profiles
                     where id = new.owner_id and status = 'active' and role in ('admin', 'superadmin')) then
        v_problems := array_prepend('owner_not_active', v_problems);
      end if;
      if new.department_id is null then v_problems := array_append(v_problems, 'department_required'); end if;
      if new.category_id is null then v_problems := array_append(v_problems, 'category_required'); end if;
      if cardinality(v_problems) > 0 then
        raise exception 'publish_blocked' using errcode = '22023', detail = array_to_string(v_problems, ',');
      end if;
    end if;
    if new.published_at is null then
      new.published_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger forms_before_write
  before insert or update on public.forms
  for each row execute function public.forms_before_write();

-- Activity log for form lifecycle events.
create function public.forms_after_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('form_created', 'form', new.id,
      jsonb_build_object('department_id', new.department_id, 'template_id', new.template_id));
    return new;
  end if;

  if new.status <> old.status then
    perform public.log_activity(
      case
        when new.status = 'open' and old.status = 'draft' then 'form_published'
        when new.status = 'open' then 'form_reopened'
        when new.status = 'closed' and old.status = 'archived' then 'form_restored'
        when new.status = 'closed' then 'form_closed'
        when new.status = 'archived' then 'form_archived'
        else 'form_status_changed'
      end,
      'form', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.owner_id <> old.owner_id then
    perform public.log_activity('form_transferred', 'form', new.id,
      jsonb_build_object('from', old.owner_id, 'to', new.owner_id));
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    perform public.log_activity('form_deleted', 'form', new.id, '{}');
  elsif new.deleted_at is null and old.deleted_at is not null then
    perform public.log_activity('form_undeleted', 'form', new.id, '{}');
  end if;
  if new.department_id is distinct from old.department_id or new.category_id is distinct from old.category_id then
    perform public.log_activity('form_retagged', 'form', new.id, jsonb_build_object(
      'department_from', old.department_id, 'department_to', new.department_id,
      'category_from', old.category_id, 'category_to', new.category_id));
  end if;
  return new;
end;
$$;

create trigger forms_after_write
  after insert or update on public.forms
  for each row execute function public.forms_after_write();

-- Keep updated_at fresh when questions change (autosave indicator, "last edited").
create function public.questions_touch_form()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.forms set updated_at = now()
  where id = coalesce(new.form_id, old.form_id) and updated_at < now() - interval '1 second';
  return null;
end;
$$;

-- Deleting a question that already has answers becomes a soft delete, so old
-- responses keep their meaning. Cascades from a deleted form pass through.
create function public.questions_before_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.forms where id = old.form_id)
     and exists (select 1 from public.responses r where r.form_id = old.form_id and r.answers ? old.id::text) then
    update public.questions set is_deleted = true where id = old.id;
    return null;
  end if;
  return old;
end;
$$;

create trigger questions_before_delete
  before delete on public.questions
  for each row execute function public.questions_before_delete();

-- Questions cannot move between forms, and an answered question cannot change type.
create function public.questions_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.form_id <> old.form_id then
    raise exception 'question_form_immutable' using errcode = '22023';
  end if;
  new.id := old.id;
  if new.type <> old.type and exists (
    select 1 from public.responses r where r.form_id = old.form_id and r.answers ? old.id::text
  ) then
    raise exception 'answered_question_type_locked' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger questions_before_update
  before update on public.questions
  for each row execute function public.questions_before_update();

create trigger questions_touch_form
  after insert or update or delete on public.questions
  for each row execute function public.questions_touch_form();

-- Profile changes made by someone else (approvals, suspensions, promotions) are logged.
create function public.profiles_after_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_action text;
begin
  if auth.uid() is null or auth.uid() = new.id then
    return new;   -- self-service (onboarding logs itself) or service role (logs explicitly)
  end if;
  if new.role <> old.role then
    v_action := case
      when new.role = 'superadmin' then 'superadmin_promoted'
      when old.role = 'superadmin' then 'superadmin_demoted'
      when new.role = 'respondent' then 'admin_rejected'
      else 'role_changed' end;
    perform public.log_activity(v_action, 'profile', new.id, jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if new.status <> old.status then
    v_action := case
      when old.status = 'pending' and new.status = 'active' then 'admin_approved'
      when new.status = 'suspended' then 'admin_suspended'
      when old.status = 'suspended' and new.status = 'active' then 'admin_restored'
      else 'status_changed' end;
    perform public.log_activity(v_action, 'profile', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.department_id is distinct from old.department_id then
    perform public.log_activity('admin_department_changed', 'profile', new.id,
      jsonb_build_object('from', old.department_id, 'to', new.department_id));
  end if;
  return new;
end;
$$;

create trigger profiles_after_update
  after update on public.profiles
  for each row execute function public.profiles_after_update();

-- ---------------------------------------------------------------------------
-- Duplicate a form the caller can read into a new draft owned by the caller.
-- Department and chapter are pre-filled from the caller's profile.
-- ---------------------------------------------------------------------------
create function public.duplicate_form(p_form_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_src public.forms;
  v_me public.profiles;
  v_new_id uuid;
begin
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.id is null or v_me.role not in ('admin', 'superadmin') or v_me.status = 'suspended' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not public.can_read_form(p_form_id) then
    raise exception 'form_not_found' using errcode = 'P0002';
  end if;
  select * into v_src from public.forms where id = p_form_id;

  insert into public.forms (owner_id, department_id, category_id, chapter_id, template_id, title, description,
                            requires_login, limit_one_response, collect_name, confirmation_message, theme_color)
  values (v_me.id, coalesce(v_me.department_id, v_src.department_id), v_src.category_id, v_me.chapter_id,
          v_src.template_id, left('Copy of ' || v_src.title, 300), v_src.description,
          v_src.requires_login, v_src.limit_one_response, v_src.collect_name, v_src.confirmation_message,
          v_src.theme_color)
  returning id into v_new_id;

  insert into public.questions (form_id, position, type, title, description, required, options, settings)
  select v_new_id, row_number() over (order by position) - 1, type, title, description, required, options, settings
  from public.questions where form_id = p_form_id and not is_deleted;

  perform public.log_activity('form_duplicated', 'form', v_new_id, jsonb_build_object('source_form_id', p_form_id));
  return v_new_id;
end;
$$;

-- Soft delete. An RPC because the deleted row is no longer visible to its owner,
-- which a plain UPDATE through RLS does not allow.
create function public.soft_delete_form(p_form_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_edit_form(p_form_id) then
    raise exception 'form_not_found' using errcode = 'P0002';
  end if;
  update public.forms set deleted_at = now() where id = p_form_id and deleted_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.templates enable row level security;
alter table public.forms     enable row level security;
alter table public.questions enable row level security;
alter table public.responses enable row level security;

revoke all on public.templates, public.forms, public.questions, public.responses, public.form_stats from anon;
grant select on public.form_stats to authenticated;

-- Templates: published ones are readable by any signed-in user; superadmins manage all.
create policy templates_read on public.templates for select to authenticated
  using (is_published or public.is_superadmin());
create policy templates_write on public.templates for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Forms
create policy forms_read on public.forms for select to authenticated
  using (public.is_superadmin()
         or (deleted_at is null
             and (owner_id = auth.uid()
                  or (public.is_staff() and department_id is not null
                      and department_id = public.current_department_id()))));
create policy forms_insert on public.forms for insert to authenticated
  with check (owner_id = auth.uid() and public.is_active_or_pending_staff());
create policy forms_update on public.forms for update to authenticated
  using (public.is_superadmin()
         or (owner_id = auth.uid() and deleted_at is null and public.is_active_or_pending_staff()))
  with check (public.is_superadmin() or owner_id = auth.uid());
-- No DELETE policy: forms are soft-deleted (deleted_at) only.

-- Questions follow their form.
create policy questions_read on public.questions for select to authenticated
  using (public.can_read_form(form_id));
create policy questions_insert on public.questions for insert to authenticated
  with check (public.can_edit_form(form_id));
create policy questions_update on public.questions for update to authenticated
  using (public.can_edit_form(form_id)) with check (public.can_edit_form(form_id));
create policy questions_delete on public.questions for delete to authenticated
  using (public.can_edit_form(form_id));

-- Responses: readable by whoever can read the form; deletable by owner/superadmin.
-- Inserts happen only through the public submit handler (service role).
create policy responses_read on public.responses for select to authenticated
  using (public.can_read_form(form_id));
create policy responses_delete on public.responses for delete to authenticated
  using (public.can_edit_form(form_id));

-- Admins can read the activity of forms they can read.
create policy activity_log_form_read on public.activity_log for select to authenticated
  using (entity_type = 'form' and entity_id is not null and public.can_read_form(entity_id));

-- Function privileges
-- The slug column default runs as the inserting user.
revoke execute on function public.generate_share_slug() from public, anon;
grant execute on function public.generate_share_slug() to authenticated;
revoke execute on function public.forms_before_write() from public, anon, authenticated;
revoke execute on function public.forms_after_write() from public, anon, authenticated;
revoke execute on function public.questions_touch_form() from public, anon, authenticated;
revoke execute on function public.questions_before_delete() from public, anon, authenticated;
revoke execute on function public.questions_before_update() from public, anon, authenticated;
revoke execute on function public.profiles_after_update() from public, anon, authenticated;
revoke execute on function public.is_active_or_pending_staff() from public, anon;
revoke execute on function public.can_read_form(uuid) from public, anon;
revoke execute on function public.can_edit_form(uuid) from public, anon;
revoke execute on function public.publish_problems(uuid) from public, anon;
revoke execute on function public.duplicate_form(uuid) from public, anon;
revoke execute on function public.soft_delete_form(uuid) from public, anon;
grant execute on function public.soft_delete_form(uuid) to authenticated;
grant execute on function public.is_active_or_pending_staff(), public.can_read_form(uuid),
                          public.can_edit_form(uuid), public.duplicate_form(uuid) to authenticated;
-- publish_problems is called through publish_check() so callers can only check forms they can read.
create function public.publish_check(p_form_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$ select case when public.can_read_form(p_form_id) then public.publish_problems(p_form_id) end $$;
revoke execute on function public.publish_check(uuid) from public, anon;
grant execute on function public.publish_check(uuid) to authenticated;
