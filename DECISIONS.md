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
