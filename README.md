# GMF Marketing Dashboard

GreenMerc Finance marketing team's internal workspace — personas, content library, and audit log.

**Stack:** Vite + React 18 + TypeScript · Supabase (Auth + Postgres + RLS) · Vercel.
**Design:** matches `finance.greenmerc.com` — Manrope, deep teal `#1d8775`, mint `#72cab8`.

## Phase 1 (this build)

- ✅ Auth — Supabase email + password (signup/signin)
- ✅ Personas — editable cards (Karin, Per, Oscar by default), persisted
- ✅ Content library — CRUD + status pipeline (utkast → granskning → redo → publicerad)
- ✅ Audit log — every mutation logged with actor, before/after diff

Phase 2 will add MailerLite + social channels. Phase 3 adds calendar + competitor refresh.

---

## Local setup

### 1. Create a Supabase project

1. https://supabase.com/dashboard → New project (free tier is enough).
2. Project Settings → API → copy **Project URL** and **anon/public key**.

### 2. Run the migration

In Supabase Studio → **SQL editor** → New query → paste the contents of
[`supabase/migrations/20260504_000_init.sql`](supabase/migrations/20260504_000_init.sql) → Run.

This creates the `personas`, `content_items`, and `audit_log` tables with row-level security
and seeds the three default personas + nine content items from the prototype.

### 3. Configure auth

Supabase Studio → **Authentication → Providers**: keep email enabled.
For team-only access, **Authentication → Settings → User Signups → Disable** once your team
has signed up. RLS then continues to allow them in.

### 4. Configure env + run

```bash
cp .env.example .env
# Edit .env with your Supabase URL + anon key
npm install
npm run dev          # http://localhost:5173
```

First time: open the app, click **"Skapa ett här"**, register with a team email.
Confirm via the email Supabase sends, then sign in.

---

## Deploy to Vercel

```bash
# Vercel will auto-detect Vite
vercel              # or: connect the repo in vercel.com
```

In Vercel project settings → **Environment Variables**:

- `VITE_SUPABASE_URL` = your Supabase URL
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon key

`vercel.json` already rewrites all paths to `/` so client-side routing works on refresh.

---

## Project layout

```
src/
  main.tsx             # entry, BrowserRouter, AuthProvider
  App.tsx              # auth gate + route table
  components/
    Layout.tsx         # header (logo + email + signout) + tabs
  pages/
    Login.tsx          # signin/signup
    Overview.tsx       # KPIs + quick links
    Personas.tsx       # editable persona cards
    Content.tsx        # CRUD content library + pipeline
    Audit.tsx          # read-only audit log w/ diff
  lib/
    supabase.ts        # client
    auth.tsx           # AuthProvider + useAuth hook
    audit.ts           # logAudit() — call after every mutation
    database.types.ts  # row/insert/update types

supabase/
  migrations/
    20260504_000_init.sql   # tables + RLS + seed

public/
  logo-deep-teal.png  # GreenMerc logo (mirrored from finance.greenmerc.com)

styles.css            # design tokens — sourced from finance.greenmerc.com
```

## Audit log convention

Every mutation route calls `logAudit({ action, entity_type, entity_id, before, after })`.

Action format: `<entity>.<verb>` — `persona.update`, `content.create`,
`content.update`, `content.delete`, `content.status`.

The audit table has insert + select policies for any authenticated user, but no update or
delete policies — the log is append-only at the database level.

## Adding new fields

When adding a column to `personas` or `content_items`:

1. Add to `database.types.ts` (Row + Insert).
2. Add to the migration as `alter table ... add column ...`.
3. Wire into the form in the relevant page.
4. The audit log captures it automatically since it stores the full row in `before` / `after`.
