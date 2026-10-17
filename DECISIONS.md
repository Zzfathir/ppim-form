# Decisions and assumptions

Every choice made where the spec (`spec/PPI_Form_PRD.md`, `spec/PPI_Form_BUILD_PROMPT.md`) was silent,
ambiguous, or overridden by the owner. Newest phase at the bottom.

## Owner answers (2026-10-17)

| # | Question | Answer |
|---|---|---|
| O1 | Chapter list | Not available yet → seed placeholders `Chapter 1…5`, renamable in `/admin/chapters`. |
| O2 | May superadmins read individual response content? | **Yes**, full read (PRD default). |
| O3 | Default UI language | **English default**, Indonesian as alternative. *Overrides* the build prompt (`id` default). |
| O4 | Local development | Local Supabase in Docker for development and tests; the cloud project is used for real deployments. |

## Phase 1 — Foundation

- **Next.js 16.4 / React 19.3**, App Router, Turbopack, `src/` layout. In Next 16 `middleware.ts` is named `proxy.ts`.
- **Cache Components (`cacheComponents`) is disabled.** The scaffold enables it, but almost every page reads auth
  and locale cookies, which would require Suspense boundaries around every cookie read for no benefit. Pages render
  dynamically per request.
- **Root-level `loading.tsx` is avoided above layouts that do role checks.** A loading boundary starts streaming
  before the nested layout's `redirect()`, which turns a 307 into a client-side redirect. Loading UIs live in leaf
  routes. Every admin page also calls `requireSuperadmin()` itself, because layouts don't re-run on client navigation.
  RLS remains the real data boundary.
- **shadcn/ui** with the Radix base and "nova" preset. Dark mode is not in the spec, so it's removed and toasts are forced light.
- **Branding:** `src/config/brand.ts` is the single brand file (name, org name, logo path, favicon path, colors, chart
  palette). The root layout injects its colors as `--brand-*` CSS variables; `globals.css` maps every UI token to them.
  Changing the logo means replacing `public/logo.png` / `public/favicon.png` (or pointing `brand.ts` at new files).
  `favicon.png` is a 64×64 resize of the supplied logo.
- **Colors (contrast measured):** accent `#E8080A` (4.7:1 on white: used for accents, icons and focus rings, not for
  small text on fills); filled buttons `#C80609` (white text 6.0:1); text `#111111`; muted text `#5F6368` (6.0:1 on
  white, 5.5:1 on the grey canvas).
- **Fonts:** Inter (body) and Plus Jakarta Sans (headings) via `next/font`.
- **i18n:** next-intl **without locale routing**; the locale lives in the `NEXT_LOCALE` cookie. That keeps share links
  (`/f/{slug}`) free of locale prefixes. A small EN/ID switcher sits in the header and on the login/onboarding pages.
- **Auth:** Supabase Auth with Google only. The app never offers email/password.
  - The local Supabase still has the email provider enabled, **only** so automated tests can sign in test users. In
    the cloud project, disable the Email provider (see README).
  - **Superadmin bootstrap** happens in `/auth/callback` (server, service role): if the signed-in user has a Google
    identity and their email is in `SUPERADMIN_EMAILS`, the profile becomes `superadmin/active` and the change is
    logged (`superadmin_bootstrapped`). It runs on every sign-in, so emails added to the list later take effect on
    the next login. Removing an email from the list does **not** demote anyone; demotion is an in-app superadmin action.
  - The callback never changes roles otherwise, so signing in from a form page does not create an admin (A7).
- **Profile bootstrap** is a DB trigger on `auth.users` (role `respondent`, name/avatar from Google metadata).
- **Onboarding** is a `SECURITY DEFINER` RPC `complete_onboarding()`. Users have **no direct UPDATE** on `profiles`,
  so nobody can change their own role or status through the public API. The RPC:
  - upgrades `respondent → admin` with `pending` or `active` depending on `app_settings.require_admin_approval`, and
    logs `admin_requested`;
  - for an admin or superadmin with **no department** (e.g. a bootstrapped superadmin), only sets name/department/chapter;
  - rejects archived departments and chapters, and rejects repeat onboarding.
- **Anyone signed in without a department is sent to `/onboarding`**, including bootstrapped superadmins. This way
  "department pre-filled from profile" works for superadmins too, without hard-coding "Biro KSA" anywhere.
- **Superadmin home:** `/dashboard` redirects superadmins to `/admin` (per spec), so a superadmin's own forms will be
  found in the registry (`/admin/forms`), not in "My forms".
- **Same-department names:** admins can't read other profiles directly. A `department_members` view exposes only
  id, name, avatar and department of staff in the caller's own department (all staff for superadmins). It's an
  owner-rights view by design, with `security_barrier`.
- **Rejected admins** go back to `respondent` (PRD §5.2) and can request again via onboarding.
- **Seeding** is a TypeScript script (`npm run db:seed`) instead of `seed.sql`, so departments are read straight from
  `spec/seed/departments.json`. Each table is seeded only when empty, so later renames and archives by the secretary
  are never overwritten. Department colors come from a palette in the seed script (not application code).
- **Schema split across phases:** the Phase 1 migration has the tables onboarding needs (departments, chapters,
  categories, profiles, app_settings, activity_log). Forms, questions, responses and templates come in Phase 2.
- `activity_log.actor_id` is `on delete set null`, so deleting a user keeps the history.
- **Database tests** run only against local Supabase. The helper refuses any non-localhost URL so the test suite can
  never create or delete users in the cloud project.

## Phase 2 — Data and authorization rules

- **Rules live in the database**, so they hold for every client (the browser has the anon key and can call the API
  directly):
  - RLS for who can read/write which rows.
  - `BEFORE` triggers for business rules: publishing, status transitions, protected columns, question soft delete.
  - `AFTER` triggers that write `activity_log`.

  Server actions in later phases still validate first so users get friendly messages.
- **"Same department" means the form's `department_id`** equals the viewer's profile department (forms are tagged,
  people are tagged). A form with no department yet (a draft) is visible only to its owner and superadmins.
- **Soft-deleted forms** are visible to superadmins only (for restore). Owners delete via the `soft_delete_form()`
  RPC, because Postgres RLS won't let a plain UPDATE make a row invisible to the person updating it. Only
  superadmins can restore. There is no hard-delete policy at all.
- **Status transitions** allowed: draft→open, open→closed, closed→open, closed→archived, archived→closed (PRD state
  diagram). Anything else is rejected (`invalid_status_transition`). New forms created by users are always drafts.
- **Publishing / reopening** requires:
  - the caller to be an **active** admin or superadmin (`publish_requires_active_account`);
  - a complete form; otherwise `publish_blocked`, with the problem codes in the error detail.

  Problem codes: `owner_not_active`, `department_required`, `category_required`, `no_questions`, `question_untitled`,
  `choice_needs_options` (a choice question needs ≥ 2 non-empty options). The `publish_check()` RPC returns the same
  codes so the builder can show them inline.
  - Because the owner must be active, a superadmin cannot reopen a form whose owner is suspended or pending without
    first transferring it to an active admin.
- **Protected columns:**
  - `share_slug`, `created_at`, `published_at` and `closed_at` are system-managed.
  - Only superadmins can change `owner_id` (transfer) or clear `deleted_at`.
  - The service role (seed scripts) may insert historical rows for dev data.
- **Share slugs:** 10 random characters from an alphabet without look-alikes (`0/O`, `1/l/I`), generated by
  `gen_random_bytes`. Unique index; never derived from the title.
- **Questions:**
  - Deleting a question that already has answers becomes `is_deleted = true` (enforced by trigger).
  - An answered question cannot change type (`answered_question_type_locked`), so stored answers keep their meaning.
  - Renaming options is allowed; old answers keep the old label (build prompt §4).
- **Duplicate** (`duplicate_form()` RPC): allowed for any form the caller can read. The copy is a draft owned by the
  caller, with title "Copy of …" and a new slug. Department and chapter are pre-filled from the **caller's**
  profile; category, settings and non-deleted questions are copied.
- **Responses:**
  - No client INSERT policy: submissions go through the server handler (service role) in Phase 4.
  - Delete is allowed to the owner and superadmins at the RLS level (§5), but there is no UI for it until P1 (S4).
  - The `one_response_per_person` unique index makes concurrent double submits safe.
- **Activity log** entries are written automatically:
  - form: `form_created`, `form_published`, `form_closed`, `form_reopened`, `form_archived`, `form_restored`,
    `form_transferred`, `form_retagged`, `form_deleted`, `form_duplicated`;
  - people: `admin_requested`, `admin_approved`, `admin_suspended`, `admin_restored`, `admin_rejected`,
    `superadmin_promoted`, `superadmin_demoted`, `admin_department_changed`.

  Admins can read entries for forms they can read; superadmins read everything.
- **Templates** store questions as JSON in the same shape as `questions` rows without ids (`src/lib/questions.ts`).
  The 8 seeded templates are in English (the default language), modelled on Google Forms' starters, each with a
  matching category. Number-type questions don't exist in P0, so "number of guests" is a dropdown (0–5).
- **Dev seed** (`npm run db:seed:dev`, local only):
  - 7 sample admins (`dev-admin-N@ppi-form.test`, one of them pending) across 6 departments;
  - ~16 forms from templates in mixed statuses over the last 4 months, with ~300 responses;
  - deterministic random data, so the dashboard looks the same every time.

  The other departments deliberately have no forms, to exercise "departments with zero forms".

## Deployment target (owner, 2026-10-17)

- The app will run on the owner's **existing hosting** under a **subdomain of the PPI Malaysia domain**, not on
  Vercel. The hosting type (it must run Node.js for Next.js server rendering) gets confirmed in Phase 7.
  `NEXT_PUBLIC_APP_URL` will be that subdomain; Supabase and Google redirect URLs must include it.

## Phase 3 — Builder

- **Autosave** sends the whole draft (form fields + ordered question list) about 800 ms after the last edit to the
  `save_form()` RPC.
  - The RPC is `SECURITY INVOKER`, so RLS and all triggers apply, and it runs in one transaction.
  - Questions get **client-generated UUIDs**, so a new question needs no extra round trip and its id is stable from
    the start.
  - Questions missing from the list are deleted; answered ones become soft deletes (trigger).
  - Only one save is in flight at a time. Edits made during a save are saved right after.
  - Network errors retry with backoff (2/5/10/30 s). Offline edits save on reconnect.
  - The tab warns before closing with unsaved changes.
  - The status indicator shows Saving… / Saved / Unsaved / Offline / error.
- **Edits to a live form apply immediately** (like Google Forms). Answered questions keep their answers: they
  can't change type (locked in the UI with an explanation, and rejected by the DB), and deleting one is a soft delete.
- **New form:** a blank form opens instantly with a localized "Untitled form" title and one empty short-answer
  question (build prompt §9). Department and chapter come from the creator's profile.
  - **"Add question"** adds a *Multiple choice* question with "Option 1" after the active card, like Google Forms.
  - **From template:** copies the template's questions and title, pre-fills its category and records `template_id`.
- **"Other" option** is offered for Multiple choice and Checkboxes only, not Dropdown (Google Forms parity). An "Other"
  answer is stored as the typed text. A checkbox answer may contain at most one non-option value.
- **Linear scale** starts at 0 or 1 and ends anywhere from 2 to 10, with optional end labels (Google Forms parity).
  Changing type keeps whatever still applies (e.g. options between choice types).
- **Answer limits** (`src/lib/forms/answers.ts`, shared by the client and the Phase 4 server): short answer 500
  chars, paragraph 5,000, "Other" 500, respondent name 120; dates as `YYYY-MM-DD`.
- **Department / Category / Chapter** pickers sit in the form's title card, visible above the questions (B7).
  Archived or inactive values stay visible when already selected, marked "(archived)".
- **Publish** shows an inline list of problems and highlights the offending fields and questions. The client
  mirrors the server checks; the server (`publish_check` + trigger) decides.
  - Pending admins see a disabled Publish button with an explanation; the server rejects them anyway.
  - On success a share dialog shows a copyable link and an "Open form" button. QR codes are P1.
- **Close/reopen** is one "Accepting responses" toggle, in the builder bar on desktop and in the Settings tab.
  Reopening re-runs the publish checks.
- **Settings** (B6): *Require Google sign-in*. *Limit to one response* only shows when sign-in is on; *Collect name*
  only shows when it's off. Plus the confirmation message.
- **Read-only view** for same-department colleagues (and anyone who can read but not edit): the respondent view of
  the form plus a "Duplicate to my forms" button. Duplicating opens the new copy.
- **Dashboard:** "My forms" and "My department" tabs, title search, status filter (kept in the URL), and cards with
  status, department, category, response count and last edit.
  - Card actions: open, copy link, duplicate, close/reopen, delete (with confirmation).
  - Department forms are view-only and can be duplicated.
- **Theme color:** forms render with the brand accent from `brand.ts`. The per-form `theme_color` column is
  unused until the P1 theme feature (B14), so a rebrand changes every form's accent too.
- **Drag and drop:** dnd-kit with pointer, touch (150 ms press) and keyboard sensors. Keyboard: focus the drag
  handle, Space, arrow keys, Space.
- **Preview** opens the respondent view in a dialog with a Desktop / Mobile (360 px) switch; submitting is disabled.
- `@playwright/test` is a dev dependency, used to drive the builder in a real browser during development. A
  committed end-to-end suite comes with the public form (Phase 4).

## Phase 4 — Public form

- **`/f/[slug]`** has no app chrome: one column, the form's cards, and a small footer ("Made with PPI Form" + EN/ID
  switch). The page reads the form through the same service as `GET /api/public/forms/[slug]`
  (`src/lib/public-form/service.ts`, service role, public-safe fields only).
- **States** (build prompt §7):
  - **Not found**: unknown or malformed slug, or a soft-deleted form. Real HTTP 404.
  - **Not accepting**: status is not `open`, or `closes_at` has passed. Shows title and department only.
  - **Sign in required**: shows title, description, an explanation and the Google button. One click; the user comes
    back to the form.
  - **Already responded**: sign-in form with the one-response limit, and this account already answered.
  - **Thank you**: the custom confirmation message, or "Your response has been recorded."
- **Sign-in from a form page** reuses `/auth/callback` with `next=/f/{slug}`. Nothing creates or upgrades a profile
  there (A7); the user stays a `respondent`. An e2e test checks they aren't sent to onboarding.
- **Signed-in respondents** see "Signed in as {email} · Switch account" plus a note that their name and email are
  recorded. "Switch account" signs out and returns to the form through `/login?returnTo=`.
- **Submit (`POST /api/public/forms/[slug]/submit`)** runs every check again on the server, in order:
  1. rate limit;
  2. payload shape (zod);
  3. form exists and is open (not past `closes_at`);
  4. honeypot;
  5. sign-in when required;
  6. answers validated against the form's current questions;
  7. identity and dedupe;
  8. insert.

  Then:
  - A `23505` unique violation on `(form_id, dedupe_key)` means "already responded"; concurrent double submits
    are tested.
  - Identity comes **only** from the session on sign-in forms (name/email from the Google profile). On anonymous
    forms all identity fields are null, except the optional name when *Collect name* is on. Any identity sent by
    the client is ignored.
- **Request hardening:**
  - The body must be `application/json`. Browsers can't send that cross-site without a CORS preflight, which is
    never allowed, so a plain cross-site HTML form post gets 415.
  - The body is capped at 256 KB, answers at 300 keys, plus the per-type text caps from Phase 3.
- **Rate limit:** 60 submissions per 10 minutes per IP per form, as a database-backed fixed window
  (`hit_rate_limit()`, service role only), so it holds across server processes. It's generous on purpose:
  - at events many respondents share one Wi-Fi IP;
  - the honeypot and server validation do the rest;
  - CAPTCHA only if abuse appears (R7).

  The client IP comes from the first `X-Forwarded-For` entry, then `X-Real-IP`. **The production reverse proxy must
  set these** (note for Phase 7). Old windows are cleaned up opportunistically.
- **Honeypot:** a hidden `website` field. If it's filled, the server answers with a normal success and stores
  nothing, so bots don't learn they were caught.
- **No search indexing:** public form pages send `robots: noindex, nofollow`. Forms are for whoever has the link;
  there's no public directory (P2).
- **Answers survive errors:** validation errors (client or server) keep everything typed and focus the first
  problem. Network, rate-limit and expired-session errors show a message and keep the answers.
- "Submit another response" (R8), "Report this form" (R9) and auto-close UI (B12) are P1/P2 and not built. The
  `closes_at` check is honoured because it costs nothing.
- **E2E tests:** Playwright runs against the dev server and local Supabase (`npm run test:e2e`).
  - Respondent specs use a 360 px viewport; builder specs use desktop.
  - Google sign-in is stood in for by creating a real Supabase session cookie for a test user (local stack only).
  - Every e2e test also fails on browser console errors, which catches hydration problems.

## Phase 5 — Responses

- **Aggregation happens in Postgres**, not the browser:
  - `form_summary()` gives per-question stats;
  - `responses_page()` gives a searchable, sortable page plus the total count.

  Both are `SECURITY INVOKER`, so RLS decides access (owner, same-department read-only, superadmin). Other
  departments get `form_not_found` or no rows.
- **Summary forms** (chosen by the data's job):
  - **Choice questions** (multiple choice, checkboxes, dropdown): a horizontal bar list in option order, then
    "Other" if used. Every bar shows its count and percentage as text, so color is never the only carrier.
    Checkbox percentages are relative to respondents who answered (they can add up to more than 100%; a note
    says so).
  - **Linear scale:** the average as a headline number, plus a distribution column for every scale value, zeros
    included.
  - **Date:** answers grouped by date, in date order (first 15 shown).
  - **Short answer / paragraph:** the 10 latest answers, plus a link to the table for the rest.
  - Bars are single-series in the brand accent; no legend is needed.
  - These are plain HTML bar lists rather than Recharts: readable at 360 px, accessible as text, and no chart
    library in the builder bundle. Recharts is kept for the Phase 6 time-series charts.
- **Chart palette:** `brand.chartPalette` **fails** the categorical-palette validator (the greys and near-black read
  as grey). Every P0 chart is designed as single-series, so no categorical palette is needed. If a multi-series
  chart is ever added, derive and validate a proper categorical palette first.
- **Deleted questions** with answers are left out of the Summary (it shows the current form). They appear in the
  table and exports as "<title> (deleted question)" columns, so no data silently disappears.
- **Table:**
  - 25 rows per page, paginated on the server.
  - Search: case-insensitive, literal (`%` and `_` are escaped), across answers, name and email.
  - Sort: by submitted time, name, email, or any question's answer.
  - The timestamp column is sticky when scrolling sideways.
  - Times are shown in **Asia/Kuala_Lumpur** (`src/config/app.ts`).
- **Export** (`GET /api/forms/{id}/export?format=csv|xlsx`):
  - Built on the server with the user's session (RLS → 404 for forms the user can't read, 401 when signed out).
  - Rows are oldest first. Columns follow question order. Checkbox answers are joined with "; ".
  - Name/Email columns appear only if some response has them. Timestamps are `YYYY-MM-DD HH:mm:ss` in Malaysia
    time.
  - CSV: UTF-8 with BOM (so Excel shows Indonesian names correctly), CRLF line endings, and cells starting with
    `= + - @` prefixed with `'` (spreadsheet formula-injection guard).
  - XLSX (ExcelJS): bold frozen header, scale answers as numbers, every other answer as a text cell (never a
    formula), sensible column widths.
  - File name: `<title>-responses-<date>.csv|xlsx`.
- Dashboard cards link the response count to `/forms/{id}?tab=responses`. `?tab=` opens any builder tab.
- **Archived forms** show no "Accepting responses" toggle. Restoring them is a superadmin action (Phase 6).
- **Streaming and 404s:** the builder page streams behind its loading skeleton, so a form the user can't see
  renders the "Page not found" view with HTTP 200 (no form data is sent). The API endpoints return real 404s.

## Phase 6 — Secretary pages

- **Defense in depth:** every `/admin` page calls `requireSuperadmin()`, every secretary server action checks the
  role, and every secretary RPC raises `forbidden` for non-superadmins. RLS and triggers still apply underneath.
  The activity log is written by triggers, so it can't be skipped.
- **Overview definitions:**
  - **All-time KPIs:** total forms, open forms, total responses (soft-deleted forms excluded).
  - **In-period KPIs:** forms created, responses received (shown as a hint), and departments active (a form
    created or a response received in the period). Pending approvals is a link to People.
  - **Charts:** forms per department/category/chapter count forms **created in the period**; each bar links to the
    registry pre-filtered. Responses and forms over time are daily for periods of 92 days or less, otherwise
    weekly (Monday weeks), in Malaysia time, with empty buckets shown.
  - **Department table:** forms in period, forms all time, open now, responses in period, and last activity (the
    latest form created/published or response received). It lists **every** active department, including those
    with zero forms, plus archived departments that still have forms.
  - The period filter changes everything except the all-time KPIs.
- **Period filter:** 7 days, **30 days (default)**, this semester, or custom from/to dates (inclusive, max ~3
  years), in Malaysia calendar days. **"This semester" starts on 1 February or 1 September**
  (`src/config/app.ts`, `semesterStartMonths`), an assumption based on Malaysian public universities.
  **Please confirm** with the secretariat; it's a one-line change.
- **Charts are single-series** (see Phase 5): the time series use Recharts (2px line, light area, crosshair
  tooltip, hidden data table for screen readers); counts by category use labelled bar lists.
- **Registry** (`/admin/forms`):
  - Filters live in the URL: department, chapter (including "No chapter"), category, status, creator (including
    "Me"), created-date range, and title search.
  - Sortable by every column. 50 rows per page, served by the server.
  - **Export CSV** contains the whole filtered result (up to 5,000 rows) with a public link column.
  - Deleted forms appear only under Status → "Deleted", where they can be opened and restored.
  - A superadmin's own forms are found with Creator → "Me". "New form" is available here, since `/dashboard`
    redirects superadmins to the overview.
- **Form detail** (`/admin/forms/{id}`):
  - Read-only Overview (details and answering settings), Questions (respondent view) and Responses (the same
    panel as the builder).
  - Actions: close/reopen; archive (an open form is closed first, then archived); restore from archive (back to
    closed); change department/category/chapter; transfer owner (to a non-suspended admin); soft delete/restore;
    save as template; open in builder (superadmins may edit any form).
  - Publishing someone else's draft stays with its owner.
- **People:**
  - Pending admins are listed first with one-click Approve/Reject. **Reject** returns the person to `respondent`
    (PRD §5.2), and they can apply again through onboarding.
  - Suspend/restore, make superadmin / make regular admin, change department, transfer all forms.
  - Transfer-all moves every form the person owns, including drafts and deleted ones, so the account can be
    retired. Each form is logged.
  - **Guards in the database:** a superadmin can't change their own role or status, and the last active
    superadmin can't be demoted or suspended (yearly handover safety).
  - A Supabase auth user who still owns forms can't be hard-deleted (foreign key); transfer their forms first.
- **Departments / chapters / categories:**
  - Add, edit (department color via a color picker) and archive. Categories are deactivated rather than archived.
  - **Delete is offered only when nothing uses the entry**, and the foreign keys refuse it anyway.
  - Archived entries stay on existing forms and reports, and can't be picked in onboarding or for new forms.
    The builder shows them as "(archived)" when already selected.
- **Templates:**
  - The list shows category, question count, **usage count** (forms created from it) and a publish toggle.
  - The editor reuses the builder's question cards, drag-and-drop and autosave.
  - "Save as template" (from the builder for superadmins, or from the form detail page) creates an
    **unpublished** copy and opens it.
  - Deleting a template keeps the forms made from it (their `template_id` becomes null, so usage history is
    lost); unpublishing is the gentler option.
- **Settings:** the "Require approval for new admins" toggle (default on).
- The **activity feed UI** (O10) is P1 and not built; entries are written from day one.
- **Layout fix:** tables scroll inside `relative` wrappers. Without that, an absolutely positioned screen-reader
  label inside a table escaped its scroll container and made the whole page scroll sideways on phones. All admin
  pages were checked at 360 px.
