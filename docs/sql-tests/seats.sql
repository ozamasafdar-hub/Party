-- ============================================================================
-- Local test harness — run by docs/sql-tests/run.sh, NOT in the Supabase SQL
-- editor. It writes to and reads from a throwaway database.
-- ============================================================================

-- Capacity counted in people rather than rows.
--
-- This is the arithmetic that decides whether an event gets oversold, and it
-- is the kind of thing that looks right and is off by one. Every case below
-- is a real sequence of taps: a party that fits, a party that does not, a
-- party that changes its mind, and somebody leaving so the queue moves.

\echo '\nSEATS — CAPACITY COUNTED IN PEOPLE'

-- A six-place event of our own, so the seeded ones keep their shapes for
-- the other suites
insert into public.events
  (id, host_id, title, description, category, location_name, lat, lng,
   starts_at, duration_minutes, max_capacity)
values
  ('5ea70000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001',
   'Six-place padel', 'For counting seats.', 'sports', 'Lusail', 25.42, 51.49,
   now() + interval '2 days', 90, 6)
on conflict (id) do nothing;

-- The host takes one place, as creating an event does in the app
insert into public.rsvps (event_id, user_id, status, seats)
values ('5ea70000-0000-4000-8000-000000000001',
        'b0000000-0000-4000-8000-000000000001', 'going', 1)
on conflict (event_id, user_id) do update set status = 'going', seats = 1;

-- Probe helper: ask "could this member book N places?" without changing
-- anything, by rolling the attempt back. Same sentinel trick as gates.sql.
create or replace function public.try_seats(ev uuid, member uuid, n integer)
returns text language plpgsql as $$
begin
  begin
    delete from public.rsvps where event_id = ev and user_id = member;
    insert into public.rsvps (event_id, user_id, status, seats)
    values (ev, member, 'going', n);
    raise exception 'WYN_PROBE_ALLOWED';
  exception when others then
    if sqlerrm like 'WYN_PROBE_ALLOWED%' then return 'ALLOWED'; end if;
    return split_part(sqlerrm, ':', 1);
  end;
end $$;

select '  ' || case when got = want then 'PASS  ' else 'FAIL  (got ' || got || ') ' end
       || label as result
from (values
  ('one person can take one of the five remaining places',
   public.try_seats('5ea70000-0000-4000-8000-000000000001',
                    'b0000000-0000-4000-8000-000000000002', 1), 'ALLOWED'),

  ('a family of four fits while five places are free',
   public.try_seats('5ea70000-0000-4000-8000-000000000001',
                    'b0000000-0000-4000-8000-000000000002', 4), 'ALLOWED'),

  ('a party of five does not, because the host holds one place',
   public.try_seats('5ea70000-0000-4000-8000-000000000001',
                    'b0000000-0000-4000-8000-000000000002', 6), 'EVENT_FULL'),

  ('a party bigger than the whole event is refused for being too big',
   public.try_seats('5ea70000-0000-4000-8000-000000000001',
                    'b0000000-0000-4000-8000-000000000002', 11), 'EVENT_FULL')
) t(label, got, want);

-- The ten-seat ceiling needs an event roomy enough that capacity is not what
-- refuses first: a BEFORE trigger runs ahead of check constraints, so in a
-- six-place event every oversized party is simply EVENT_FULL and the ceiling
-- is never reached.
insert into public.events
  (id, host_id, title, description, category, location_name, lat, lng,
   starts_at, duration_minutes, max_capacity)
values
  ('5ea70000-0000-4000-8000-000000000002',
   'b0000000-0000-4000-8000-000000000001',
   'Roomy hall', 'Forty places, to test the per-booking ceiling.', 'culture',
   'Katara', 25.36, 51.52, now() + interval '2 days', 180, 40)
on conflict (id) do nothing;

select '  ' || case when got = want then 'PASS  ' else 'FAIL  (got ' || got || ') ' end
       || label as result
from (values
  ('ten places at once is the most anyone may book',
   public.try_seats('5ea70000-0000-4000-8000-000000000002',
                    'b0000000-0000-4000-8000-000000000002', 10), 'ALLOWED'),

  ('eleven is refused even in a hall with forty places free',
   public.try_seats('5ea70000-0000-4000-8000-000000000002',
                    'b0000000-0000-4000-8000-000000000002', 11),
   'new row for relation "rsvps" violates check constraint "rsvps_seats_check"')
) t(label, got, want);

-- ----------------------------------------------------------------------------
-- Filling it up for real, then changing the party size
-- ----------------------------------------------------------------------------
insert into public.rsvps (event_id, user_id, status, seats)
values ('5ea70000-0000-4000-8000-000000000001',
        'b0000000-0000-4000-8000-000000000002', 'going', 4)
on conflict (event_id, user_id) do update set status = 'going', seats = 4;

select '  ' || case when got = want then 'PASS  ' else 'FAIL  (got ' || got || ') ' end
       || label as result
from (values
  ('with five of six taken, one more person fits',
   public.try_seats('5ea70000-0000-4000-8000-000000000001',
                    'b0000000-0000-4000-8000-000000000003', 1), 'ALLOWED'),

  ('but a couple does not',
   public.try_seats('5ea70000-0000-4000-8000-000000000001',
                    'b0000000-0000-4000-8000-000000000003', 2), 'EVENT_FULL')
) t(label, got, want);

-- The party of four shrinks to two. This is the update case: counting the
-- member's own existing row would double-count it and refuse a change that
-- frees places up.
update public.rsvps set seats = 2
 where event_id = '5ea70000-0000-4000-8000-000000000001'
   and user_id = 'b0000000-0000-4000-8000-000000000002';

select '  ' || case when ok then 'PASS  ' else 'FAIL  ' end || label as result from (
  select 'a party can shrink without being told the event is full' as label,
         (select seats = 2 from public.rsvps
           where event_id = '5ea70000-0000-4000-8000-000000000001'
             and user_id = 'b0000000-0000-4000-8000-000000000002') as ok
  union all
  select 'and the places it gave back are really free again',
         (select coalesce(sum(seats), 0) = 3 from public.rsvps
           where event_id = '5ea70000-0000-4000-8000-000000000001' and status = 'going')
) t;

select '  ' || case when got = want then 'PASS  ' else 'FAIL  (got ' || got || ') ' end
       || label as result
from (values
  ('so a party of three can now take the rest',
   public.try_seats('5ea70000-0000-4000-8000-000000000001',
                    'b0000000-0000-4000-8000-000000000004', 3), 'ALLOWED')
) t(label, got, want);

-- ----------------------------------------------------------------------------
-- The queue moves, and skips a party that cannot fit
-- ----------------------------------------------------------------------------
\echo '\nSEATS — THE WAITLIST PROMOTES WHOEVER FITS'

-- Fill it: host 1 + four = five, leaving one place
update public.rsvps set seats = 4
 where event_id = '5ea70000-0000-4000-8000-000000000001'
   and user_id = 'b0000000-0000-4000-8000-000000000002';

-- Someone has to really be on the guestlist for leaving to free a place.
-- Every booking above went through try_seats, which rolls back, so at this
-- point only the host and the party of four are actually going.
insert into public.rsvps (event_id, user_id, status, seats)
values ('5ea70000-0000-4000-8000-000000000001',
        'b0000000-0000-4000-8000-000000000003', 'going', 1)
on conflict (event_id, user_id) do update set status = 'going', seats = 1;

-- A family of three joins the queue first, then one person behind them
insert into public.rsvps (event_id, user_id, status, seats, created_at)
values ('5ea70000-0000-4000-8000-000000000001',
        'b0000000-0000-4000-8000-000000000005', 'waitlist', 3, now() - interval '10 minutes')
on conflict (event_id, user_id) do update set status = 'waitlist', seats = 3;

insert into public.rsvps (event_id, user_id, status, seats, created_at)
values ('5ea70000-0000-4000-8000-000000000001',
        'b0000000-0000-4000-8000-000000000006', 'waitlist', 1, now() - interval '5 minutes')
on conflict (event_id, user_id) do update set status = 'waitlist', seats = 1;

-- Somebody leaves, freeing one place. The family of three has waited longer
-- but does not fit; promoting them would raise inside an after-delete
-- trigger and take this delete down with it.
delete from public.rsvps
 where event_id = '5ea70000-0000-4000-8000-000000000001'
   and user_id = 'b0000000-0000-4000-8000-000000000003';

select '  ' || case when ok then 'PASS  ' else 'FAIL  ' end || label as result from (
  select 'leaving an event works even with an oversized party waiting' as label,
         (select count(*) = 0 from public.rsvps
           where event_id = '5ea70000-0000-4000-8000-000000000001'
             and user_id = 'b0000000-0000-4000-8000-000000000003') as ok
  union all
  select 'the single behind them is promoted into the free place',
         (select status = 'going' from public.rsvps
           where event_id = '5ea70000-0000-4000-8000-000000000001'
             and user_id = 'b0000000-0000-4000-8000-000000000006')
  union all
  select 'and the family that does not fit stays in the queue',
         (select status = 'waitlist' from public.rsvps
           where event_id = '5ea70000-0000-4000-8000-000000000001'
             and user_id = 'b0000000-0000-4000-8000-000000000005')
  union all
  select 'the event is now exactly full, not oversold',
         (select coalesce(sum(seats), 0) = 6 from public.rsvps
           where event_id = '5ea70000-0000-4000-8000-000000000001' and status = 'going')
) t;

-- ----------------------------------------------------------------------------
-- Women-only events take one place per member
-- ----------------------------------------------------------------------------
\echo '\nSEATS — A WOMEN-ONLY EVENT CANNOT BE BROUGHT GUESTS'

select '  ' || case when got = want then 'PASS  ' else 'FAIL  (got ' || got || ') ' end
       || label as result
from (values
  ('a woman can still take her own place',
   public.try_seats((select id from public.events where is_ladies_only order by id limit 1),
                    'b0000000-0000-4000-8000-000000000008', 1), 'ALLOWED'),

  ('but cannot bring three people nobody has checked',
   public.try_seats((select id from public.events where is_ladies_only order by id limit 1),
                    'b0000000-0000-4000-8000-000000000008', 4), 'LADIES_ONLY_SEATS'),

  ('and neither can the host, who is subject to the same promise',
   public.try_seats((select id from public.events where is_ladies_only order by id limit 1),
                    (select host_id from public.events where is_ladies_only order by id limit 1),
                    4), 'LADIES_ONLY_SEATS')
) t(label, got, want);

-- ----------------------------------------------------------------------------
-- book_seats(): the one call the app will make
-- ----------------------------------------------------------------------------
\echo '\nSEATS — BOOKING THROUGH THE ONE WAY IN'

create or replace function public.try_book(ev uuid, member uuid, n integer)
returns text language plpgsql as $$
begin
  begin
    perform set_config('test.uid', member::text, true);
    delete from public.rsvps where event_id = ev and user_id = member;
    perform public.book_seats(ev, n);
    raise exception 'WYN_PROBE_ALLOWED';
  exception when others then
    perform set_config('test.uid', '', true);
    if sqlerrm like 'WYN_PROBE_ALLOWED%' then return 'ALLOWED'; end if;
    return split_part(sqlerrm, ':', 1);
  end;
end $$;

select '  ' || case when got = want then 'PASS  ' else 'FAIL  (got ' || got || ') ' end
       || label as result
from (values
  ('a member can book a party through book_seats',
   public.try_book('5ea70000-0000-4000-8000-000000000002',
                   'b0000000-0000-4000-8000-000000000004', 3), 'ALLOWED'),

  ('it refuses a party of none',
   public.try_book('5ea70000-0000-4000-8000-000000000002',
                   'b0000000-0000-4000-8000-000000000004', 0), 'BAD_SEATS'),

  ('and a party of eleven, before touching the table',
   public.try_book('5ea70000-0000-4000-8000-000000000002',
                   'b0000000-0000-4000-8000-000000000004', 11), 'BAD_SEATS'),

  ('it refuses an event that does not exist',
   public.try_book('5ea70000-0000-4000-8000-00000000dead',
                   'b0000000-0000-4000-8000-000000000004', 1), 'NO_SUCH_EVENT'),

  ('and it still refuses a man a women-only event',
   public.try_book((select id from public.events where is_ladies_only order by id limit 1),
                   'b0000000-0000-4000-8000-000000000001', 1), 'LADIES_ONLY')
) t(label, got, want);

-- A full event waitlists the whole party rather than splitting it: half a
-- family is not an outing, and letting two in while two queue is worse than
-- telling all four to wait.
do $$
begin
  perform set_config('test.uid', 'b0000000-0000-4000-8000-000000000007', true);
  perform public.book_seats('5ea70000-0000-4000-8000-000000000001', 2);
  perform set_config('test.uid', '', true);
end $$;

select '  ' || case when ok then 'PASS  ' else 'FAIL  ' end || label as result from (
  select 'a party that does not fit joins the queue whole' as label,
         (select status = 'waitlist' and seats = 2 from public.rsvps
           where event_id = '5ea70000-0000-4000-8000-000000000001'
             and user_id = 'b0000000-0000-4000-8000-000000000007') as ok
  union all
  select 'and a signed-out caller is refused outright',
         (select public.try_book('5ea70000-0000-4000-8000-000000000002',
                                 null, 1) = 'NOT_SIGNED_IN')
) t;

drop function public.try_book(uuid, uuid, integer);

-- ----------------------------------------------------------------------------
-- Every gate migration 012 lists must still fire. Replacing this trigger is
-- exactly how PRO_ONLY was lost once already.
-- ----------------------------------------------------------------------------
\echo '\nSEATS — AND EVERY OLDER GATE SURVIVED THE REWRITE'

select '  ' || case when ok then 'PASS  ' else 'FAIL  ' end || label as result from (
  select 'the trigger still refuses men a women-only event' as label,
         pg_get_functiondef(p.oid) like '%LADIES_ONLY:%' as ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_event_capacity'
  union all
  select 'still refuses free members a Host Pro event',
         pg_get_functiondef(p.oid) like '%PRO_ONLY%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_event_capacity'
  union all
  select 'still refuses joining after it has ended',
         pg_get_functiondef(p.oid) like '%EVENT_ENDED%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_event_capacity'
  union all
  select 'still enforces the host''s reliability floor',
         pg_get_functiondef(p.oid) like '%RELIABILITY_TOO_LOW%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_event_capacity'
  union all
  select 'and still exempts the host from the guest-only gates',
         pg_get_functiondef(p.oid) like '%new.user_id <> ev.host_id%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_event_capacity'
) t;

drop function public.try_seats(uuid, uuid, integer);
