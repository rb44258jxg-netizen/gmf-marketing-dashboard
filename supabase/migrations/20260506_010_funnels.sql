-- Sprint B.1: Funnels — automatiserade marknadsförings-tunnlar för
-- investerare och projektägare som registrerar sig på finance.greenmerc.com.
--
-- Datamodell:
--   funnels         — definitioner (en per kind, versionshanterad)
--   funnel_steps    — stegen i en funnel (delay, type, channel, body)
--   audience_members — leads/personer vi följer
--   audience_events  — händelseloggen per person

-- ----------------------------------------------------------------------------
-- funnels (definitioner)
-- ----------------------------------------------------------------------------
create table if not exists public.funnels (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('investor', 'project_owner')),
  name         text not null,
  description  text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists funnels_kind_idx on public.funnels (kind, active);

-- ----------------------------------------------------------------------------
-- funnel_steps (sekvens)
-- ----------------------------------------------------------------------------
create table if not exists public.funnel_steps (
  id           uuid primary key default gen_random_uuid(),
  funnel_id    uuid not null references public.funnels(id) on delete cascade,
  step_index   int not null,                            -- 1, 2, 3, ...
  delay_days   int not null default 0,                  -- dagar efter joined_funnel_at
  type         text not null check (type in ('email', 'linkedin_dm', 'team_review', 'tag_event', 'wait')),
  title        text not null,
  description  text,
  channel      text,                                    -- 'mailerlite', 'linkedin', 'manual'
  template_id  text,                                    -- MailerLite-template-id om tillämpligt
  body         text,                                    -- copy om manuell
  unique (funnel_id, step_index)
);

create index if not exists funnel_steps_funnel_idx on public.funnel_steps (funnel_id, step_index);

-- ----------------------------------------------------------------------------
-- audience_members (leads vi följer)
-- ----------------------------------------------------------------------------
create table if not exists public.audience_members (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null check (kind in ('investor', 'project_owner')),
  external_id        text,                              -- ID från finance.greenmerc.com/admin
  email              text,
  full_name          text,
  phone              text,
  registered_at      timestamptz,                       -- när de reggade sig på finance-sidan
  joined_funnel_at   timestamptz not null default now(),

  funnel_id          uuid references public.funnels(id) on delete set null,
  current_step       int not null default 0,
  status             text not null default 'aktiv' check (status in ('aktiv', 'pausad', 'konverterad', 'borttagen')),

  -- Spårning + segmentering
  segment_tags       text[] default '{}',
  source             text,                              -- 'finance.greenmerc.com', 'linkedin', 'manuell', 'csv'
  notes              text,

  -- Konvertering
  converted_at       timestamptz,
  conversion_value   numeric,                           -- t.ex. första investeringsbelopp

  -- Integration
  mailerlite_subscriber_id text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists audience_members_kind_idx on public.audience_members (kind, status);
create index if not exists audience_members_email_idx on public.audience_members (email);
create index if not exists audience_members_funnel_idx on public.audience_members (funnel_id, current_step);

-- updated_at-trigger
create or replace function public.set_audience_members_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists audience_members_set_updated_at on public.audience_members;
create trigger audience_members_set_updated_at before update on public.audience_members
  for each row execute function public.set_audience_members_updated_at();

-- ----------------------------------------------------------------------------
-- audience_events (händelseloggen)
-- ----------------------------------------------------------------------------
create table if not exists public.audience_events (
  id                 uuid primary key default gen_random_uuid(),
  audience_member_id uuid not null references public.audience_members(id) on delete cascade,
  funnel_step_id     uuid references public.funnel_steps(id) on delete set null,
  event_type         text not null check (event_type in ('joined', 'step_started', 'step_completed', 'step_skipped', 'opened', 'clicked', 'converted', 'manual_note', 'mailerlite_synced')),
  occurred_at        timestamptz not null default now(),
  data               jsonb
);

create index if not exists audience_events_member_idx on public.audience_events (audience_member_id, occurred_at desc);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.funnels enable row level security;
alter table public.funnel_steps enable row level security;
alter table public.audience_members enable row level security;
alter table public.audience_events enable row level security;

-- Auth-användare kan läsa, skapa, uppdatera. Inga deletes från frontend
-- (ändra status till 'borttagen' istället) — utom på funnel_steps under
-- editor-flow.

drop policy if exists "funnels_auth_all" on public.funnels;
create policy "funnels_auth_all" on public.funnels
  for all to authenticated using (true) with check (true);

drop policy if exists "funnel_steps_auth_all" on public.funnel_steps;
create policy "funnel_steps_auth_all" on public.funnel_steps
  for all to authenticated using (true) with check (true);

drop policy if exists "audience_members_auth_select" on public.audience_members;
create policy "audience_members_auth_select" on public.audience_members
  for select to authenticated using (true);

drop policy if exists "audience_members_auth_insert" on public.audience_members;
create policy "audience_members_auth_insert" on public.audience_members
  for insert to authenticated with check (true);

drop policy if exists "audience_members_auth_update" on public.audience_members;
create policy "audience_members_auth_update" on public.audience_members
  for update to authenticated using (true) with check (true);

drop policy if exists "audience_events_auth_select" on public.audience_events;
create policy "audience_events_auth_select" on public.audience_events
  for select to authenticated using (true);

drop policy if exists "audience_events_auth_insert" on public.audience_events;
create policy "audience_events_auth_insert" on public.audience_events
  for insert to authenticated with check (true);

-- ----------------------------------------------------------------------------
-- Seed: två default-funnels (investor + project_owner)
-- ----------------------------------------------------------------------------
do $$
declare
  v_inv_id uuid;
  v_po_id  uuid;
begin
  -- Investor-funnel — 7 steg, 30 dagar, all digital
  insert into public.funnels (kind, name, description, active)
  values ('investor', 'GMF Investerar-tunnel v1',
          'Default 30-dagars nurture-tunnel för nya investerare som reggar sig på finance.greenmerc.com. Bara digitala touchpoints.',
          true)
  returning id into v_inv_id;

  insert into public.funnel_steps (funnel_id, step_index, delay_days, type, title, description, channel, template_id) values
    (v_inv_id, 1, 0,  'email',       'Välkomstmail',                  'Välkommen till GMF — så fungerar plattformen',                   'mailerlite', null),
    (v_inv_id, 2, 2,  'email',       'Värde-mail #1: Vad är ECSPR',   'Förklara EU:s crowdfunding-regelverk och varför GMF är i framkant', 'mailerlite', null),
    (v_inv_id, 3, 5,  'email',       'Värde-mail #2: Case-studies',   'Tre exempel på framgångsrika emissioner via GMF',                'mailerlite', null),
    (v_inv_id, 4, 7,  'email',       'Aktuella case-invite',          'Visa öppna emissioner just nu, CTA till plattformen',            'mailerlite', null),
    (v_inv_id, 5, 14, 'email',       'FAQ + lägre tröskel',           'Svara på vanliga invändningar, visa minimum-investering',        'mailerlite', null),
    (v_inv_id, 6, 21, 'email',       'Nytt case + påminnelse',        'Highlight ett aktuellt case som passar deras profil',            'mailerlite', null),
    (v_inv_id, 7, 30, 'email',       'Final nudge',                   'Sista nudge — bli medlem på riktigt eller hör av dig',           'mailerlite', null);

  -- Project owner-funnel — 5 steg, snabbare. Onboarding-skill tar över efter dag 7.
  insert into public.funnels (kind, name, description, active)
  values ('project_owner', 'GMF Projektägar-tunnel v1',
          'Default tunnel för bolag som söker kapital via GMF. Onboarding-spec lever i Onboarding-skill.',
          true)
  returning id into v_po_id;

  insert into public.funnel_steps (funnel_id, step_index, delay_days, type, title, description, channel, template_id) values
    (v_po_id, 1, 0, 'email',       'Välkomstmail till projektägare',  'Vad händer härnäst — KYC, IFB, screening',                       'mailerlite', null),
    (v_po_id, 2, 1, 'email',       'KYC-bekräftelse + IFB-länk',      'Skicka in KYC-dokument och fyll i IFB-formulär',                 'mailerlite', null),
    (v_po_id, 3, 3, 'email',       'Påminnelse om missing docs',      'Bara om vissa dokument saknas',                                  'mailerlite', null),
    (v_po_id, 4, 5, 'team_review', 'Manuell screening-trigger',       'Teamet screenar caset i dashboarden (Cases-fliken)',             'manual',     null),
    (v_po_id, 5, 7, 'email',       'Screening-resultat',              'Antingen go (case live på plattformen) eller no-go med feedback',  'mailerlite', null);
end $$;
