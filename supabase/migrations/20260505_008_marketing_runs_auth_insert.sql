-- Step 3: tillåt auth-användare att INSERT i marketing_runs (paste-form på /runs).
-- Tidigare gick alla skrivningar via service-key (cron / /api/ingest-run).
-- Nu i "humans-only mode" gör team:et insert direkt från frontend.

drop policy if exists "marketing_runs_auth_insert" on public.marketing_runs;
create policy "marketing_runs_auth_insert" on public.marketing_runs
  for insert to authenticated with check (true);

-- Behåll select-policyn som finns sedan tidigare. Ingen update/delete tillåts
-- från frontend — körningar är immutabla; behöver de korrigeras gör man det
-- via en ny rad (upsert har unique på run_type+run_for_date).
