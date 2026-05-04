-- GMF Marketing Dashboard — Sprint 2: Cases, dokument, approval, MailerLite-koppling
--
-- 1. cases — bolag som vi hjälper med marknadsföring av deras emission
-- 2. case_documents — pitchdeck, IFB, financials etc per case (Supabase Storage)
-- 3. content_items.case_id — kopplar content till specifikt case
-- 4. content_comments — bot/team-feedback inline på content-items (approval workflow)
-- 5. storage bucket "case-documents" + RLS
-- 6. content_items.mailerlite_campaign_id — koppling till skapade MailerLite-utkast

-- =========================================================================
-- cases
-- =========================================================================
create table if not exists public.cases (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  sector          text not null default '',
  description     text not null default '',
  target_amount_sek bigint,
  emission_open   date,
  emission_close  date,
  status          text not null default 'prospect' check (status in ('prospect', 'onboarding', 'active', 'closed', 'paused')),
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  logo_url        text,
  marketing_plan  jsonb,                 -- AI-genererad plan
  plan_generated_at timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists cases_set_updated_at on public.cases;
create trigger cases_set_updated_at before update on public.cases
  for each row execute function public.set_updated_at();

create index if not exists cases_status_idx on public.cases (status);
create index if not exists cases_emission_close_idx on public.cases (emission_close);

-- =========================================================================
-- case_documents — metadata; själva filerna i Supabase Storage
-- =========================================================================
create table if not exists public.case_documents (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public.cases(id) on delete cascade,
  file_name     text not null,
  file_path     text not null,            -- path i storage bucket "case-documents"
  file_type     text,                     -- MIME
  file_size     bigint,
  description   text,
  uploaded_by   uuid references auth.users(id) on delete set null,
  uploaded_at   timestamptz not null default now()
);

create index if not exists case_documents_case_idx on public.case_documents (case_id);

-- =========================================================================
-- content_items.case_id + mailerlite_campaign_id
-- =========================================================================
alter table public.content_items add column if not exists case_id uuid references public.cases(id) on delete set null;
alter table public.content_items add column if not exists mailerlite_campaign_id text;
alter table public.content_items add column if not exists mailerlite_dashboard_url text;

create index if not exists content_items_case_idx on public.content_items (case_id);

-- =========================================================================
-- content_comments — bot- och team-feedback inline på content-items
-- =========================================================================
create table if not exists public.content_comments (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  author_id       uuid references auth.users(id) on delete set null,
  author_email    text,
  author_kind     text not null default 'user' check (author_kind in ('user', 'bot')),
  bot_slug        text,                   -- om author_kind = 'bot'
  body            text not null,
  created_at      timestamptz not null default now()
);

create index if not exists content_comments_item_idx on public.content_comments (content_item_id, created_at);

-- =========================================================================
-- RLS — alla autentiserade får full åtkomst (Phase 1-policy fortfarande)
-- =========================================================================
alter table public.cases enable row level security;
alter table public.case_documents enable row level security;
alter table public.content_comments enable row level security;

drop policy if exists "cases_auth_all" on public.cases;
create policy "cases_auth_all" on public.cases
  for all to authenticated using (true) with check (true);

drop policy if exists "case_documents_auth_all" on public.case_documents;
create policy "case_documents_auth_all" on public.case_documents
  for all to authenticated using (true) with check (true);

drop policy if exists "content_comments_auth_all" on public.content_comments;
create policy "content_comments_auth_all" on public.content_comments
  for all to authenticated using (true) with check (true);

-- =========================================================================
-- Storage bucket: case-documents
-- =========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-documents',
  'case-documents',
  false,
  20971520,  -- 20 MB
  array['application/pdf', 'text/plain', 'text/markdown', 'text/csv',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/png', 'image/jpeg']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "case_docs_auth_select" on storage.objects;
create policy "case_docs_auth_select" on storage.objects
  for select to authenticated using (bucket_id = 'case-documents');

drop policy if exists "case_docs_auth_insert" on storage.objects;
create policy "case_docs_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'case-documents');

drop policy if exists "case_docs_auth_update" on storage.objects;
create policy "case_docs_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'case-documents');

drop policy if exists "case_docs_auth_delete" on storage.objects;
create policy "case_docs_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'case-documents');

-- =========================================================================
-- Seed: 1 exempel-case (KEY Experience) så användaren ser något direkt
-- =========================================================================
insert into public.cases (slug, name, sector, description, target_amount_sek, emission_open, emission_close, status, contact_name)
values
  ('key-experience', 'KEY Experience', 'Upplevelseindustri',
   'Premium upplevelseplattform — vår första aktiva emission på GMF.',
   5000000, '2026-04-15', '2026-05-29', 'active', 'Andreas')
on conflict (slug) do nothing;
