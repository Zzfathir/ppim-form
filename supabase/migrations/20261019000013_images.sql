-- Images in forms (owner revision):
--   * "image" items: a picture block that is never answered (like sections)
--   * any question may carry an image above its answer field
-- Both store the picture in questions.settings (image_path, image_alt), so
-- templates and duplicates carry them without extra columns. Files live in the
-- public "form-banners" bucket under "<form or template id>/<random name>".

alter table public.questions
  add constraint questions_image_path_format check (
    settings ->> 'image_path' is null
    or settings ->> 'image_path' ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'
  );

-- ---------------------------------------------------------------------------
-- Autosave: a newly set image must live in this form's own folder. Paths the
-- form already uses (copied from a template or a duplicate, or a duplicated
-- question) are kept.
-- ---------------------------------------------------------------------------
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

  if exists (
    select 1
    from jsonb_array_elements(p_questions) q
    cross join lateral (select q -> 'settings' ->> 'image_path' as path) i
    where i.path is not null
      and split_part(i.path, '/', 1) <> p_form_id::text
      and not exists (select 1 from public.questions x
                      where x.form_id = p_form_id and x.settings ->> 'image_path' = i.path)
  ) then
    raise exception 'invalid_image' using errcode = '22023';
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

-- ---------------------------------------------------------------------------
-- Publishing: image items are layout (like sections), but must have a picture.
-- ---------------------------------------------------------------------------
create or replace function public.publish_problems(p_form_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  with f as (
    select f.*, p.status as owner_status, p.role as owner_role
    from public.forms f join public.profiles p on p.id = f.owner_id
    where f.id = p_form_id
  ), q as (
    select * from public.questions where form_id = p_form_id and not is_deleted and type not in ('section', 'image')
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
    union all
    select 7, 'image_missing' where exists (
      select 1 from public.questions i
      where i.form_id = p_form_id and not i.is_deleted and i.type = 'image'
        and coalesce(i.settings ->> 'image_path', '') = '')
  ) problems
$$;

-- The summary skips image items too (they have no answers).
do $$
declare
  v_src text;
begin
  select pg_get_functiondef('public.form_summary(uuid)'::regprocedure) into v_src;
  if position('and type <> ''section'' order by position' in v_src) = 0 then
    raise exception 'form_summary changed; update this migration';
  end if;
  v_src := replace(v_src,
    'and type <> ''section'' order by position',
    'and type not in (''section'', ''image'') order by position');
  execute v_src;
end;
$$;

-- ---------------------------------------------------------------------------
-- Templates: images uploaded in the template editor go to the template's own
-- folder. On update, a new image path must be in that folder or already used
-- by the template; new templates (copies, "save as template") keep the paths
-- of their source.
-- ---------------------------------------------------------------------------
create function public.template_image_paths(p_questions jsonb)
returns setof text
language sql immutable set search_path = ''
as $$
  select q -> 'settings' ->> 'image_path'
  from jsonb_array_elements(case when jsonb_typeof(p_questions) = 'array' then p_questions else '[]'::jsonb end) q
  where jsonb_typeof(q) = 'object' and q -> 'settings' ->> 'image_path' is not null
$$;

create function public.templates_check_images()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (
    select 1 from public.template_image_paths(new.questions) p
    where p !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'
       or (tg_op = 'UPDATE'
           and split_part(p, '/', 1) <> new.id::text
           and p not in (select public.template_image_paths(old.questions)))
  ) then
    raise exception 'invalid_image' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger templates_check_images
  before insert or update of questions on public.templates
  for each row execute function public.templates_check_images();

create policy form_images_template_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'form-banners'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.can_edit_template(((storage.foldername(name))[1])::uuid)
  );

revoke execute on function public.templates_check_images() from public, anon, authenticated;
