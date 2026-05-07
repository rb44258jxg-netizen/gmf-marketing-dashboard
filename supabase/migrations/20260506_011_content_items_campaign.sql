-- Lägg till campaign-fält på content_items så att kampanj-filtret på Plan-sidan
-- kan filtrera både content och activities (och inte längre döljer items när
-- en kampanj är vald). Bakgrund: live-test 2026-05-06 — buggen "content_items
-- har ingen kampanj-koppling" som tidigare hint visade på Plan.
--
-- Mön: nullable text-fält. Existerande rader får null, framtida rader kan sätta
-- värdet via Content-formuläret eller via SQL.

alter table content_items add column if not exists campaign text;

-- Indexering — vi filtrerar ofta på campaign + scheduled_for ihop, och campaign
-- kan ha ~20-100 unika värden i den färdiga datamodellen.
create index if not exists content_items_campaign_idx on content_items (campaign);
