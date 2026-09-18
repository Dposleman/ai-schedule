# AI Schedule

Shift scheduling, GPS clock-in, absences, transfers and automatic coverage for teams
across multiple locations. A real web app: every piece of data you see (employees,
locations, shifts, absences, clock-ins...) is stored in a database — none of it is
sample data.

Next.js 16 (App Router) + Postgres (via Drizzle ORM) + its own email/password
authentication. Doesn't depend on any OpenAI/Cloudflare service: it's a standard
Next.js project, deployed on Vercel with a Postgres database (Neon).

Live deployment: https://ai-schedule-alpha.vercel.app

## Run locally

```bash
npm install
cp .env.example .env.local   # set AUTH_SECRET and DATABASE_URL to your own values
npm run dev
```

Open http://localhost:3000, click "Create your business" and follow the wizard: this
creates your organization, first location and owner account. From **Accounts** you
can create manager and employee accounts (a temporary password is generated — it's
emailed to the new employee if `RESEND_API_KEY` is configured, otherwise shown once
on screen for you to share).

## Deploying to production

Push to `main` and Vercel redeploys automatically. Required environment variables
(Production and Preview) in the Vercel project settings:

- `DATABASE_URL` — Postgres connection string (provisioned automatically if you use
  Vercel's Neon integration from the Storage tab).
- `AUTH_SECRET` — a long random string used to sign session cookies.
- `RESEND_API_KEY` (optional) — enables real welcome emails for new accounts. Get a
  free key at https://resend.com.
- `EMAIL_FROM` (optional) — sender address for those emails, e.g.
  `AI Schedule <hello@yourdomain.com>`. Falls back to Resend's sandbox sender.
- `NEXT_PUBLIC_APP_URL` (optional) — your deployment's public URL, used for the
  "Sign in" link inside welcome emails.

## What's real right now

- **Accounts & sessions**: email + password with bcrypt hashing, signed session
  cookies. Roles: owner, manager, employee — each one sees and can do only what
  applies to them (enforced on the server too, not just hidden buttons).
- **Language**: the UI ships in English (default) and Danish, with a switcher in the
  sidebar, login and signup screens. The choice is saved per account.
- **Locations & team**: real CRUD, persisted to the database.
- **Planner**: the "Generate week with AI" button runs a real algorithm
  (`lib/scheduler.ts`) that assigns shifts respecting approved leave, each employee's
  marked unavailability, and their weekly hour target, balancing whoever has fewer
  hours assigned. The result is a draft; "Publish week" makes it visible to the team.
- **Absences**: request, approve and reject, with real effect on the planner.
- **Transfers**: move someone from one location to another, temporary or permanent.
- **Automatic coverage**: if a shift is left uncovered, a coverage request opens and
  invites compatible people (same location, available); the first to accept gets the
  shift.
- **Time tracking (GPS clock-in)**: uses the device's location to confirm you're
  inside the location's radius before allowing a clock-in; the record is saved to the
  database.
- **Costs**: calculated for real from shift hours × each employee's hourly rate,
  compared against the budget you set per location. "Export CSV" downloads the actual
  numbers.
- **Schedule export**: the Planner's "Export schedule" button downloads a real CSV of
  the current week's shifts.
- **Welcome emails**: when `RESEND_API_KEY` is set, new accounts receive a real email
  with their sign-in details instead of a one-time on-screen password.
- **Mobile app**: the `mobile/` folder (Capacitor + Vite) is a real native shell around
  the same screens as the web app — its own login flow, session check on launch, and
  every request goes through `lib/api-client.ts` against the deployed API with the
  session cookie carried cross-origin (`SameSite=None`, and `middleware.ts` answers
  CORS preflights for the WebView's origin). GPS clock-in uses `@capacitor/geolocation`.

## Building the mobile app

```bash
npm run build:mobile   # bundles mobile/ with Vite into mobile-dist/
npx cap sync android    # copies mobile-dist into the native Android project
npx cap open android    # opens it in Android Studio to run or build an APK
```

By default the mobile bundle talks to the production deployment
(`https://ai-schedule-alpha.vercel.app`). To point a dev build at a different API,
set `VITE_API_URL` before `build:mobile`. If that API is served from somewhere other
than `https://localhost` (Android's default WebView origin), add its origin to
`ALLOWED_MOBILE_ORIGINS` (comma-separated) in that deployment's environment variables.

## What's still simplified (next phase)

- Payroll export is CSV only for now (no PDF payslips yet).
- The mobile app has been synced into the native Android project once, in this repo;
  it isn't wired into a CI/release pipeline, so a new build+sync is needed after
  future changes to `mobile/` or the shared UI before it reaches a device.

## Structure

```
app/                     UI pages and routes (App Router)
app/api/                 REST endpoints (auth, locations, employees, shifts, absences...)
app/app-shell.tsx        main container for the authenticated app
app/app-shell-views.tsx  the individual screens (Overview, Planner, Team...)
app/language-context.tsx language provider/hook (EN/DA)
lib/i18n.ts              translation dictionaries
db/schema.ts             database schema (Drizzle ORM)
db/index.ts              Postgres connection + table creation
lib/auth.ts              sessions, password hashing
lib/scheduler.ts         shift-generation algorithm
lib/email.ts             welcome emails (Resend)
lib/api-client.ts        fetch helper shared by web and mobile (adds the API base URL + credentials on mobile)
mobile/                  Capacitor + Vite native app shell (own login screen, same UI components)
```
