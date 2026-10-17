-- PPIM Form — owner revision round:
--   * forms: banner image (+ style) and "name is required"
--   * Storage bucket for banners
--   * templates: any admin can create; visible to own department; shareable with
--     people and departments; official (secretariat) templates visible to all

-- ---------------------------------------------------------------------------
-- Forms
-- ---------------------------------------------------------------------------
alter table public.forms
  add column banner_path text
    check (banner_path is null or banner_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
  add column banner_style text not null default 'edge'
    check (banner_style in ('edge', 'inset', 'overlay')),
  add column name_required boolean not null default false;

-- Autosave now also carries banner_path, banner_style and name_required.
-- A newly set banner must live in this form's own storage folder; a duplicate
-- may keep pointing at its source form's banner.
create or replace function public.save_form(p_form_id uuid, p_form jsonb, p_questions jsonb)
returns timestamptz
language plpgsql security invoker set search_path = ''
as $$
declare
  v_updated_at timestamptz;
  v_banner text := nullif(p_form ->> 'banner_path', '');
  v_current_banner text;
begin
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'invalid_questions' using errcode = '22023';
  end if;

  select banner_path into v_current_banner from public.forms where id = p_form_id;
  if v_banner is not null and v_banner is distinct from v_current_banner
     and split_part(v_banner, '/', 1) <> p_form_id::text then
    raise exception 'invalid_banner' using errcode = '22023';
  end if;

  update public.forms set
    title                = coalesce(p_form ->> 'title', title),
    description          = p_form ->> 'description',
    department_id        = (p_form ->> 'department_id')::uuid,
    category_id          = (p_form ->> 'category_id')::uuid,
    chapter_id           = (p_form ->> 'chapter_id')::uuid,
    requires_login       = coalesce((p_form ->> 'requires_login')::boolean, requires_login),
    limit_one_response   = coalesce((p_form ->> 'limit_one_response')::boolean, limit_one_response),
    collect_name         = coalesce((p_form ->> 'collect_name')::boolean, collect_name),
    name_required        = coalesce((p_form ->> 'name_required')::boolean, name_required),
    confirmation_message = p_form ->> 'confirmation_message',
    banner_path          = v_banner,
    banner_style         = coalesce(p_form ->> 'banner_style', banner_style)
  where id = p_form_id
  returning updated_at into v_updated_at;
  if not found then
    raise exception 'form_not_found' using errcode = 'P0002';
  end if;

  delete from public.questions
  where form_id = p_form_id
    and not is_deleted
    and id not in (select (q ->> 'id')::uuid from jsonb_array_elements(p_questions) q);

  insert into public.questions (id, form_id, position, type, title, description, required, options, settings, is_deleted)
  select (q ->> 'id')::uuid,
         p_form_id,
         (ord - 1)::int,
         (q ->> 'type')::public.question_type,
         coalesce(q ->> 'title', ''),
         nullif(q ->> 'description', ''),
         coalesce((q ->> 'required')::boolean, false),
         case when jsonb_typeof(q -> 'options') = 'array' then q -> 'options' end,
         coalesce(case when jsonb_typeof(q -> 'settings') = 'object' then q -> 'settings' end, '{}'::jsonb),
         false
  from jsonb_array_elements(p_questions) with ordinality as t(q, ord)
  on conflict (id) do update set
    position    = excluded.position,
    type        = excluded.type,
    title       = excluded.title,
    description = excluded.description,
    required    = excluded.required,
    options     = excluded.options,
    settings    = excluded.settings,
    is_deleted  = false
  where public.questions.form_id = excluded.form_id;

  return v_updated_at;
end;
$$;

-- Duplicates keep the banner and the name settings.
create or replace function public.duplicate_form(p_form_id uuid)
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
                            requires_login, limit_one_response, collect_name, name_required, confirmation_message,
                            theme_color, banner_path, banner_style)
  values (v_me.id, coalesce(v_me.department_id, v_src.department_id), v_src.category_id, v_me.chapter_id,
          v_src.template_id, left('Copy of ' || v_src.title, 300), v_src.description,
          v_src.requires_login, v_src.limit_one_response, v_src.collect_name, v_src.name_required,
          v_src.confirmation_message, v_src.theme_color, v_src.banner_path, v_src.banner_style)
  returning id into v_new_id;

  insert into public.questions (form_id, position, type, title, description, required, options, settings)
  select v_new_id, row_number() over (order by position) - 1, type, title, description, required, options, settings
  from public.questions where form_id = p_form_id and not is_deleted;

  perform public.log_activity('form_duplicated', 'form', v_new_id, jsonb_build_object('source_form_id', p_form_id));
  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Banner storage: public read (respondents are anonymous), upload only into
-- the folder of a form the caller can edit. Files are never overwritten.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-banners', 'form-banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy form_banners_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'form-banners'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.can_edit_form(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------
-- Templates: ownership, department visibility, sharing, official templates.
-- ---------------------------------------------------------------------------
alter table public.templates
  add column department_id uuid references public.departments(id),
  add column is_official boolean not null default false,
  add column updated_at timestamptz not null default now();
create index on public.templates (department_id);
create index on public.templates (created_by);

-- Everything that existed before this revision came from the secretariat.
update public.templates set is_official = true;

create table public.template_shares (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint share_has_one_target check ((profile_id is null) <> (department_id is null))
);
create unique index template_shares_person on public.template_shares (template_id, profile_id) where profile_id is not null;
create unique index template_shares_department on public.template_shares (template_id, department_id) where department_id is not null;
create index on public.template_shares (profile_id);
create index on public.template_shares (department_id);

-- View: superadmins all; staff see published official templates, their own,
-- their department's, and anything shared with them or their department.
create function public.can_view_template(p_template_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_superadmin() or (
    public.is_staff() and exists (
      select 1 from public.templates t
      where t.id = p_template_id
        and ((t.is_official and t.is_published)
             or t.created_by = auth.uid()
             or (t.department_id is not null and t.department_id = public.current_department_id())
             or exists (select 1 from public.template_shares s
                        where s.template_id = t.id
                          and (s.profile_id = auth.uid()
                               or (s.department_id is not null and s.department_id = public.current_department_id()))))
    )
  )
$$;

-- Edit (and share/delete): superadmins any; otherwise only the creator of a non-official template.
create function public.can_edit_template(p_template_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_superadmin() or (
    public.is_active_or_pending_staff() and exists (
      select 1 from public.templates t
      where t.id = p_template_id and t.created_by = auth.uid() and not t.is_official
    )
  )
$$;

-- Ownership fields are set by the database for non-superadmins.
create function public.templates_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_superadmin() then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
      new.department_id := public.current_department_id();
      new.is_official := false;
      new.is_published := true;
    else
      new.created_by := old.created_by;
      new.department_id := old.department_id;
      new.is_official := old.is_official;
      new.is_published := old.is_published;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger templates_before_write
  before insert or update on public.templates
  for each row execute function public.templates_before_write();

drop policy templates_read on public.templates;
drop policy templates_write on public.templates;

create policy templates_select on public.templates for select to authenticated
  using (public.can_view_template(id));
create policy templates_insert on public.templates for insert to authenticated
  with check (public.is_superadmin() or public.is_active_or_pending_staff());
create policy templates_update on public.templates for update to authenticated
  using (public.can_edit_template(id)) with check (true);
create policy templates_delete on public.templates for delete to authenticated
  using (public.can_edit_template(id));

alter table public.template_shares enable row level security;
revoke all on public.template_shares from anon;

create policy template_shares_select on public.template_shares for select to authenticated
  using (public.can_edit_template(template_id));
create policy template_shares_insert on public.template_shares for insert to authenticated
  with check (
    public.can_edit_template(template_id)
    and created_by = auth.uid()
    and (profile_id is null or exists (select 1 from public.profiles p
                                       where p.id = profile_id and p.role in ('admin', 'superadmin')))
  );
create policy template_shares_delete on public.template_shares for delete to authenticated
  using (public.can_edit_template(template_id));

-- People picker for sharing: names and departments of other active staff (no emails).
create function public.share_directory()
returns table (id uuid, full_name text, department_id uuid, department_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_active_or_pending_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.department_id, d.name
    from public.profiles p
    left join public.departments d on d.id = p.department_id
    where p.role in ('admin', 'superadmin') and p.status <> 'suspended'
      and p.id <> auth.uid() and p.full_name is not null
    order by lower(p.full_name);
end;
$$;

revoke execute on function public.templates_before_write() from public, anon, authenticated;
revoke execute on function public.can_view_template(uuid) from public, anon;
revoke execute on function public.can_edit_template(uuid) from public, anon;
revoke execute on function public.share_directory() from public, anon;
grant execute on function public.can_view_template(uuid), public.can_edit_template(uuid), public.share_directory() to authenticated;
