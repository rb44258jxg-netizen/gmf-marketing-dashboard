-- GMF Marketing Dashboard — Phase 1 schema
-- Run in the Supabase SQL editor (or via supabase CLI: supabase db push)

-- =========================================================================
-- Helper: keep updated_at fresh
-- =========================================================================
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
-- personas
-- =========================================================================
create table if not exists public.personas (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  age          integer not null,
  title        text not null,
  avatar_bg    text not null default '#1d8775',
  avatar_letter text not null,
  badge        text not null default '',
  badge_class  text not null default 'badge-gray',
  role         text not null default '',
  portfolio    text not null default '',
  investment   text not null default '',
  behavior     text not null default '',
  triggers     text not null default '',
  objection    text not null default '',
  channels     text[] not null default '{}',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists personas_set_updated_at on public.personas;
create trigger personas_set_updated_at before update on public.personas
  for each row execute function public.set_updated_at();

create index if not exists personas_sort_order_idx on public.personas (sort_order);

-- =========================================================================
-- content_items
-- =========================================================================
create table if not exists public.content_items (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  type        text not null check (type in ('blogg', 'linkedin', 'email', 'annons', 'web')),
  status      text not null default 'utkast' check (status in ('utkast', 'granskning', 'redo', 'publicerad')),
  track       text check (track in ('case', 'platform', 'internal')),
  file        text,
  notes       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists content_items_set_updated_at on public.content_items;
create trigger content_items_set_updated_at before update on public.content_items
  for each row execute function public.set_updated_at();

create index if not exists content_items_type_idx on public.content_items (type);
create index if not exists content_items_status_idx on public.content_items (status);
create index if not exists content_items_created_at_idx on public.content_items (created_at desc);

-- =========================================================================
-- audit_log — append-only history of all mutations
-- =========================================================================
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  action       text not null,             -- e.g. 'persona.update', 'content.create'
  entity_type  text not null,             -- 'persona' | 'content_item'
  entity_id    uuid,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id);

-- =========================================================================
-- Row Level Security
-- =========================================================================
-- Phase 1 policy: any authenticated user can read + write the marketing data.
-- Audit log is append-only: insert allowed for authenticated, no update/delete.
-- Tighten with role-based policies in a later phase.

alter table public.personas       enable row level security;
alter table public.content_items  enable row level security;
alter table public.audit_log      enable row level security;

drop policy if exists "personas_auth_all" on public.personas;
create policy "personas_auth_all" on public.personas
  for all to authenticated using (true) with check (true);

drop policy if exists "content_items_auth_all" on public.content_items;
create policy "content_items_auth_all" on public.content_items
  for all to authenticated using (true) with check (true);

drop policy if exists "audit_log_auth_select" on public.audit_log;
create policy "audit_log_auth_select" on public.audit_log
  for select to authenticated using (true);

drop policy if exists "audit_log_auth_insert" on public.audit_log;
create policy "audit_log_auth_insert" on public.audit_log
  for insert to authenticated with check (true);

-- =========================================================================
-- Seed: 3 personas + 9 content items from the prototype
-- =========================================================================
insert into public.personas (slug, name, age, title, avatar_bg, avatar_letter, badge, badge_class, role, portfolio, investment, behavior, triggers, objection, channels, sort_order)
values
  ('karin', 'Karin Norberg', 38, 'Den medvetna diversifieraren', '#72cab8', 'K',
   'Primär målgrupp', 'badge-green',
   'Controller på medelstort företag, bor i Stockholm',
   '500k–1.5M SEK. Avanza sedan 2018. Fonder, ETF:er, enstaka aktier.',
   '10 000–50 000 kr per emission. Investerar privat.',
   'Läser RikaTillsammans, Placera Forum, DI. Googlar "onoterade aktier risk". Vill ha fakta, inte hype.',
   'FI-tillsyn, investeringsfaktablad, transparent avgiftsstruktur, ECSPR-auktorisation',
   '"Hur vet jag att detta inte är Pepins 2.0?"',
   array['LinkedIn', 'Forum', 'Nyhetsbrev', 'Poddar'], 0),
  ('per', 'Per Sandström', 46, 'Bolagsinvesteraren', '#1d8775', 'P',
   'Störst belopp', 'badge-purple',
   'Äger konsultbolag, investerar via holdingbolag',
   '2M+ SEK. Aktiv på Nyemissioner.se, Tioex, ängelnätverk.',
   '50 000–500 000 kr via AB. Skatteoptimerar.',
   'Kollar pitch decks, frågar om churn och CAC. Vill se att andra professionella investerat.',
   'Professionellt pitch deck, andra AB-investerare redan inne, exitstrategi (IPO/förvärv)',
   '"Crowdfunding = amatörer som samlar 50-kronor?"',
   array['LinkedIn', 'Nyemissioner.se', 'Events', 'Branschnätverk'], 1),
  ('oscar', 'Oscar Ahlström', 28, 'Den digitala early adoptern', '#e4d6f5', 'O',
   'Fas 2-målgrupp', 'badge-blue',
   'Utvecklare på techbolag, bor i Göteborg',
   '50k–200k SEK. Avanza sedan gymnasiet. Fonder + meme stocks.',
   '500–5 000 kr. Låg tröskel, hög nyfikenhet.',
   'Reddit, Discord, YouTube-finfluencers. Gillar clean UX och snabb onboarding.',
   'Lågt minimum, snygg app/UX, "investera i 3 klick", socialt bevis från tech-folk',
   '"Varför inte bara köpa en ETF?"',
   array['Reddit', 'Discord', 'YouTube', 'Instagram'], 2)
on conflict (slug) do nothing;

insert into public.content_items (title, type, status, track, file)
values
  ('[CASE] GreenMerc Finance lanserar — ny era för crowdfunding', 'blogg', 'redo', 'case', 'blogg_1_gmf_lansering.md'),
  ('[CASE] Så gör vi due diligence på varje bolag', 'blogg', 'redo', 'case', 'blogg_2_due_diligence.md'),
  ('[CASE] LinkedIn: Founder Story V2', 'linkedin', 'granskning', 'case', null),
  ('[CASE] LinkedIn: Sajt-lansering', 'linkedin', 'granskning', 'case', null),
  ('[CASE] Lanseringsmail till investerare', 'email', 'utkast', 'case', null),
  ('[CASE] Welcome email (MailerLite automation)', 'email', 'publicerad', 'case', null),
  ('[PLATTFORM] ECSPR — så skyddar regelverket dig som investerare', 'blogg', 'redo', 'platform', 'blogg_3_ecspr_reglering.md'),
  ('Målgruppsanalys — Crowdfunding Sverige', 'web', 'redo', 'internal', 'GMF_Målgruppsanalys_Crowdfunding_Sverige.md'),
  ('Konkurrentanalys — Steal With Pride', 'web', 'redo', 'internal', 'GMF_Konkurrentanalys_Steal_With_Pride.md')
on conflict do nothing;
