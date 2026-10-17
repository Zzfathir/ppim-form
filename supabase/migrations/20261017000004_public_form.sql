-- PPI Form — Phase 4: public form support.

-- Fixed-window rate limiter for public endpoints (per IP + form). Lives in the
-- database so it holds across server instances. Only the service role uses it.
create table public.rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limit_hits enable row level security;  -- no policies: service role only
revoke all on public.rate_limit_hits from anon, authenticated;

-- Records one hit and returns true while the caller is within p_limit hits per window.
create function public.hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limit_hits (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limit_hits.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup of old windows (cheap: indexed by primary key prefix per key).
  if random() < 0.01 then
    delete from public.rate_limit_hits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
