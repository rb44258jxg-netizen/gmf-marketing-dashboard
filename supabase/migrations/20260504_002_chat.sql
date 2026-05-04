-- GMF Marketing Dashboard — Phase 2 chat: marketing bots
-- chat_threads = en konversation, bunden till ett bot + en användare
-- chat_messages = enskilda meddelanden i tråden

create table if not exists public.chat_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  bot_slug    text not null,
  title       text not null default 'Ny konversation',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists chat_threads_set_updated_at on public.chat_threads;
create trigger chat_threads_set_updated_at before update on public.chat_threads
  for each row execute function public.set_updated_at();

create index if not exists chat_threads_user_idx on public.chat_threads (user_id, updated_at desc);
create index if not exists chat_threads_bot_idx on public.chat_threads (bot_slug);

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.chat_threads(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

-- RLS — varje användare ser bara sina egna trådar och meddelanden
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chat_threads_owner_all" on public.chat_threads;
create policy "chat_threads_owner_all" on public.chat_threads
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "chat_messages_owner_select" on public.chat_messages;
create policy "chat_messages_owner_select" on public.chat_messages
  for select to authenticated using (
    exists (select 1 from public.chat_threads t where t.id = chat_messages.thread_id and t.user_id = auth.uid())
  );

drop policy if exists "chat_messages_owner_insert" on public.chat_messages;
create policy "chat_messages_owner_insert" on public.chat_messages
  for insert to authenticated with check (
    exists (select 1 from public.chat_threads t where t.id = chat_messages.thread_id and t.user_id = auth.uid())
  );

drop policy if exists "chat_messages_owner_delete" on public.chat_messages;
create policy "chat_messages_owner_delete" on public.chat_messages
  for delete to authenticated using (
    exists (select 1 from public.chat_threads t where t.id = chat_messages.thread_id and t.user_id = auth.uid())
  );
