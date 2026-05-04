-- GMF Marketing Dashboard — Sprint 1: weekly briefing storage
-- Briefings genereras av Vercel cron varje måndag och sparas här.
-- Synliga för alla autentiserade användare (delas i teamet).

create table if not exists public.briefings (
  id          uuid primary key default gen_random_uuid(),
  generated_for_week_starting date not null,
  title       text not null,
  body        text not null,
  context     jsonb,                 -- råa siffror som matades till boten (för transparens)
  bot_slug    text not null default 'marketing-strategist',
  created_at  timestamptz not null default now()
);

create unique index if not exists briefings_week_idx on public.briefings (generated_for_week_starting);
create index if not exists briefings_created_idx on public.briefings (created_at desc);

alter table public.briefings enable row level security;

drop policy if exists "briefings_auth_select" on public.briefings;
create policy "briefings_auth_select" on public.briefings
  for select to authenticated using (true);

-- Insert tillåts bara via service-key (cron) — ingen client-policy för insert.
-- (Frontend kan därmed inte skapa fake briefings.)
