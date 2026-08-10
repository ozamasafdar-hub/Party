-- ============================================================================
-- Local test harness — run by docs/sql-tests/run.sh, NOT in the Supabase SQL
-- editor. It writes to and reads from a throwaway database.
-- ============================================================================

-- Every join gate, exercised against the real trigger. Each case states
-- what should happen; the run prints PASS/FAIL, not just "no error".

create or replace function public.try_rsvp(ev uuid, member uuid, st text default 'going')
returns text language plpgsql as $$
begin
  -- The whole probe runs in a subtransaction that is always rolled back, so
  -- asking "could this member join?" never changes the guestlist. Clearing
  -- any existing row first makes the question meaningful for someone who is
  -- already on the list.
  begin
    delete from public.rsvps where event_id = ev and user_id = member;
    insert into public.rsvps (event_id, user_id, status) values (ev, member, st);
    raise exception 'WYN_PROBE_ALLOWED';
  exception when others then
    if sqlerrm like 'WYN_PROBE_ALLOWED%' then return 'ALLOWED'; end if;
    return split_part(sqlerrm, ':', 1);
  end;
end $$;

-- Fixture: a Host Pro host whose own attendance record sits below the floor
-- they set. Yousuf scores 63; the floor is 80.
update public.profiles set subscription_tier = 'host_pro', subscription_status = 'active'
 where id = 'b0000000-0000-4000-8000-000000000007';

insert into public.events
  (id, host_id, title, description, category, location_name, lat, lng,
   starts_at, duration_minutes, max_capacity, min_reliability)
values ('e0000000-0000-4000-8000-0000000000f1', 'b0000000-0000-4000-8000-000000000007',
        'Reliability lock fixture', 'Host scores 63, floor is 80.', 'other', 'Doha',
        25.28, 51.52, now() + interval '2 days', 120, 10, 80)
on conflict (id) do nothing;

\echo ''
\echo 'JOIN GATES'

with cases(name, got, want) as (
  values
    ('free member is refused a Host Pro-only event',
     public.try_rsvp('e0000000-0000-4000-8000-000000000024',
                     'b0000000-0000-4000-8000-000000000005'), 'PRO_ONLY'),

    ('Host Pro member is allowed into a Host Pro-only event',
     public.try_rsvp('e0000000-0000-4000-8000-000000000024',
                     'b0000000-0000-4000-8000-000000000003'), 'ALLOWED'),

    ('a man is refused a ladies-only event',
     public.try_rsvp((select id from public.events where is_ladies_only order by id limit 1),
                     'b0000000-0000-4000-8000-000000000005'), 'LADIES_ONLY'),

    ('a woman is allowed into a ladies-only event',
     public.try_rsvp((select id from public.events where is_ladies_only order by id limit 1),
                     'b0000000-0000-4000-8000-000000000008'), 'ALLOWED'),

    ('nobody may join an event that already ended',
     public.try_rsvp('e0000000-0000-4000-8000-000000000021',
                     'b0000000-0000-4000-8000-000000000005'), 'EVENT_ENDED'),

    ('the host keeps access to their own ended event',
     public.try_rsvp('e0000000-0000-4000-8000-000000000021',
                     'b0000000-0000-4000-8000-000000000003'), 'ALLOWED'),

    ('a full event refuses one more guest',
     public.try_rsvp((select e.id from public.events e
                       where (select count(*) from public.rsvps r
                               where r.event_id = e.id and r.status = 'going') >= e.max_capacity
                         and e.starts_at > now() limit 1),
                     'b0000000-0000-4000-8000-000000000008'), 'EVENT_FULL'),

    ('an unreliable member is refused a reliability-locked event',
     public.try_rsvp((select id from public.events
                       where min_reliability is not null and starts_at > now() limit 1),
                     'b0000000-0000-4000-8000-000000000007'), 'RELIABILITY_TOO_LOW'),

    ('a host is never locked out of their own reliability-locked event',
     (select public.try_rsvp(e.id, e.host_id) from public.events e
       where e.min_reliability is not null
         and (select reliability_score from public.profiles where id = e.host_id) < e.min_reliability
       limit 1), 'ALLOWED')
)
select case when got = want then '  PASS  ' else '  FAIL  ' end
       || rpad(name, 52) || '  got ' || got ||
       case when got = want then '' else '   want ' || want end as result
from cases;

\echo ''
\echo 'SEEDED STATES'

select case when ok then '  PASS  ' else '  FAIL  ' end || label as result from (
  select 'dhow cruise ended within the last 24h' as label,
         (select starts_at + make_interval(mins => duration_minutes) between now() - interval '24 hours' and now()
            from public.events where id = 'e0000000-0000-4000-8000-000000000021') as ok
  union all
  select 'dhow cruise carries 3 recap photos',
         (select count(*) = 3 from public.event_memories
           where event_id = 'e0000000-0000-4000-8000-000000000021')
  union all
  select 'pub quiz ended and has no photos at all',
         (select starts_at + make_interval(mins => duration_minutes) < now()
            from public.events where id = 'e0000000-0000-4000-8000-000000000022')
         and (select count(*) = 0 from public.event_memories
               where event_id = 'e0000000-0000-4000-8000-000000000022')
  union all
  select 'picnic ended more than 24h ago yet has a photo',
         (select starts_at + make_interval(mins => duration_minutes) < now() - interval '24 hours'
            from public.events where id = 'e0000000-0000-4000-8000-000000000023')
         and (select count(*) = 1 from public.event_memories
               where event_id = 'e0000000-0000-4000-8000-000000000023')
  union all
  select 'organisers table survived as pro-only and featured',
         (select pro_only and is_featured_pin and is_pro_event
            from public.events where id = 'e0000000-0000-4000-8000-000000000024')
  union all
  select 'free walk is free and kept its custom pin colour',
         (select price_per_spot = 0 and pin_color = '#6366F1'
            from public.events where id = 'e0000000-0000-4000-8000-000000000025')
  union all
  select 'every seeded host is on their own guestlist',
         (select count(*) = 5 from public.events e join public.rsvps r
            on r.event_id = e.id and r.user_id = e.host_id and r.status = 'going'
          where e.id::text like 'e0000000-0000-4000-8000-00000000002%')
) t;

drop function public.try_rsvp(uuid, uuid, text);
