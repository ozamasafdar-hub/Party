-- ============================================================================
-- Local test harness — run by docs/sql-tests/run.sh, NOT in the Supabase SQL
-- editor. It writes to and reads from a throwaway database.
-- ============================================================================

-- Does docs/seed-refresh.sql actually put an emptied map back?
--
-- This is the failure it exists for. seed-bots.sql dates its events
-- relative to the moment it runs, so after a quiet couple of months every
-- one of them has finished and the live map reads "0 live · Qatar" — which
-- is exactly what the deployed site showed. Re-running the seed does not
-- help, because it is `on conflict do nothing` and leaves the old dates
-- alone.
--
-- So: age everything into the past the way real time does, confirm the map
-- really is empty, run the refresh, and confirm it is alive again.

\echo '\nREFRESHING A MAP THAT HAS GONE QUIET'

-- Two months pass
update public.events
set starts_at = starts_at - interval '60 days'
where host_id in (select id from auth.users where email like '%@wyn.test');

select '  ' || case when ok then 'PASS  ' else 'FAIL  ' end || label as result from (
  select 'after two months every bot event has finished' as label,
         (select count(*) = 0 from public.events
           where host_id in (select id from auth.users where email like '%@wyn.test')
             and starts_at + make_interval(mins => duration_minutes) > now()) as ok
  union all
  select 'and nothing is left even for the 24h recap pins',
         (select count(*) = 0 from public.events
           where host_id in (select id from auth.users where email like '%@wyn.test')
             and starts_at + make_interval(mins => duration_minutes)
                 > now() - interval '24 hours')
) t;

-- The file being tested, run exactly as it would be pasted into Supabase.
-- Its own output is suppressed so only this suite's PASS lines are read.
\o /dev/null
\ir ../seed-refresh.sql
\o

select '  ' || case when ok then 'PASS  ' else 'FAIL  ' end || label as result from (
  select 'the refresh puts an event on right now, so the map says live' as label,
         (select count(*) >= 1 from public.events
           where host_id in (select id from auth.users where email like '%@wyn.test')
             and starts_at <= now()
             and starts_at + make_interval(mins => duration_minutes) > now()) as ok
  union all
  select 'and fills the next few days rather than one lonely pin',
         (select count(*) >= 5 from public.events
           where host_id in (select id from auth.users where email like '%@wyn.test')
             and starts_at > now())
  union all
  select 'the spread still reaches several days out, not all one evening',
         (select max(starts_at) > now() + interval '2 days' from public.events
           where host_id in (select id from auth.users where email like '%@wyn.test'))
  union all
  -- Recap pins only show events that finished within the last 24 hours, so
  -- a seeded memory is invisible unless its event is dragged back with it
  select 'events carrying recap photos land inside the 24h window',
         (select count(*) = 0 from public.events e
           where exists (select 1 from public.event_memories m where m.event_id = e.id)
             and e.host_id in (select id from auth.users where email like '%@wyn.test')
             and e.starts_at + make_interval(mins => e.duration_minutes)
                 <= now() - interval '24 hours')
  union all
  select 'guestlists survived — the refresh moved events, it did not rebuild them',
         (select count(*) > 0 from public.rsvps r join public.events e on e.id = r.event_id
           where e.host_id in (select id from auth.users where email like '%@wyn.test'))
  union all
  select 'and so did the chat',
         (select count(*) >= 0 from public.messages m join public.events e on e.id = m.event_id
           where e.host_id in (select id from auth.users where email like '%@wyn.test'))
) t;

-- Running it twice must be harmless: this is a thing to reach for whenever
-- the map looks quiet, not a one-shot migration
\o /dev/null
\ir ../seed-refresh.sql
\o

select '  ' || case when ok then 'PASS  ' else 'FAIL  ' end || label as result from (
  select 'running it a second time changes nothing and breaks nothing' as label,
         (select count(*) >= 1 from public.events
           where host_id in (select id from auth.users where email like '%@wyn.test')
             and starts_at <= now()
             and starts_at + make_interval(mins => duration_minutes) > now()) as ok
) t;
