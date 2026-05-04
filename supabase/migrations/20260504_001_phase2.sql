-- GMF Marketing Dashboard — Phase 2: competitors + top10 picks

-- =========================================================================
-- competitors
-- =========================================================================
create table if not exists public.competitors (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  country       text not null default '',
  channels      text not null default '',
  what_they_do  text not null default '',
  budget        text not null default '',
  message       text not null default '',
  meta_ads_count integer,
  meta_platform text,
  meta_what     text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists competitors_set_updated_at on public.competitors;
create trigger competitors_set_updated_at before update on public.competitors
  for each row execute function public.set_updated_at();

create index if not exists competitors_sort_order_idx on public.competitors (sort_order);

-- =========================================================================
-- top10_picks — "Vad vi implementerar först" från konkurrentanalysen
-- =========================================================================
create table if not exists public.top10_picks (
  id          uuid primary key default gen_random_uuid(),
  rank        integer not null,
  text        text not null,
  source      text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists top10_picks_set_updated_at on public.top10_picks;
create trigger top10_picks_set_updated_at before update on public.top10_picks
  for each row execute function public.set_updated_at();

create unique index if not exists top10_picks_rank_idx on public.top10_picks (rank);

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.competitors enable row level security;
alter table public.top10_picks enable row level security;

drop policy if exists "competitors_auth_all" on public.competitors;
create policy "competitors_auth_all" on public.competitors
  for all to authenticated using (true) with check (true);

drop policy if exists "top10_picks_auth_all" on public.top10_picks;
create policy "top10_picks_auth_all" on public.top10_picks
  for all to authenticated using (true) with check (true);

-- =========================================================================
-- Seed: 9 konkurrenter + Top 10 från prototypen
-- =========================================================================
insert into public.competitors (slug, name, country, channels, what_they_do, budget, message, meta_ads_count, meta_platform, meta_what, sort_order)
values
  ('finary', 'Finary', 'Frankrike',
   'YouTube (580K subs), LinkedIn (CEO Mounir), Social ads',
   'CEO analyserar riktiga användares portföljer LIVE. Utbildning + underhållning + produktdemo i ett. 75M+ visningar. 2 videos/vecka. Fokuserar ALL marknadsföring på EN kanal.',
   'Organisk (YouTube) + social ads. Inga Meta-annonser.',
   '"Alla sa att pengar var tabu i Frankrike. Jag lyssnade inte." — Financial education för alla, inte bara rika.',
   0, null, 'Fokus på YouTube + social ads (ej Meta)', 0),

  ('republic', 'Republic', 'USA/EU',
   'SEO ("Learn"-sektion), Newsletter, Referral-program, Marketing Studio',
   'Utbildningsinnehåll (guider om crowdfunding, skatt, exitstrategier). Referral: 10 Notes per värvad vän. Marketing Studio hjälper BOLAGEN köra annonser — Republic gör ej egna.',
   'SEO + organic + referral. Hjälper case-bolag med betald annonsering.',
   '"Invest in startups" — demokratisering. Fokus på community (3M+ medlemmar) och utbildning.',
   null, null, 'Hjälper case-bolag köra egna ads via Marketing Studio', 1),

  ('crowdcube', 'Crowdcube', 'UK/EU',
   'Meta ads (6 aktiva), LinkedIn (inkl. showcase "Crowdcube for Investors"), Blog, Webinars',
   'Kör Meta-annonser FÖR enskilda bolag — Stemnovate, London Tunnels etc. Plattformen syns inte, caset syns. Webinar per emission. LinkedIn investor spotlights.',
   '6 aktiva Meta-ads (FB+IG+Messenger). LinkedIn organisk.',
   '"Investing for Impact" — mission-driven. Varje annons har bolagets story, inte Crowdcubes.',
   6, 'FB + IG + Messenger', 'Annonser FÖR enskilda case (Stemnovate, London Tunnels) — bolagen syns, inte plattformen', 2),

  ('tioex', 'Tioex', 'Sverige',
   'LinkedIn (CEO Johan), Investpodden (betald collab), PR via pressmeddelandenen',
   'CEO Johan Hägglund gästar poddar (Investpodden, Techrekpodden). LinkedIn-inlägg om portföljbolag (SpaceX, Anthropic, Klarna). PR genereras av stora investeringar — Northvolt-köpet = massiv press.',
   'Noll betalda annonser. 100% organisk: podd + LinkedIn + PR.',
   '"Pre-IPO tillgång till världens mest intressanta tech-bolag" — exklusivitet för 5000 medlemmar.',
   0, null, 'Ingen betald Meta-annonsering — organisk tillväxt via podd + PR', 3),

  ('seedblink', 'SeedBlink', 'Rumänien → EU',
   'LinkedIn, Blog (kvartalsrapporter), Whitepapers, Tools (pitch deck AI-review, kalkylatorer)',
   'Thought leadership via blogg: "European VCs with fresh funds", "Fintech investment landscape 2025". Investor Learnings Whitepaper. AI-verktyg som lead magnets.',
   'Noll betalda Meta-annonser. 100% content + SEO + partnerskap (Accumeo i Sverige).',
   '"Europe''s Venture Deal Execution Platform" — professionell, tech-forward, paneuropeisk.',
   0, null, 'Ingen betald Meta-annonsering', 4),

  ('mamacrowd', 'Mamacrowd', 'Italien',
   'Meta ads (4 aktiva), LinkedIn, Årlig branschrapport med Politecnico di Milano',
   'Meta-annonser visar SPECIFIKA fastighets-case med exakt avkastning: "4,8% årlig dividendstimering, redan uthyrd fastighet". Branschrapport positionerar dem som thought leader.',
   '4 aktiva Meta-ads (FB+IG). Only Italy.',
   '"Immobiliare a Reddito" (Fastigheter med avkastning) — konkret, siffror, specifikt projekt.',
   4, 'FB + IG', 'Fastighets-case med specifik avkastning ("4,8% årlig dividendstimering") — only Italy', 5),

  ('tessin', 'Tessin', 'Sverige',
   'LinkedIn (2127 följare), Facebook-sida, Nyhetsbrev, SEO',
   'Organiskt fokus: nyhetsbrev med nya lån + avkastning, LinkedIn-uppdateringar. OBS: Multipla lån i default 2024-2025. Trustpilot fulla av klagomål. Tappar trovärdighet.',
   'Noll betalda annonser. Organisk + nyhetsbrev.',
   '"Unlocking Real Estate" — men 2025-problemet: investerare förlorar pengar och varumärket skadas.',
   0, null, 'Ingen betald Meta-annonsering', 6),

  ('moonfare', 'Moonfare', 'Tyskland',
   'Meta ads (79 aktiva!), LinkedIn, Events (50+ i 16 länder), Blog, Bankpartnerskap',
   'TUNG annonsering: 79 aktiva Instagram video-ads. Budskap: "Build institutional-grade portfolio", "Some investors allocate up to 40% to private markets". Ny CMO tillsatt mars 2026. Ny brand lanserad dec 2025.',
   'Största annonsbudget av alla. 79 aktiva Meta-ads + events + bankpartners.',
   '"Private market opportunities built for performance" — premium, exklusivt, "institutional-grade".',
   79, 'Instagram (video)', '"Build your institutional-grade portfolio" — premium-positionering, video-ads med CTA "Learn More"', 7),

  ('kameo', 'Kameo', 'Norden',
   'LinkedIn (separata sidor per land: SE/NO), App, Nello Pay (open banking)',
   'Produktledd tillväxt: ny app + oversubscription-funktion. Lån övertecknas med 200%+. LinkedIn-uppdateringar per land. Organisk via produktkvalitet.',
   'Noll betalda Meta-annonser. Produkt + organisk.',
   '"Investera i säkerställda fastighetslån i Skandinavien" — 9% genomsnittlig nettoavkastning per år.',
   0, null, 'Ingen betald Meta-annonsering', 8)
on conflict (slug) do nothing;

insert into public.top10_picks (rank, text, source) values
  (1, 'LinkedIn: Jonas founder-profil — 2 spår: case + plattform', 'Beslut: LinkedIn som primär kanal nu'),
  (2, 'Spår 1 — Case: Marknadsför KEY Experience (story, team, siffror)', 'Crowdcube + Mamacrowd modellen'),
  (3, 'Spår 2 — Plattform: Features, ECSPR-tillsyn, "så funkar GMF"', 'SeedBlink + Tessins kris = vår USP'),
  (4, 'META-ANNONSER i Sverige — öppet fält, ingen konkurrent kör!', 'Tioex/Tessin/Kameo = 0 betalda annonser'),
  (5, 'Nyhetsbrev med kunskap + case — inte bara "ny emission"', 'Republic newsletter + Tessin nyhetsbrev'),
  (6, 'Video-content på LinkedIn: KEY-presentation, "Jonas analyserar"', 'Moonfare 79 video-ads, Finary 580K YouTube'),
  (7, 'Referral-program — investerare bjuder in investerare', 'Republic: 10 Notes per referral'),
  (8, 'Utbildningssektion på sajten + SEO-bloggar', 'Republic "Learn" + SeedBlink whitepapers/tools'),
  (9, 'Webinar per emission — Andreas presenterar KEY live', 'Crowdcube kör per campaign'),
  (10, 'Branschrapport: "Crowdfunding i Sverige 2026"', 'Mamacrowd + Politecnico di Milano')
on conflict (rank) do nothing;
