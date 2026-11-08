# PPIM Form

Google Forms–style form builder for PPI Malaysia (app name: **PPIM Form**), with a secretary dashboard that tracks which department makes
which forms. Specs: [`spec/PPI_Form_PRD.md`](spec/PPI_Form_PRD.md) and
[`spec/PPI_Form_BUILD_PROMPT.md`](spec/PPI_Form_BUILD_PROMPT.md). Assumptions: [`DECISIONS.md`](DECISIONS.md).

Stack: Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 + shadcn/ui · Supabase (Postgres, Google OAuth, RLS) ·
next-intl (EN default, ID) · Vitest.

## How to run the project locally

Locally the app uses a **local Supabase** that runs in Docker on your computer. No Supabase account is needed for
development; a cloud project is only needed for deployment (see *Cloud setup*).

### Prerequisites

- [Node.js](https://nodejs.org) 20.9 or newer (`node -v`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), **started** and running before the database steps
- Git
- A Google OAuth client (ID + secret) for signing in, see step 4. The public form pages work without it.

### First-time setup

**1. Clone and install**

```bash
git clone https://github.com/Zzfathir/ppim-form.git
cd ppim-form
npm install
```

**2. Start the local database** (first run downloads the Supabase Docker images, which takes a few minutes)

```bash
npm run db:start
```

This starts Postgres, Auth, Storage and Studio in Docker and applies every migration in `supabase/migrations`.
When it finishes it prints the local URLs and keys. Show them again any time with `npx supabase status`.

**3. Create `.env.local`**

```bash
cp .env.example .env.local
```

Fill it in with the values from `npx supabase status`:

| `.env.local` variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` (normally `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `PUBLISHABLE_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SECRET_KEY` |
| `SUPERADMIN_EMAILS` | Your Google email (becomes superadmin on first sign-in) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `GOOGLE_*` | Leave empty unless you want Google Sheets sync (see below) |

**4. Set up Google sign-in** (the app only signs in with Google)

```bash
cp supabase/.env.example supabase/.env
```

- Put your Google OAuth client ID and secret in `supabase/.env`.
- In Google Cloud → *Credentials* → your OAuth client, add:
  - Authorized JavaScript origin: `http://localhost:3000`
  - Authorized redirect URI: `http://127.0.0.1:54321/auth/v1/callback`
- Restart the database so it picks up the keys: `npm run db:stop && npm run db:start`

**5. Seed the database**

```bash
npm run db:seed:dev
```

This adds departments (from `spec/seed/departments.json`), chapters, categories, templates, and sample admins,
forms and responses. For base data only, use `npm run db:seed`.

**6. Start the app**

```bash
npm run dev
```

Open <http://localhost:3000> and sign in with Google using the email from `SUPERADMIN_EMAILS`. `/admin` should open.
Supabase Studio (browse tables, no login) is at <http://127.0.0.1:54323>.

### Every day after that

```bash
# 1. Start Docker Desktop and wait until it says "running"
npm run db:start      # data is kept between restarts
npm run dev           # http://localhost:3000
```

To stop: press `Ctrl+C` in the `npm run dev` terminal, then run `npm run db:stop`.

### Troubleshooting

| Problem | Fix |
|---|---|
| `failed to connect to the docker API ... dockerDesktopLinuxEngine` | Docker Desktop isn't running. Start it, wait until it's ready, then retry. |
| Sign-in fails or returns to `/login` | Check `supabase/.env` values and the redirect URI `http://127.0.0.1:54321/auth/v1/callback` in Google Cloud, then `npm run db:stop && npm run db:start`. |
| You signed in but have no admin access | Your email isn't in `SUPERADMIN_EMAILS` in `.env.local`. Add it, restart `npm run dev`, then sign in again. |
| Port 3000 is already in use | Run `npm run dev -- --port 3001` and set `NEXT_PUBLIC_APP_URL` to match. |
| Empty dashboard / no departments | Run `npm run db:seed:dev`. |
| Database is in a bad state | Run `npm run db:reset`. **This erases all local data** and seeds it again. |

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / route typegen + `tsc` |
| `npm test` | Unit tests + database permission tests (needs local Supabase running and seeded) |
| `npm run test:e2e` | Browser tests (Playwright): public form at 360 px, builder, responses, secretary pages, and an accessibility (axe, WCAG 2.1 AA) + no-sideways-scroll sweep of every page at 360 px and desktop. Starts or reuses the dev server on port 3001 (`E2E_PORT` to change). First run: `npx playwright install chromium` |
| `npm run check:messages` | Checks that `messages/en.json` and `messages/id.json` have the same keys |
| `npm run db:seed` | Base data only (departments, chapters, categories, templates); safe to re-run |
| `npm run db:seed:dev` | Base data + sample admins, forms and responses (refuses non-local databases) |
| `npm run db:reset` | Recreate the local DB from migrations and run the dev seed |
| `npm run db:clean-tests` | Remove users/forms/templates left by test runs; keeps real (e.g. Google) accounts and the dev seed |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the local DB |

## Environment variables

See [`.env.example`](.env.example).

| Variable | Where it's used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server (publishable key; RLS protects the data) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only**: public form endpoints, superadmin bootstrap, seed script |
| `SUPERADMIN_EMAILS` | Comma-separated Google emails promoted to superadmin on sign-in |
| `NEXT_PUBLIC_APP_URL` | Base URL used in share links (and the Google Sheets callback) |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Optional: Google Sheets live sync (same OAuth client as sign-in) |
| `GOOGLE_TOKEN_KEY` | Optional: 32-byte base64 key that encrypts stored Google tokens |

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

## Google Sheets live sync (optional)

Lets a form owner connect their Google account and send every response to a spreadsheet in their own Drive.
The button stays hidden until all three `GOOGLE_*` variables are set.

1. Google Cloud → *APIs & Services → Library*: enable **Google Sheets API**.
2. OAuth consent screen → *Data access*: add the scope `https://www.googleapis.com/auth/drive.file` (non-sensitive:
   the app can only see files it created).
3. Your OAuth client (the same one used for sign-in): add the redirect URI `<NEXT_PUBLIC_APP_URL>/api/google/callback`
   (e.g. `http://localhost:3001/api/google/callback` and `https://<your-subdomain>/api/google/callback`).
4. Fill `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `GOOGLE_TOKEN_KEY` (command in `.env.example`).
5. Set the consent screen's *Publishing status* to **In production**. While it says *Testing*, Google expires the
   connection after 7 days and only listed test users can connect.

## Deployment (own hosting, subdomain)

The app is a normal Node.js server (`next build` then `next start`). It is **not** a static site, so the host must
run Node.js 20.9 or newer: a VPS, or shared hosting with a "Setup Node.js App" (cPanel/Passenger) feature. Plain
PHP-only hosting can't run it.

**1. Prepare the services** (once): follow *Cloud setup* above, using your real address, e.g.
`https://form.<your-domain>`:
- Google OAuth client → Authorized JavaScript origins: `https://form.<your-domain>`.
- Supabase → Authentication → URL Configuration → Site URL `https://form.<your-domain>`, redirect URL
  `https://form.<your-domain>/**`.
- Point the subdomain's DNS (an `A` record to the server, or the host's subdomain tool) and turn on HTTPS
  (Let's Encrypt / AutoSSL). Google sign-in requires HTTPS outside localhost.

**2. Configure environment variables** on the server (a `.env.production.local` file next to `package.json`, or the
host's environment panel). Same names as `.env.example`, with cloud values and
`NEXT_PUBLIC_APP_URL=https://form.<your-domain>`. `NEXT_PUBLIC_*` values are baked in at build time: change
them, then rebuild.

**3. Build and run:**

```bash
npm ci
npm run build
npm start -- --port 3000     # or let the host pick: PORT=xxxx npm start
```

- **VPS:** keep it running with a process manager, e.g. `npx pm2 start npm --name ppim-form -- start` then
  `npx pm2 save`; put nginx (or Caddy) in front as a reverse proxy to `127.0.0.1:3000`.
- **cPanel "Setup Node.js App":** Node 20+, application root = this folder, startup file = `server.js` with:
  ```js
  const { createServer } = require("node:http");
  const next = require("next");
  const app = next({ dev: false });
  const handle = app.getRequestHandler();
  app.prepare().then(() => createServer((req, res) => handle(req, res)).listen(process.env.PORT || 3000));
  ```
  Run `npm ci && npm run build` from the app's terminal, then restart the app. Building needs ~1.5 GB of RAM; if the host kills it, build on your own
  computer with the production env file and upload the folder including `.next`.

**Reverse proxy:** rate limiting reads the visitor's IP from the first `X-Forwarded-For` entry, so the proxy in
front of the app must set it (nginx: `proxy_set_header X-Forwarded-For $remote_addr;`). On shared hosting, ask the host or
check that the header arrives. Without it, all visitors share one rate-limit bucket.

**4. Database updates:** whenever a new migration is added, run `npx supabase db push` against the cloud project
before (or right after) deploying the new code. `npm run db:seed` is safe to re-run; it only adds missing base data.

**5. Check after deploying:** sign in with a `SUPERADMIN_EMAILS` account → `/admin` opens; create and publish a form
→ open its link in a private window → submit → the response shows up in the Responses tab.

**Costs:** Supabase Free is enough to start (500 MB database, 1 GB storage for banners). A free project pauses after
a week without traffic; upgrade to Pro (US$25/month) once the app is in real use. Hosting and the domain are your
existing ones.
