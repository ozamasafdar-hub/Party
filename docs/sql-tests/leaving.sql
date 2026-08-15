-- ============================================================================
-- Local test harness — run by docs/sql-tests/run.sh, NOT in the Supabase SQL
-- editor. It writes to and reads from a throwaway database.
-- ============================================================================

-- ============================================================================
-- Leaving WYN.
--
-- The whole point of the tombstone is that it protects OTHER people, so
-- most of these checks are about what survives rather than what goes.
-- ============================================================================

-- Salem (b3) hosts the dhow cruise that already ran, and gets a new one
-- next week with a guest on it. Then he leaves.
insert into public.events
  (id, host_id, title, description, category, location_name, lat, lng,
   starts_at, duration_minutes, max_capacity)
values ('e0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-000000000003',
        'Next week''s dhow', 'Has not happened yet.', 'yacht', 'Corniche',
        25.29, 51.54, now() + interval '7 days', 180, 10)
on conflict (id) do nothing;

insert into public.rsvps (event_id, user_id, status)
select 'e0000000-0000-4000-8000-0000000000d1', v.id, 'going'
  from (values ('b0000000-0000-4000-8000-000000000003'::uuid),
               ('b0000000-0000-4000-8000-000000000004'::uuid)) as v(id)
 where not exists (
   select 1 from public.rsvps
    where event_id = 'e0000000-0000-4000-8000-0000000000d1' and user_id = v.id
 );

-- A DM thread with somebody else, so we can watch it go
insert into public.dm_threads (member_a, member_b)
select least('b0000000-0000-4000-8000-000000000003'::uuid,
             'b0000000-0000-4000-8000-000000000004'::uuid),
       greatest('b0000000-0000-4000-8000-000000000003'::uuid,
                'b0000000-0000-4000-8000-000000000004'::uuid)
on conflict do nothing;

\echo ''
\echo 'BEFORE SALEM LEAVES'

select '  ' || label || ': ' || n as line from (
  select 1 as sort, 'events he hosts' as label,
         (select count(*)::text from public.events
           where host_id = 'b0000000-0000-4000-8000-000000000003') as n
  union all select 2, 'his chat messages',
         (select count(*)::text from public.messages
           where user_id = 'b0000000-0000-4000-8000-000000000003')
  union all select 3, 'his recap photos',
         (select count(*)::text from public.event_memories
           where user_id = 'b0000000-0000-4000-8000-000000000003')
  union all select 4, 'guests on next week''s dhow',
         (select count(*)::text from public.rsvps
           where event_id = 'e0000000-0000-4000-8000-0000000000d1')
) t order by sort;

-- He leaves
do $$
begin
  perform set_config('test.uid', 'b0000000-0000-4000-8000-000000000003', true);
  perform public.delete_my_account();
  perform set_config('test.uid', '', true);
end $$;

\echo ''
\echo 'WHAT LEAVING DID'

with checks(sort, label, ok) as (
  values
    (1, 'the profile survives as a tombstone',
        (select count(*) = 1 from public.profiles
          where id = 'b0000000-0000-4000-8000-000000000003' and deleted_at is not null)),

    (2, 'the person is erased from it',
        (select full_name = 'Former member' and avatar_url is null
                and bio is null and gender is null
           from public.profiles where id = 'b0000000-0000-4000-8000-000000000003')),

    (3, 'the login is gone',
        (select count(*) = 0 from auth.users
          where id = 'b0000000-0000-4000-8000-000000000003')),

    -- The reason for all of this
    (4, 'next week''s event is CANCELLED, not deleted',
        (select is_cancelled from public.events
          where id = 'e0000000-0000-4000-8000-0000000000d1')),

    (5, 'and its other guest is still on the guestlist',
        (select count(*) = 1 from public.rsvps
          where event_id = 'e0000000-0000-4000-8000-0000000000d1'
            and user_id = 'b0000000-0000-4000-8000-000000000004')),

    (6, 'he gave his own upcoming spot back',
        (select count(*) = 0 from public.rsvps
          where event_id = 'e0000000-0000-4000-8000-0000000000d1'
            and user_id = 'b0000000-0000-4000-8000-000000000003')),

    (7, 'events he already hosted are untouched',
        (select count(*) > 0 from public.events
          where host_id = 'b0000000-0000-4000-8000-000000000003'
            and starts_at < now() and not is_cancelled)),

    (8, 'his messages stay in other people''s event chats',
        (select count(*) > 0 from public.messages
          where user_id = 'b0000000-0000-4000-8000-000000000003')),

    (9, 'his photos stay in shared recaps',
        (select count(*) > 0 from public.event_memories
          where user_id = 'b0000000-0000-4000-8000-000000000003')),

    (10, 'his past attendance stays on the record',
        (select count(*) > 0 from public.rsvps r join public.events e on e.id = r.event_id
          where r.user_id = 'b0000000-0000-4000-8000-000000000003' and e.starts_at < now())),

    (11, 'direct messages are gone, both sides',
        (select count(*) = 0 from public.dm_threads
          where member_a = 'b0000000-0000-4000-8000-000000000003'
             or member_b = 'b0000000-0000-4000-8000-000000000003')),

    (12, 'follows are gone both directions',
        (select count(*) = 0 from public.follows
          where follower_id = 'b0000000-0000-4000-8000-000000000003'
             or followee_id = 'b0000000-0000-4000-8000-000000000003'))
)
select case when ok then '  PASS  ' else '  FAIL  ' end || label as result
  from checks order by sort;

\echo ''
\echo 'AND IT CANNOT BE DONE TWICE, OR BY A VISITOR'

do $$
declare msg text;
begin
  perform set_config('test.uid', 'b0000000-0000-4000-8000-000000000003', true);
  begin
    perform public.delete_my_account();
    msg := '  FAIL  a deleted account could be deleted again';
  exception when others then
    msg := case when sqlerrm like 'ALREADY_DELETED%'
                then '  PASS  a second attempt is refused'
                else '  FAIL  wrong error: ' || sqlerrm end;
  end;
  raise notice '%', msg;

  perform set_config('test.uid', '', true);
  begin
    perform public.delete_my_account();
    msg := '  FAIL  a signed-out caller deleted something';
  exception when others then
    msg := case when sqlerrm like 'NOT_SIGNED_IN%'
                then '  PASS  a signed-out caller is refused'
                else '  FAIL  wrong error: ' || sqlerrm end;
  end;
  raise notice '%', msg;
end $$;
