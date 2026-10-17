-- PPI Form — Phase 6: secretary (superadmin) pages.
-- Every function here is SECURITY INVOKER and additionally refuses non-superadmins,
-- so RLS and an explicit check both apply.

create function public.require_superadmin()
returns void
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Overview dashboard: KPIs, per-department/chapter/category counts, time series.
-- "In period" means [p_from, p_to). Time buckets are days (≤ 92 days) or weeks,
-- in Malaysia time, with empty buckets included.
-- ---------------------------------------------------------------------------
create function public.admin_overview(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_tz constant text := 'Asia/Kuala_Lumpur';
  v_bucket text := case when p_to - p_from <= interval '92 days' then 'day' else 'week' end;
  v_step interval := case when p_to - p_from <= interval '92 days' then interval '1 day' else interval '1 week' end;
  v_result jsonb;
begin
  perform public.require_superadmin();

  with f as (select * from public.forms where deleted_at is null),
  r as (select r.* from public.responses r join f on f.id = r.form_id),
  fp as (select * from f where created_at >= p_from and created_at < p_to),
  rp as (select * from r where submitted_at >= p_from and submitted_at < p_to),
  buckets as (
    select b as bucket
    from generate_series(
      date_trunc(v_bucket, p_from at time zone v_tz),
      date_trunc(v_bucket, (p_to - interval '1 second') at time zone v_tz),
      v_step) as b
  )
  select jsonb_build_object(
    'bucket', v_bucket,
    'kpis', jsonb_build_object(
      'total_forms', (select count(*) from f),
      'open_forms', (select count(*) from f where status = 'open'),
      'total_responses', (select count(*) from r),
      'forms_in_period', (select count(*) from fp),
      'responses_in_period', (select count(*) from rp),
      'departments_active', (select count(distinct department_id) from (
          select department_id from fp
          union all
          select f.department_id from rp join f on f.id = rp.form_id) a where department_id is not null),
      'pending_approvals', (select count(*) from public.profiles where role = 'admin' and status = 'pending')
    ),
    'departments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'color', d.color, 'is_archived', d.is_archived,
        'forms_in_period', (select count(*) from fp where fp.department_id = d.id),
        'forms_total', (select count(*) from f where f.department_id = d.id),
        'open_now', (select count(*) from f where f.department_id = d.id and f.status = 'open'),
        'responses_in_period', (select count(*) from rp join f on f.id = rp.form_id where f.department_id = d.id),
        'last_activity', greatest(
          (select max(greatest(f.created_at, coalesce(f.published_at, f.created_at))) from f where f.department_id = d.id),
          (select max(r.submitted_at) from r join f on f.id = r.form_id where f.department_id = d.id))
      ) order by d.name), '[]'::jsonb)
      from public.departments d
      where not d.is_archived or exists (select 1 from f where f.department_id = d.id)
    ),
    'chapters', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'count', c.n) order by c.n desc, c.name), '[]'::jsonb)
      from (
        select ch.id, ch.name, (select count(*) from fp where fp.chapter_id = ch.id) as n
        from public.chapters ch
        where not ch.is_archived or exists (select 1 from fp where fp.chapter_id = ch.id)
        union all
        select null, null, (select count(*) from fp where fp.chapter_id is null)
      ) c
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'count', c.n) order by c.n desc, c.name), '[]'::jsonb)
      from (
        select cat.id, cat.name, (select count(*) from fp where fp.category_id = cat.id) as n
        from public.categories cat
        where cat.is_active or exists (select 1 from fp where fp.category_id = cat.id)
      ) c
    ),
    'responses_series', (
      select coalesce(jsonb_agg(jsonb_build_object('bucket', to_char(b.bucket, 'YYYY-MM-DD'), 'count',
        (select count(*) from rp where date_trunc(v_bucket, rp.submitted_at at time zone v_tz) = b.bucket)) order by b.bucket), '[]'::jsonb)
      from buckets b
    ),
    'forms_series', (
      select coalesce(jsonb_agg(jsonb_build_object('bucket', to_char(b.bucket, 'YYYY-MM-DD'), 'count',
        (select count(*) from fp where date_trunc(v_bucket, fp.created_at at time zone v_tz) = b.bucket)) order by b.bucket), '[]'::jsonb)
      from buckets b
    ),
    'recent_forms', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
      from (
        select f.id, f.title, f.status, f.created_at, d.name as department_name, d.color as department_color
        from f left join public.departments d on d.id = f.department_id
        order by f.created_at desc limit 10
      ) x
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Form registry: every form with tracking fields, filters, sort, paging.
--   p_status: draft | open | closed | archived | deleted | null (all non-deleted)
--   p_chapter: a chapter id; p_no_chapter = true selects forms without chapter
--   p_from/p_to filter on created_at
-- ---------------------------------------------------------------------------
create function public.admin_forms(
  p_query text default null,
  p_department uuid default null,
  p_chapter uuid default null,
  p_no_chapter boolean default false,
  p_category uuid default null,
  p_status text default null,
  p_owner uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_sort text default 'created_at',
  p_desc boolean default true,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid, title text, status public.form_status, share_slug text,
  department_id uuid, department_name text, department_color text,
  chapter_name text, category_name text,
  owner_id uuid, owner_name text, owner_email text,
  created_at timestamptz, published_at timestamptz, deleted_at timestamptz,
  last_response_at timestamptz, response_count bigint, total_count bigint
)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_sort text := case p_sort
    when 'title' then 'lower(x.title)'
    when 'department' then 'lower(x.department_name)'
    when 'chapter' then 'lower(x.chapter_name)'
    when 'category' then 'lower(x.category_name)'
    when 'owner' then 'lower(coalesce(x.owner_name, x.owner_email))'
    when 'status' then 'x.status'
    when 'last_response_at' then 'x.last_response_at'
    when 'response_count' then 'x.response_count'
    else 'x.created_at' end;
  v_pattern text;
begin
  perform public.require_superadmin();
  if p_query is not null and length(trim(p_query)) > 0 then
    v_pattern := '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query execute format($q$
    select x.*, count(*) over () as total_count from (
      select f.id, f.title, f.status, f.share_slug,
             f.department_id, d.name as department_name, d.color as department_color,
             ch.name as chapter_name, cat.name as category_name,
             f.owner_id, p.full_name as owner_name, p.email as owner_email,
             f.created_at, f.published_at, f.deleted_at,
             s.last_response_at, coalesce(s.response_count, 0) as response_count
      from public.forms f
      left join public.departments d on d.id = f.department_id
      left join public.chapters ch on ch.id = f.chapter_id
      left join public.categories cat on cat.id = f.category_id
      left join public.profiles p on p.id = f.owner_id
      left join lateral (
        select count(*) as response_count, max(r.submitted_at) as last_response_at
        from public.responses r where r.form_id = f.id
      ) s on true
      where ($1::text is null or f.title ilike $1)
        and ($2::uuid is null or f.department_id = $2)
        and ($3::uuid is null or f.chapter_id = $3)
        and (not $4 or f.chapter_id is null)
        and ($5::uuid is null or f.category_id = $5)
        and (case when $6 = 'deleted' then f.deleted_at is not null
                  else f.deleted_at is null and ($6 is null or f.status::text = $6) end)
        and ($7::uuid is null or f.owner_id = $7)
        and ($8::timestamptz is null or f.created_at >= $8)
        and ($9::timestamptz is null or f.created_at < $9)
    ) x
    order by %s %s nulls last, x.created_at desc, x.id
    limit $10 offset $11
  $q$, v_sort, case when p_desc then 'desc' else 'asc' end)
  using v_pattern, p_department, p_chapter, coalesce(p_no_chapter, false), p_category, p_status, p_owner,
        p_from, p_to, least(greatest(p_limit, 1), 5000), greatest(p_offset, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- People: admins and superadmins with their form counts.
-- ---------------------------------------------------------------------------
create function public.admin_people()
returns table (
  id uuid, email text, full_name text, avatar_url text,
  role public.user_role, status public.user_status,
  department_id uuid, department_name text, created_at timestamptz,
  forms_count bigint, open_forms_count bigint
)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  perform public.require_superadmin();
  return query
    select p.id, p.email, p.full_name, p.avatar_url, p.role, p.status,
           p.department_id, d.name, p.created_at,
           (select count(*) from public.forms f where f.owner_id = p.id and f.deleted_at is null),
           (select count(*) from public.forms f where f.owner_id = p.id and f.deleted_at is null and f.status = 'open')
    from public.profiles p
    left join public.departments d on d.id = p.department_id
    where p.role in ('admin', 'superadmin')
    order by (p.status = 'pending') desc, lower(coalesce(p.full_name, p.email));
end;
$$;

-- Transfer every form of one person to another active/pending admin (PRD A6).
-- Each form's change is logged by the forms trigger.
create function public.transfer_forms(p_from uuid, p_to uuid)
returns int
language plpgsql security invoker set search_path = ''
as $$
declare
  v_count int;
begin
  perform public.require_superadmin();
  if p_from = p_to then
    raise exception 'same_person' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles
                 where id = p_to and role in ('admin', 'superadmin') and status <> 'suspended') then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  update public.forms set owner_id = p_to where owner_id = p_from;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Usage counts for the lookup and template admin pages (delete only when unused).
create function public.admin_usage()
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
begin
  perform public.require_superadmin();
  return jsonb_build_object(
    'departments', (select coalesce(jsonb_object_agg(d.id, jsonb_build_object(
        'forms', (select count(*) from public.forms f where f.department_id = d.id),
        'people', (select count(*) from public.profiles p where p.department_id = d.id))), '{}'::jsonb)
      from public.departments d),
    'chapters', (select coalesce(jsonb_object_agg(c.id, jsonb_build_object(
        'forms', (select count(*) from public.forms f where f.chapter_id = c.id),
        'people', (select count(*) from public.profiles p where p.chapter_id = c.id))), '{}'::jsonb)
      from public.chapters c),
    'categories', (select coalesce(jsonb_object_agg(c.id, jsonb_build_object(
        'forms', (select count(*) from public.forms f where f.category_id = c.id),
        'templates', (select count(*) from public.templates t where t.category_id = c.id))), '{}'::jsonb)
      from public.categories c),
    'templates', (select coalesce(jsonb_object_agg(t.id, jsonb_build_object(
        'forms', (select count(*) from public.forms f where f.template_id = t.id))), '{}'::jsonb)
      from public.templates t)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Guards: a superadmin can't change their own role/status, and the last active
-- superadmin can't be demoted or suspended (yearly handover safety).
-- ---------------------------------------------------------------------------
create function public.profiles_guard_access()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role = old.role and new.status = old.status then
    return new;
  end if;
  if auth.uid() is not null and auth.uid() = old.id and old.role = 'superadmin' then
    raise exception 'cannot_change_own_access' using errcode = '42501';
  end if;
  if old.role = 'superadmin' and old.status = 'active'
     and (new.role <> 'superadmin' or new.status <> 'active')
     and not exists (select 1 from public.profiles
                     where role = 'superadmin' and status = 'active' and id <> old.id) then
    raise exception 'last_superadmin' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_access
  before update on public.profiles
  for each row execute function public.profiles_guard_access();

revoke execute on function public.profiles_guard_access() from public, anon, authenticated;
revoke execute on function public.require_superadmin() from public, anon;
grant execute on function public.require_superadmin() to authenticated;
revoke execute on function public.admin_overview(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_overview(timestamptz, timestamptz) to authenticated;
revoke execute on function public.admin_forms(text, uuid, uuid, boolean, uuid, text, uuid, timestamptz, timestamptz, text, boolean, int, int) from public, anon;
grant execute on function public.admin_forms(text, uuid, uuid, boolean, uuid, text, uuid, timestamptz, timestamptz, text, boolean, int, int) to authenticated;
revoke execute on function public.admin_people() from public, anon;
grant execute on function public.admin_people() to authenticated;
revoke execute on function public.transfer_forms(uuid, uuid) from public, anon;
grant execute on function public.transfer_forms(uuid, uuid) to authenticated;
revoke execute on function public.admin_usage() from public, anon;
grant execute on function public.admin_usage() to authenticated;
