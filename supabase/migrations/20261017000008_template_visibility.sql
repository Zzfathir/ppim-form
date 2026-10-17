-- Template visibility must be decided from the row itself: a policy that
-- re-reads `templates` can't see a row inside its own INSERT ... RETURNING.

-- Shared with me or my department? Reads template_shares only (SECURITY DEFINER,
-- because recipients can't read the shares table directly).
create function public.template_shared_with_me(p_template_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.template_shares s
    where s.template_id = p_template_id
      and (s.profile_id = auth.uid()
           or (s.department_id is not null and s.department_id = public.current_department_id()))
  )
$$;

revoke execute on function public.template_shared_with_me(uuid) from public, anon;
grant execute on function public.template_shared_with_me(uuid) to authenticated;

drop policy templates_select on public.templates;
create policy templates_select on public.templates for select to authenticated
  using (
    public.is_superadmin()
    or (public.is_staff() and (
      (is_official and is_published)
      or created_by = auth.uid()
      or (department_id is not null and department_id = public.current_department_id())
      or public.template_shared_with_me(id)
    ))
  );

-- Keep can_view_template() consistent with the policy (used by callers that need a boolean).
create or replace function public.can_view_template(p_template_id uuid)
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
             or public.template_shared_with_me(t.id))
    )
  )
$$;

-- Sharing with a person: the target must be an admin/superadmin. The check has
-- to bypass profiles RLS (admins can only read their own profile row).
create function public.is_staff_profile(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = p_profile_id and role in ('admin', 'superadmin')) $$;

revoke execute on function public.is_staff_profile(uuid) from public, anon;
grant execute on function public.is_staff_profile(uuid) to authenticated;

drop policy template_shares_insert on public.template_shares;
create policy template_shares_insert on public.template_shares for insert to authenticated
  with check (
    public.can_edit_template(template_id)
    and created_by = auth.uid()
    and (profile_id is null or public.is_staff_profile(profile_id))
  );
