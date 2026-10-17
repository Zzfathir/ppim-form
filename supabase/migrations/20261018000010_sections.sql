-- Sections are layout, not questions: they never need a title, options or answers.

create or replace function public.publish_problems(p_form_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  with f as (
    select f.*, p.status as owner_status, p.role as owner_role
    from public.forms f join public.profiles p on p.id = f.owner_id
    where f.id = p_form_id
  ), q as (
    select * from public.questions where form_id = p_form_id and not is_deleted and type <> 'section'
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

-- The summary skips sections (they have no answers).
do $$
declare
  v_src text;
begin
  select pg_get_functiondef('public.form_summary(uuid)'::regprocedure) into v_src;
  if position('where form_id = p_form_id and not is_deleted order by position' in v_src) = 0 then
    raise exception 'form_summary changed; update this migration';
  end if;
  v_src := replace(v_src,
    'where form_id = p_form_id and not is_deleted order by position',
    'where form_id = p_form_id and not is_deleted and type <> ''section'' order by position');
  execute v_src;
end;
$$;
