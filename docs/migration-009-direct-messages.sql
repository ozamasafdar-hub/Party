-- ============================================================================
-- WYN — Migration 009: direct messages
--
-- A second kind of conversation alongside the per-event group chat: 1:1
-- threads between any two members. Event chat is untouched — its
-- `messages.event_id` is NOT NULL against `events`, so DMs need their own
-- tables rather than a polymorphic column.
--
-- A thread stores its pair canonically (member_a < member_b) behind a
-- unique constraint, so two people opening a thread with each other at the
-- same moment cannot create two rows.
--
-- Everything here is participant-only at the database level. Blocking is
-- enforced in the insert policy, not just hidden in the UI.
--
-- Run ONCE in the Supabase SQL Editor, after migration 008.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table if not exists public.dm_threads (
  id              uuid primary key default gen_random_uuid(),
  member_a        uuid not null references public.profiles (id) on delete cascade,
  member_b        uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz,
  last_body       text,
  created_at      timestamptz not null default now(),
  -- one row per pair, whichever of the two opened it
  constraint dm_threads_pair_ordered check (member_a < member_b),
  constraint dm_threads_pair_unique unique (member_a, member_b)
);

create index if not exists dm_threads_a_idx on public.dm_threads (member_a, last_message_at desc);
create index if not exists dm_threads_b_idx on public.dm_threads (member_b, last_message_at desc);

create table if not exists public.dm_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.dm_threads (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_thread_idx on public.dm_messages (thread_id, created_at);

-- Unread is computed as "messages newer than my read_at" rather than
-- stored as a counter, so it can never drift out of sync.
create table if not exists public.dm_reads (
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  read_at   timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.dm_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ----------------------------------------------------------------------------
-- Row level security — participants only, in every direction
-- ----------------------------------------------------------------------------

alter table public.dm_threads  enable row level security;
alter table public.dm_messages enable row level security;
alter table public.dm_reads    enable row level security;
alter table public.dm_blocks   enable row level security;

drop policy if exists "participants read threads" on public.dm_threads;
create policy "participants read threads" on public.dm_threads
  for select using (auth.uid() in (member_a, member_b));

-- Threads are created through open_dm_thread(), never inserted directly.

drop policy if exists "participants read dms" on public.dm_messages;
create policy "participants read dms" on public.dm_messages
  for select using (
    exists (
      select 1 from public.dm_threads t
       where t.id = dm_messages.thread_id
         and auth.uid() in (t.member_a, t.member_b)
    )
  );

drop policy if exists "participants send dms" on public.dm_messages;
create policy "participants send dms" on public.dm_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.dm_threads t
       where t.id = dm_messages.thread_id
         and auth.uid() in (t.member_a, t.member_b)
         -- a block stops the conversation in BOTH directions
         and not exists (
           select 1 from public.dm_blocks b
            where (b.blocker_id = t.member_a and b.blocked_id = t.member_b)
               or (b.blocker_id = t.member_b and b.blocked_id = t.member_a)
         )
    )
  );

drop policy if exists "own read marks" on public.dm_reads;
create policy "own read marks" on public.dm_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own blocks" on public.dm_blocks;
create policy "own blocks" on public.dm_blocks
  for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- ----------------------------------------------------------------------------
-- open_dm_thread — find or create the thread with another member
--
-- SECURITY DEFINER so the pair can be canonicalised and inserted without
-- handing clients INSERT rights on dm_threads (which would let them forge
-- a thread between two other people).
-- ----------------------------------------------------------------------------

create or replace function public.open_dm_thread(peer uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  me       uuid := auth.uid();
  lo       uuid;
  hi       uuid;
  found_id uuid;
begin
  if me is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if peer is null or peer = me then
    raise exception 'BAD_PEER: pick another member';
  end if;
  if not exists (select 1 from public.profiles p where p.id = peer) then
    raise exception 'BAD_PEER: no such member';
  end if;
  if exists (
    select 1 from public.dm_blocks b
     where (b.blocker_id = me and b.blocked_id = peer)
        or (b.blocker_id = peer and b.blocked_id = me)
  ) then
    raise exception 'DM_BLOCKED';
  end if;

  lo := least(me, peer);
  hi := greatest(me, peer);

  insert into public.dm_threads (member_a, member_b)
       values (lo, hi)
  on conflict (member_a, member_b) do nothing;

  select id into found_id
    from public.dm_threads
   where member_a = lo and member_b = hi;

  return found_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- dm_inbox — my conversations with unread counts, in one round trip.
--
-- Unread is counted here rather than stored, so it cannot drift: it is
-- simply "messages from the other person newer than my read mark".
-- ----------------------------------------------------------------------------

create or replace function public.dm_inbox()
returns table (
  id              uuid,
  peer_id         uuid,
  last_message_at timestamptz,
  last_body       text,
  unread          integer
)
language sql
stable
security definer
as $$
  select
    t.id,
    case when t.member_a = auth.uid() then t.member_b else t.member_a end,
    t.last_message_at,
    t.last_body,
    (
      select count(*)::int
        from public.dm_messages m
       where m.thread_id = t.id
         and m.sender_id <> auth.uid()
         and m.created_at > coalesce(
               (select r.read_at from public.dm_reads r
                 where r.thread_id = t.id and r.user_id = auth.uid()),
               'epoch'::timestamptz
             )
    )
  from public.dm_threads t
  where auth.uid() in (t.member_a, t.member_b)
  order by t.last_message_at desc nulls last;
$$;

-- ----------------------------------------------------------------------------
-- Keep the inbox preview on the thread row, so listing conversations
-- never needs a per-thread subquery.
-- ----------------------------------------------------------------------------

create or replace function public.touch_dm_thread()
returns trigger
language plpgsql
as $$
begin
  update public.dm_threads
     set last_message_at = new.created_at,
         last_body       = left(new.body, 140)
   where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists dm_messages_touch_thread on public.dm_messages;
create trigger dm_messages_touch_thread
  after insert on public.dm_messages
  for each row execute function public.touch_dm_thread();

-- ----------------------------------------------------------------------------
-- Realtime — new DMs stream to the two participants (RLS still applies,
-- so nobody receives a row they could not have read)
-- ----------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.dm_messages;
exception
  when duplicate_object then null;
end;
$$;
