-- Sprint 5: marketing_runs — output från schemalagda marketing-körningar
-- (daily brief, weekly content plan, Friday review). Tidigare låg outputen
-- i Slack #marketing-gmf och i Slack-canvas; nu landar allt i dashboarden.
--
-- Skrivs alltid via service-key (server-side, /api/ingest-run). Frontend
-- har bara select.

create table if not exists public.marketing_runs (
  id            uuid primary key default gen_random_uuid(),
  run_type      text not null check (run_type in ('daily-brief', 'weekly-content-plan', 'weekly-review')),
  run_for_date  date not null,
  title         text not null,
  summary       text,
  body_markdown text not null,
  metrics       jsonb,
  items         jsonb,
  bot_slug      text,
  created_at    timestamptz not null default now()
);

create unique index if not exists marketing_runs_type_date_idx
  on public.marketing_runs (run_type, run_for_date);

create index if not exists marketing_runs_created_idx
  on public.marketing_runs (created_at desc);

alter table public.marketing_runs enable row level security;

drop policy if exists "marketing_runs_auth_select" on public.marketing_runs;
create policy "marketing_runs_auth_select" on public.marketing_runs
  for select to authenticated using (true);

-- Insert sker bara via service-key (ingest-endpoint); ingen client-policy.
