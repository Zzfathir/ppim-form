-- Live Google Sheets sync (owner request; spec S6 pulled forward).
-- An editor links a form once; a spreadsheet is created in THEIR Google Drive
-- (scope drive.file) and every response is appended as a row.

-- The linking person's Google grant. Refresh tokens are encrypted by the app
-- (AES-256-GCM, key in GOOGLE_TOKEN_KEY) and only the service role can read them.
create table public.google_connections (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  google_email text,
  refresh_token_enc text not null,
  scopes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.google_connections enable row level security;  -- no policies: service role only
revoke all on public.google_connections from anon, authenticated;

-- One linked spreadsheet per form.
create table public.form_sheets (
  form_id uuid primary key references public.forms(id) on delete cascade,
  spreadsheet_id text not null,
  spreadsheet_url text not null,
  -- Question ids in sheet column order (after Timestamp, Name, Email). New questions are appended.
  columns jsonb not null default '[]' check (jsonb_typeof(columns) = 'array'),
  linked_by uuid references public.profiles(id) on delete set null,
  status text not null default 'ok' check (status in ('ok', 'error')),
  last_error text,
  last_synced_at timestamptz,
  sync_lock_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.form_sheets enable row level security;
revoke all on public.form_sheets from anon;
-- Anyone who can see the form can see whether (and where) it syncs; all writes go through the server.
create policy form_sheets_read on public.form_sheets for select to authenticated
  using (public.can_read_form(form_id));

-- Which responses are already in the sheet. Rows are appended oldest first and
-- marked here, so concurrent submissions are never skipped or duplicated.
alter table public.responses add column sheet_synced_at timestamptz;
create index responses_sheet_pending on public.responses (form_id, submitted_at) where sheet_synced_at is null;

-- One sync at a time per form (lease). Returns true when the caller got the lease.
create function public.claim_sheet_sync(p_form_id uuid, p_seconds int default 60)
returns boolean
language sql security definer set search_path = ''
as $$
  with claimed as (
    update public.form_sheets
       set sync_lock_until = now() + make_interval(secs => p_seconds)
     where form_id = p_form_id and (sync_lock_until is null or sync_lock_until < now())
    returning 1
  )
  select exists (select 1 from claimed)
$$;

revoke execute on function public.claim_sheet_sync(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_sheet_sync(uuid, int) to service_role;
