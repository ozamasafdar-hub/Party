-- ============================================================================
-- WYN — put the bot events back in the future
--
-- ✅ This one IS for the Supabase SQL editor. Safe to run as often as you
-- like. It touches only the ten seeded bot events and nothing a real member
-- has made.
--
-- WHY THIS EXISTS
-- seed-bots.sql dates its events relative to the moment it runs — "in 8
-- hours", "in 3 days". Two months later every one of them has finished, so
-- the map reads "0 live" and a visitor sees an empty country. Re-running
-- the seed does not help: it is `on conflict do nothing`, so the dates stay
-- exactly where they were.
--
-- Deleting the bots and re-seeding would work, but it throws away the
-- guestlists, the chat and the recap photos that make the map look like
-- somewhere people actually go. This moves the same events forward instead
-- and keeps all of that.
--
-- Run it whenever the map looks empty. Every event lands back in the same
-- spread the seed intended: one happening right now, a few tonight, some
-- over the next few days, and a couple that finished recently so the
-- 24h recap pins have something to show.
-- ============================================================================

update public.events as e
set starts_at = now() + s.offset_from_now
from (values
  -- The spread seed-bots.sql originally created, in the same order
  ('e0000000-0000-4000-8000-000000000001'::uuid, interval '26 hours'),
  ('e0000000-0000-4000-8000-000000000002'::uuid, interval '8 hours'),
  ('e0000000-0000-4000-8000-000000000003'::uuid, interval '30 hours'),
  ('e0000000-0000-4000-8000-000000000004'::uuid, interval '50 hours'),
  ('e0000000-0000-4000-8000-000000000005'::uuid, interval '3 days'),
  ('e0000000-0000-4000-8000-000000000006'::uuid, interval '5 hours'),
  -- Started half an hour ago: this is the one that makes the map say "live"
  ('e0000000-0000-4000-8000-000000000007'::uuid, interval '-30 minutes'),
  ('e0000000-0000-4000-8000-000000000008'::uuid, interval '20 hours'),
  ('e0000000-0000-4000-8000-000000000009'::uuid, interval '10 hours'),
  ('e0000000-0000-4000-8000-000000000010'::uuid, interval '2 days')
) as s(id, offset_from_now)
where e.id = s.id;

-- Recap pins only show events that ended within the last 24 hours, so any
-- seeded memories need their event to have finished recently — not two
-- months ago. Pull every bot event that carries photos back to "ended a few
-- hours ago", unless the list above already put it in the future.
update public.events as e
set starts_at = now() - interval '4 hours' - make_interval(mins => e.duration_minutes)
where e.host_id in (
        select id from public.profiles
         where id in (select id from auth.users where email like '%@wyn.test')
      )
  and e.starts_at + make_interval(mins => e.duration_minutes) < now()
  and exists (select 1 from public.event_memories m where m.event_id = e.id);

-- ----------------------------------------------------------------------------
-- What the map should look like now
-- ----------------------------------------------------------------------------
select
  case
    when starts_at > now() then 'upcoming'
    when starts_at + make_interval(mins => duration_minutes) > now() then 'LIVE NOW'
    when starts_at + make_interval(mins => duration_minutes) > now() - interval '24 hours'
      then 'recap pin'
    else 'over'
  end as state,
  count(*)
from public.events
where host_id in (
  select id from public.profiles
   where id in (select id from auth.users where email like '%@wyn.test')
)
group by 1
order by 1;
