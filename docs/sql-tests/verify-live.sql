-- ============================================================================
-- WYN — did the migrations and the seed actually take?
--
-- ✅ This one IS for the Supabase SQL editor. It only reads — no table is
-- created, nothing is written. The other .sql files in this folder are the
-- local harness and must not be pasted there.
--
-- Paste the whole file into the Supabase SQL Editor and run it. It reads
-- and asserts; it changes nothing. Every row should say PASS.
--
-- The last check is the important one: it reads the live definition of the
-- join trigger and confirms all five gates are in it. That is the check
-- that would have caught migration 011 dropping the Host Pro-only gate.
-- ============================================================================

with checks(sort, label, ok) as (

  select 1, 'all five seeded events exist',
         count(*) = 5
    from public.events
   where id::text like 'e0000000-0000-4000-8000-00000000002%'

  union all
  select 2, 'dhow cruise ended within the last 24h',
         coalesce(bool_and(starts_at + make_interval(mins => duration_minutes)
                  between now() - interval '24 hours' and now()), false)
    from public.events where id = 'e0000000-0000-4000-8000-000000000021'

  union all
  select 3, 'dhow cruise carries 3 recap photos  → memory pin',
         count(*) = 3
    from public.event_memories where event_id = 'e0000000-0000-4000-8000-000000000021'

  union all
  select 4, 'pub quiz ended with no photos       → no recap anywhere',
         (select coalesce(bool_and(starts_at + make_interval(mins => duration_minutes) < now()), false)
            from public.events where id = 'e0000000-0000-4000-8000-000000000022')
         and (select count(*) = 0 from public.event_memories
               where event_id = 'e0000000-0000-4000-8000-000000000022')

  union all
  select 5, 'picnic ended >24h ago but has a photo → window hides it',
         (select coalesce(bool_and(starts_at + make_interval(mins => duration_minutes)
                          < now() - interval '24 hours'), false)
            from public.events where id = 'e0000000-0000-4000-8000-000000000023')
         and (select count(*) = 1 from public.event_memories
               where event_id = 'e0000000-0000-4000-8000-000000000023')

  union all
  select 6, 'organisers table kept pro_only + featured',
         coalesce(bool_and(pro_only and is_featured_pin and is_pro_event), false)
    from public.events where id = 'e0000000-0000-4000-8000-000000000024'

  union all
  select 7, 'free walk is free and kept its indigo pin',
         coalesce(bool_and(price_per_spot = 0 and pin_color = '#6366F1'), false)
    from public.events where id = 'e0000000-0000-4000-8000-000000000025'

  union all
  select 8, 'every seeded host is on their own guestlist',
         count(*) = 5
    from public.events e
    join public.rsvps r on r.event_id = e.id and r.user_id = e.host_id and r.status = 'going'
   where e.id::text like 'e0000000-0000-4000-8000-00000000002%'

  union all
  select 9, 'guestlists seeded (15 rows across the five)',
         count(*) = 15
    from public.rsvps
   where event_id::text like 'e0000000-0000-4000-8000-00000000002%'

  -- The gate itself, read out of the live database
  union all
  select 10, 'join trigger enforces PRO_ONLY            (migration 012)',
         pg_get_functiondef(p.oid) like '%PRO_ONLY%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_event_capacity'

  union all
  select 11, 'join trigger enforces LADIES_ONLY         (migration 011)',
         pg_get_functiondef(p.oid) like '%LADIES_ONLY%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_event_capacity'

  union all
  select 12, 'join trigger enforces EVENT_ENDED         (migration 011)',
         pg_get_functiondef(p.oid) like '%EVENT_ENDED%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_event_capacity'

  union all
  select 13, 'join trigger enforces RELIABILITY + FULL',
         pg_get_functiondef(p.oid) like '%RELIABILITY_TOO_LOW%'
         and pg_get_functiondef(p.oid) like '%EVENT_FULL%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_event_capacity'

  union all
  select 14, 'the host is exempt from the guest-only gates',
         pg_get_functiondef(p.oid) like '%new.user_id <> ev.host_id%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_event_capacity'

  -- Migration 013: the value the ladies-only gate reads
  union all
  select 15, 'gender is frozen once set               (migration 013)',
         exists (
           select 1 from pg_trigger
            where tgname = 'profiles_freeze_gender'
              and tgrelid = 'public.profiles'::regclass
              and not tgisinternal
         )

  union all
  select 16, 'an admin can still correct a mistake',
         exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'set_member_gender'
         )

  union all
  select 17, 'sign-up carries gender into the profile',
         pg_get_functiondef(p.oid) like '%gender%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'handle_new_user'

  -- Migration 014: a profile can outlive its login, so leaving erases the
  -- person without destroying other people's evenings
  union all
  select 18, 'a profile can outlive its login          (migration 014)',
         not exists (
           select 1 from pg_constraint
            where conname = 'profiles_id_fkey'
              and conrelid = 'public.profiles'::regclass
         )

  union all
  select 19, 'profiles carry a tombstone marker',
         exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'profiles'
              and column_name = 'deleted_at'
         )

  union all
  select 20, 'members can delete their own account',
         exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'delete_my_account'
         )

  union all
  select 21, 'the gender freeze allows an erasure',
         pg_get_functiondef(p.oid) like '%deleted_at is null%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'freeze_gender'

  union all
  -- Anyone still holding null simply cannot see women-only events until
  -- they answer the prompt. Informational, not a failure.
  select 22, 'members still to answer: ' ||
             (select count(*)::text from public.profiles where gender is null),
         true

  union all
  select 23, 'members who have left: ' ||
             (select count(*)::text from public.profiles where deleted_at is not null),
         true
)
select case when ok then 'PASS' else 'FAIL' end as result, label
  from checks
 order by sort;
