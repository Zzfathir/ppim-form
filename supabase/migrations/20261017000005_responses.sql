-- PPI Form — Phase 5: response summary and table, aggregated in the database.
-- Both functions are SECURITY INVOKER: RLS on forms/questions/responses decides
-- who sees what (owner, same department read-only, superadmin).

-- Per-question summary for the Responses tab.
--   choice:  counts per option (in option order) plus an "other" bucket
--   scale:   average and counts per value
--   date:    counts per date
--   text:    answered count and the 10 latest answers
create function public.form_summary(p_form_id uuid)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_total int;
  v_questions jsonb := '[]'::jsonb;
  v_stats jsonb;
  q record;
  k text;
begin
  if not exists (select 1 from public.forms where id = p_form_id) then
    raise exception 'form_not_found' using errcode = 'P0002';
  end if;

  select count(*) into v_total from public.responses where form_id = p_form_id;

  for q in
    select id, type, options, settings from public.questions
    where form_id = p_form_id and not is_deleted order by position
  loop
    k := q.id::text;

    if q.type in ('single_choice', 'dropdown') then
      select jsonb_build_object(
               'answered', coalesce(sum(n), 0),
               'counts', coalesce(jsonb_object_agg(bucket, n), '{}'::jsonb))
        into v_stats
        from (
          select case when coalesce(q.options, '[]'::jsonb) ? (r.answers ->> k) then r.answers ->> k else '__other__' end as bucket,
                 count(*) as n
          from public.responses r
          where r.form_id = p_form_id and jsonb_typeof(r.answers -> k) = 'string'
          group by 1
        ) s;

    elsif q.type = 'multiple_choice' then
      select jsonb_build_object(
               'answered', (select count(*) from public.responses r
                            where r.form_id = p_form_id and jsonb_typeof(r.answers -> k) = 'array'
                              and jsonb_array_length(r.answers -> k) > 0),
               'counts', coalesce(jsonb_object_agg(bucket, n), '{}'::jsonb))
        into v_stats
        from (
          select case when coalesce(q.options, '[]'::jsonb) ? v.value then v.value else '__other__' end as bucket,
                 count(distinct r.id) as n
          from public.responses r
          cross join lateral jsonb_array_elements_text(r.answers -> k) as v(value)
          where r.form_id = p_form_id and jsonb_typeof(r.answers -> k) = 'array'
          group by 1
        ) s;

    elsif q.type = 'scale' then
      select jsonb_build_object(
               'answered', coalesce(sum(n), 0),
               'average', case when sum(n) > 0 then round(sum(value * n)::numeric / sum(n), 2) end,
               'counts', coalesce(jsonb_object_agg(value::text, n), '{}'::jsonb))
        into v_stats
        from (
          select (r.answers ->> k)::int as value, count(*) as n
          from public.responses r
          where r.form_id = p_form_id and jsonb_typeof(r.answers -> k) = 'number'
          group by 1
        ) s;

    elsif q.type = 'date' then
      select jsonb_build_object(
               'answered', coalesce(sum(n), 0),
               'dates', coalesce(jsonb_agg(jsonb_build_object('value', value, 'count', n) order by value), '[]'::jsonb))
        into v_stats
        from (
          select r.answers ->> k as value, count(*) as n
          from public.responses r
          where r.form_id = p_form_id and jsonb_typeof(r.answers -> k) = 'string'
          group by 1
        ) s;

    else -- short_text, paragraph
      select jsonb_build_object(
               'answered', (select count(*) from public.responses r
                            where r.form_id = p_form_id and jsonb_typeof(r.answers -> k) = 'string'),
               'latest', coalesce((
                 select jsonb_agg(value order by submitted_at desc)
                 from (select r.answers ->> k as value, r.submitted_at
                       from public.responses r
                       where r.form_id = p_form_id and jsonb_typeof(r.answers -> k) = 'string'
                       order by r.submitted_at desc limit 10) latest), '[]'::jsonb))
        into v_stats;
    end if;

    v_questions := v_questions || jsonb_build_array(jsonb_build_object('question_id', q.id) || v_stats);
  end loop;

  return jsonb_build_object('total', v_total, 'questions', v_questions);
end;
$$;

-- One page of the responses table with search and sort, plus the total match count.
--   p_sort: 'submitted_at' | 'respondent_name' | 'respondent_email' | a question id (sorts by that answer)
create function public.responses_page(
  p_form_id uuid,
  p_query text default null,
  p_sort text default 'submitted_at',
  p_desc boolean default true,
  p_limit int default 25,
  p_offset int default 0
)
returns table (id uuid, submitted_at timestamptz, respondent_name text, respondent_email text, answers jsonb, total_count bigint)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_order text;
  v_pattern text;
begin
  if p_sort in ('submitted_at', 'respondent_name', 'respondent_email') then
    v_order := format('r.%I', p_sort);
  elsif p_sort ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_order := format('r.answers -> %L', p_sort);
  else
    v_order := 'r.submitted_at';
  end if;

  if p_query is not null and length(trim(p_query)) > 0 then
    v_pattern := '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query execute format(
    'select r.id, r.submitted_at, r.respondent_name, r.respondent_email, r.answers, count(*) over () as total_count
       from public.responses r
      where r.form_id = $1
        and ($2::text is null
             or r.answers::text ilike $2
             or coalesce(r.respondent_name, '''') ilike $2
             or coalesce(r.respondent_email, '''') ilike $2)
      order by %s %s nulls last, r.submitted_at desc, r.id
      limit $3 offset $4',
    v_order, case when p_desc then 'desc' else 'asc' end)
  using p_form_id, v_pattern, least(greatest(p_limit, 1), 100), greatest(p_offset, 0);
end;
$$;

revoke execute on function public.form_summary(uuid) from public, anon;
grant execute on function public.form_summary(uuid) to authenticated;
revoke execute on function public.responses_page(uuid, text, text, boolean, int, int) from public, anon;
grant execute on function public.responses_page(uuid, text, text, boolean, int, int) to authenticated;
