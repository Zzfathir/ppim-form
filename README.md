# PPI Form

Google Forms–style form builder for PPI Malaysia, with a secretary dashboard that tracks which department makes
which forms. Specs: [`spec/PPI_Form_PRD.md`](spec/PPI_Form_PRD.md) and
[`spec/PPI_Form_BUILD_PROMPT.md`](spec/PPI_Form_BUILD_PROMPT.md). Assumptions: [`DECISIONS.md`](DECISIONS.md).

Stack: Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 + shadcn/ui · Supabase (Postgres, Google OAuth, RLS) ·
next-intl (EN default, ID) · Vitest.

## Local development

Requirements: Node 20.9+, Docker Desktop (running).

```bash
npm install
npm run db:start      # starts local Supabase in Docker, applies supabase/migrations
cp .env.example .env.local   # then fill in values from `npx supabase status` (see below)
npm run db:seed:dev   # departments (spec/seed/departments.json), chapters, categories, templates + sample data
npm run dev           # http://localhost:3000
```

For local `.env.local`, take `API_URL`, `PUBLISHABLE_KEY` and `SECRET_KEY` from `npx supabase status`.

**Google sign-in locally:** put your Google OAuth client ID and secret in `supabase/.env` (copy from
`supabase/.env.example`). Add `http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI in Google
Cloud, then restart with `npm run db:stop && npm run db:start`.

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / route typegen + `tsc` |
| `npm test` | Unit tests + database permission tests (needs local Supabase running and seeded) |
| `npm run db:seed` | Base data only (departments, chapters, categories, templates); safe to re-run |
| `npm run db:seed:dev` | Base data + sample admins, forms and responses (refuses non-local databases) |
| `npm run db:reset` | Recreate the local DB from migrations and run the dev seed |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the local DB |

## Environment variables

See [`.env.example`](.env.example).

| Variable | Where it's used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server (publishable key; RLS protects the data) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only**: public form endpoints, superadmin bootstrap, seed script |
| `SUPERADMIN_EMAILS` | Comma-separated Google emails promoted to superadmin on sign-in |
| `NEXT_PUBLIC_APP_URL` | Base URL used in share links |

## Cloud setup (Supabase + Google)

1. **Supabase:** create a project. Copy the URL, publishable (anon) key and secret (service_role) key from
   *Project Settings → API*.
2. **Google Cloud:** create an OAuth consent screen (External; scopes `email`, `profile`, `openid`). Then create
   an OAuth client of type *Web application* with:
   - Authorized JavaScript origins: `http://localhost:3000` and your production URL
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. **Supabase → Authentication → Providers:** enable **Google** with that client ID/secret, and **disable Email**
   (the app is Google-only).
4. **Supabase → Authentication → URL Configuration:** set Site URL to your app URL, and add redirect URLs
   `http://localhost:3000/**` and `https://<your-domain>/**`.
5. Apply the schema: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
6. Seed: point `.env.local` at the cloud project and run `npm run db:seed` once (never `db:seed:dev`).

Deployment notes (Vercel) will be completed in the polish phase.
