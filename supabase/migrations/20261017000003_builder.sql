-- PPI Form — Phase 3: builder support.

-- Autosave: writes the form's editable fields and its full question list in one
-- transaction. SECURITY INVOKER, so RLS and the form/question triggers apply
-- exactly as for direct writes (owner or superadmin only).
--   p_form:      { title, description, department_id, category_id, chapter_id, requires_login,
--                  limit_one_response, collect_name, confirmation_message }
--   p_questions: [{ id, type, title, description, required, options, settings }, ...] in display order
-- Questions missing from the list are deleted (answered ones become is_deleted = true via trigger).
create function public.save_form(p_form_id uuid, p_form jsonb, p_questions jsonb)
returns timestamptz
language plpgsql security invoker set search_path = ''
as $$
declare
  v_updated_at timestamptz;
begin
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'invalid_questions' using errcode = '22023';
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
    confirmation_message = p_form ->> 'confirmation_message'
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

-- Which questions of a form already have answers (their type is locked in the builder).
create function public.answered_question_ids(p_form_id uuid)
returns setof uuid
language sql stable security invoker set search_path = ''
as $$
  select distinct k::uuid
  from public.responses r, jsonb_object_keys(r.answers) k
  where r.form_id = p_form_id
    and k ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

revoke execute on function public.save_form(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_form(uuid, jsonb, jsonb) to authenticated;
revoke execute on function public.answered_question_ids(uuid) from public, anon;
grant execute on function public.answered_question_ids(uuid) to authenticated;
