-- GMF Marketing Dashboard — Sprint 3: kalender + analytics-stöd

alter table public.content_items add column if not exists scheduled_for date;
alter table public.content_items add column if not exists published_at timestamptz;

create index if not exists content_items_scheduled_idx on public.content_items (scheduled_for);
create index if not exists content_items_published_idx on public.content_items (published_at desc);

-- Auto-sätt published_at när status går till publicerad
create or replace function public.set_published_at_on_publish() returns trigger
language plpgsql as $$
begin
  if new.status = 'publicerad' and (old.status is null or old.status <> 'publicerad') and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists content_items_published_at on public.content_items;
create trigger content_items_published_at before update on public.content_items
  for each row execute function public.set_published_at_on_publish();
