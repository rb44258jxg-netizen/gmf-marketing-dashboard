-- Sprint A: marketing_activities — generell aktivitetstabell.
--
-- content_items täcker enbart "innehåll vi skriver" (blogg, linkedin-post,
-- email-text, web-copy, annonsutkast). marketing_activities täcker resten:
-- schemalagda social-posts, e-postkampanjer, betalda annonser, events, pr.
--
-- Plan-sidan (/plan) renderar BÅDA tabellerna på samma kalender så team:et
-- ser allt på en plats.

create table if not exists public.marketing_activities (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('social_post', 'email_campaign', 'ad', 'event', 'pr', 'other')),
  channel       text,                    -- linkedin, meta_fb, meta_ig, twitter, mailerlite, blog, etc.
  title         text not null,
  description   text,
  body          text,                    -- copy/innehåll som ska publiceras
  scheduled_for date,
  published_at  timestamptz,
  status        text not null default 'planerad' check (status in ('planerad', 'redo', 'publicerad', 'inställd')),
  campaign      text,                    -- enkel kampanj-tag tills vi har campaigns-tabell
  case_id       uuid references public.cases(id) on delete set null,
  owner         text,
  external_url  text,                    -- url efter publicering
  metrics       jsonb,                   -- post-publication-stats
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists marketing_activities_scheduled_idx
  on public.marketing_activities (scheduled_for);
create index if not exists marketing_activities_type_idx
  on public.marketing_activities (type);
create index if not exists marketing_activities_case_idx
  on public.marketing_activities (case_id);

-- Auto-uppdatera updated_at
create or replace function public.set_marketing_activities_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists marketing_activities_set_updated_at on public.marketing_activities;
create trigger marketing_activities_set_updated_at before update on public.marketing_activities
  for each row execute function public.set_marketing_activities_updated_at();

-- Auto-sätt published_at när status går till 'publicerad'
create or replace function public.set_marketing_activities_published_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'publicerad' and (old.status is null or old.status <> 'publicerad') and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists marketing_activities_published_at on public.marketing_activities;
create trigger marketing_activities_published_at before update on public.marketing_activities
  for each row execute function public.set_marketing_activities_published_at();

-- RLS: alla auth-användare kan läsa, skapa, uppdatera. Inga deletes från frontend.
alter table public.marketing_activities enable row level security;

drop policy if exists "marketing_activities_auth_select" on public.marketing_activities;
create policy "marketing_activities_auth_select" on public.marketing_activities
  for select to authenticated using (true);

drop policy if exists "marketing_activities_auth_insert" on public.marketing_activities;
create policy "marketing_activities_auth_insert" on public.marketing_activities
  for insert to authenticated with check (true);

drop policy if exists "marketing_activities_auth_update" on public.marketing_activities;
create policy "marketing_activities_auth_update" on public.marketing_activities
  for update to authenticated using (true) with check (true);

drop policy if exists "marketing_activities_auth_delete" on public.marketing_activities;
create policy "marketing_activities_auth_delete" on public.marketing_activities
  for delete to authenticated using (true);
