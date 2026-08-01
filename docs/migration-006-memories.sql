-- ============================================================================
-- WYN — Migration 006: 24-Hour Memory Pins (post-event photo/video recaps)
--
-- When an event ends its pin becomes a "memory pin" for 24 hours: verified
-- attendees upload photos / short clips; everyone else can watch the
-- story-style recap.
--
-- Design note: the spec's stored status enum ('upcoming'/'live'/'ended'/
-- 'expired') and ended_at / memory_expires_at columns are COMPUTED instead:
--   ended_at          = starts_at + duration_minutes
--   memory_expires_at = ended_at + 24 hours
-- No cron job has to flip states, and nothing can drift out of sync.
--
-- Run ONCE in the Supabase SQL Editor.
-- ============================================================================

create table if not exists public.event_memories (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  media_url  text not null,
  media_type text not null check (media_type in ('image', 'video')),
  caption    text check (char_length(caption) <= 100),
  reactions  jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists event_memories_event_idx
  on public.event_memories (event_id, created_at);

alter table public.event_memories enable row level security;

-- The map is public — anyone can watch recaps (that's the FOMO loop)
drop policy if exists "anyone can view memories" on public.event_memories;
create policy "anyone can view memories" on public.event_memories
  for select using (true);

-- Only verified attendees may post, and only during the 24h window
drop policy if exists "attendees post memories in the window" on public.event_memories;
create policy "attendees post memories in the window" on public.event_memories
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1
        from public.events e
        join public.rsvps r
          on r.event_id = e.id and r.user_id = auth.uid() and r.status = 'going'
       where e.id = event_memories.event_id
         and e.starts_at + make_interval(mins => e.duration_minutes) < now()
         and e.starts_at + make_interval(mins => e.duration_minutes)
             + interval '24 hours' > now()
    )
  );

drop policy if exists "members delete own memories" on public.event_memories;
create policy "members delete own memories" on public.event_memories
  for delete using (user_id = auth.uid());

drop policy if exists "hosts moderate memories on own events" on public.event_memories;
create policy "hosts moderate memories on own events" on public.event_memories
  for delete using (
    exists (select 1 from public.events e
             where e.id = event_memories.event_id and e.host_id = auth.uid())
  );

-- Emoji reactions from viewers (attendee or not) — counts kept in jsonb
create or replace function public.react_to_memory(p_memory_id uuid, p_emoji text)
returns void
language plpgsql
security definer
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in to react';
  end if;
  if p_emoji not in ('🔥', '👏') then
    raise exception 'unsupported reaction';
  end if;
  update public.event_memories
     set reactions = jsonb_set(
           reactions, array[p_emoji],
           to_jsonb(coalesce((reactions ->> p_emoji)::int, 0) + 1))
   where id = p_memory_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Storage bucket for recap media (public read, members upload to own folder)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('memories', 'memories', true)
on conflict (id) do nothing;

drop policy if exists "anyone can view memory media" on storage.objects;
create policy "anyone can view memory media" on storage.objects
  for select using (bucket_id = 'memories');

drop policy if exists "members upload own memory media" on storage.objects;
create policy "members upload own memory media" on storage.objects
  for insert with check (
    bucket_id = 'memories'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
