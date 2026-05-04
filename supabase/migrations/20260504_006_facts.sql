-- Sprint 4: case extracted_facts (AI läser pitch deck och fyller i bolagsfakta)

alter table public.cases add column if not exists extracted_facts jsonb;
alter table public.cases add column if not exists facts_extracted_at timestamptz;
