-- ============================================================================
-- WYN — Migration 010: fix the conversation previews
--
-- Every conversation in the inbox showed "Say salam 👋" with no timestamp,
-- however many messages it held.
--
-- dm_threads has a SELECT policy and nothing else — by design, since
-- threads are only ever created through open_dm_thread(). But the trigger
-- that stamps last_message_at / last_body ran as the sending member, so
-- row level security discarded its UPDATE without an error and both
-- columns stayed NULL.
--
-- Two changes, either of which would fix it; both are applied so the data
-- is right AND the reads are right:
--
--   1. touch_dm_thread() becomes SECURITY DEFINER, so the stamp lands.
--      Clients still cannot UPDATE dm_threads directly.
--   2. dm_inbox() derives the preview from dm_messages instead of trusting
--      the stored columns, so a thread can never show a stale preview
--      again, whatever happens to the trigger.
--
-- Existing threads are backfilled at the end.
--
-- Run ONCE in the Supabase SQL Editor, after migration 009.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The trigger needs to write past RLS
-- ----------------------------------------------------------------------------

create or replace function public.touch_dm_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dm_threads
     set last_message_at = new.created_at,
         last_body       = left(new.body, 140)
   where id = new.thread_id;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Read the preview from the messages themselves
--
-- One lateral join per thread against the (thread_id, created_at) index —
-- the same cost as the old stored read, with nothing to drift.
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
    last_msg.created_at,
    left(last_msg.body, 140),
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
  left join lateral (
    select m.created_at, m.body
      from public.dm_messages m
     where m.thread_id = t.id
     order by m.created_at desc
     limit 1
  ) last_msg on true
  where auth.uid() in (t.member_a, t.member_b)
  order by last_msg.created_at desc nulls last;
$$;

-- ----------------------------------------------------------------------------
-- 3. Repair the threads written while the stamp was being dropped
-- ----------------------------------------------------------------------------

update public.dm_threads t
   set last_message_at = latest.created_at,
       last_body       = left(latest.body, 140)
  from (
    select distinct on (thread_id) thread_id, created_at, body
      from public.dm_messages
     order by thread_id, created_at desc
  ) latest
 where latest.thread_id = t.id;
