-- ============================================================================
-- WYN — Test data, part 2: the states you can only see after an event runs
--
-- seed-bots.sql covers the live map: free, paid, ladies-only, approval,
-- blurred, full-with-waitlist and featured pins. This adds the ones that
-- only exist once an event is over, plus the two flags added since:
--
--   * ended 3h ago WITH recap photos  → a glowing 24h Memory Pin
--   * ended 5h ago WITH NO photos     → must show no recap anywhere
--   * ended 2 days ago WITH photos    → the window has lapsed, no pin
--   * a Host Pro-only event           → only Host Pro members may join
--   * a custom pin colour             → indigo, not its category's colour
--
-- Run AFTER seed-bots.sql, and after migrations 007, 008 and 011.
-- Safe to run more than once.
--
-- Remove everything from both seed files with one line:
--   delete from auth.users where email like '%@wyn.test';
--
-- ----------------------------------------------------------------------------
-- Two triggers shape how this file has to be written, and both of them are
-- doing their job — the seed works around them rather than being excused
-- from them:
--
--   enforce_host_tier (BEFORE INSERT on events) caps a free host at 5
--   guests and one live pin, so every event below is hosted by one of the
--   three Host Pro bots. Their tiers are set at the top, before the insert,
--   because the trigger reads the profile as it stands at that moment.
--
--   enforce_event_capacity (BEFORE INSERT on rsvps) refuses to add anyone
--   but the host to an event that has already finished — that is migration
--   011, the fix for people joining events that were over. So the three
--   ended events are inserted with a future start time, their guestlists
--   are filled while they are still upcoming, and the last statement in
--   the file moves them into the past. That is exactly what happened in
--   real life, only faster.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Hosts. Must come first: enforce_host_tier reads the tier on insert.
-- ----------------------------------------------------------------------------
update public.profiles
   set subscription_tier = 'host_pro', subscription_status = 'active'
 where id in ('b0000000-0000-4000-8000-000000000001',
              'b0000000-0000-4000-8000-000000000002',
              'b0000000-0000-4000-8000-000000000003');

-- ----------------------------------------------------------------------------
-- 2. Events. The three ended ones go in dated an hour ahead; step 5 moves
--    them back once their guestlists exist.
-- ----------------------------------------------------------------------------
insert into public.events
  (id, host_id, title, description, category, location_name, lat, lng,
   starts_at, duration_minutes, max_capacity, cover_url, photo_urls,
   approval_mode, price_per_spot, is_ladies_only, is_location_blurred,
   is_featured_pin, pro_only, pin_color)
values
  -- Ended 3h ago, three recap photos below → glowing memory pin on the map
  ('e0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000003',
   'Dhow cruise & grill night',
   'Chartered a dhow from the Corniche — skyline, music and a grill on board.',
   'yacht', 'Dhow Harbour, Corniche', 25.2920, 51.5410,
   now() + interval '1 hour', 180, 12,
   'https://picsum.photos/seed/wyndhow1/800/450',
   array['https://picsum.photos/seed/wyndhow1/800/450'],
   false, 0, false, false, false, false, null),

  -- Ended 5h ago and nobody posted → no recap chip, no pin, nothing
  ('e0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-000000000002',
   'Pub quiz at the Torch',
   'Six rounds, one team, zero chance. Free to join, bring your general knowledge.',
   'other', 'The Torch, Aspire', 25.2606, 51.4447,
   now() + interval '1 hour', 120, 8,
   null, array[]::text[],
   false, 0, false, false, false, false, null),

  -- Ended two days ago, and it has a photo: the 24h window is what hides it
  ('e0000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-000000000003',
   'Sunrise picnic — Al Bidda',
   'Early start, flasks of karak, and the skyline waking up across the bay.',
   'other', 'Al Bidda Park', 25.2985, 51.5233,
   now() + interval '1 hour', 120, 10,
   'https://picsum.photos/seed/wynpicnic/800/450',
   array['https://picsum.photos/seed/wynpicnic/800/450'],
   false, 0, false, false, false, false, null),

  -- Host Pro members only — a free member sees it but cannot join
  ('e0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001',
   'Organisers'' table — Lusail Marina',
   'Dinner for people who host. Swap what works, what flopped, and who to book.',
   'dining', 'Lusail Marina Promenade', 25.4225, 51.5310,
   now() + interval '38 hours', 180, 10,
   'https://picsum.photos/seed/wynorg/800/450',
   array['https://picsum.photos/seed/wynorg/800/450'],
   false, 0, false, false, true, true, null),

  -- Free to join, and wearing a pin colour its category would not give it
  ('e0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-000000000001',
   'Free walk & talk — Aspire Park',
   'Two laps of the lake at an easy pace. No cost, no signup fee, just turn up.',
   'sports', 'Aspire Park', 25.2632, 51.4479,
   now() + interval '14 hours', 60, 20,
   null, array[]::text[],
   false, 0, false, false, false, false, '#6366F1')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Guestlists.
--
-- Written as insert-select rather than "values ... on conflict do nothing",
-- because a BEFORE INSERT trigger fires before the conflict is detected:
-- on a second run the rows already exist but the ended-event check would
-- still reject them. Filtering first means a second run inserts nothing at
-- all, and the trigger never runs.
-- ----------------------------------------------------------------------------
insert into public.rsvps (event_id, user_id, status)
select v.event_id, v.user_id, 'going'
  from (values
    -- Dhow cruise (host b3)
    ('e0000000-0000-4000-8000-000000000021'::uuid, 'b0000000-0000-4000-8000-000000000003'::uuid),
    ('e0000000-0000-4000-8000-000000000021'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid),
    ('e0000000-0000-4000-8000-000000000021'::uuid, 'b0000000-0000-4000-8000-000000000004'::uuid),
    ('e0000000-0000-4000-8000-000000000021'::uuid, 'b0000000-0000-4000-8000-000000000006'::uuid),
    -- Pub quiz (host b2)
    ('e0000000-0000-4000-8000-000000000022'::uuid, 'b0000000-0000-4000-8000-000000000002'::uuid),
    ('e0000000-0000-4000-8000-000000000022'::uuid, 'b0000000-0000-4000-8000-000000000006'::uuid),
    ('e0000000-0000-4000-8000-000000000022'::uuid, 'b0000000-0000-4000-8000-000000000008'::uuid),
    -- Sunrise picnic (host b3)
    ('e0000000-0000-4000-8000-000000000023'::uuid, 'b0000000-0000-4000-8000-000000000003'::uuid),
    ('e0000000-0000-4000-8000-000000000023'::uuid, 'b0000000-0000-4000-8000-000000000004'::uuid),
    ('e0000000-0000-4000-8000-000000000023'::uuid, 'b0000000-0000-4000-8000-000000000002'::uuid),
    -- Organisers' table (host b1)
    ('e0000000-0000-4000-8000-000000000024'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid),
    ('e0000000-0000-4000-8000-000000000024'::uuid, 'b0000000-0000-4000-8000-000000000002'::uuid),
    -- Free walk & talk (host b1)
    ('e0000000-0000-4000-8000-000000000025'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid),
    ('e0000000-0000-4000-8000-000000000025'::uuid, 'b0000000-0000-4000-8000-000000000007'::uuid),
    ('e0000000-0000-4000-8000-000000000025'::uuid, 'b0000000-0000-4000-8000-000000000005'::uuid)
  ) as v(event_id, user_id)
 where not exists (
   select 1 from public.rsvps r
    where r.event_id = v.event_id and r.user_id = v.user_id
 );

-- ----------------------------------------------------------------------------
-- 4. Recap photos
--
-- created_at is what the story's own ordering is measured against; the pin
-- itself expires 24h after the EVENT ends, which is why the picnic's photo
-- below never shows even though it exists. Every author is on the
-- guestlist above — the app only lets attendees post.
-- ----------------------------------------------------------------------------
insert into public.event_memories
  (id, event_id, user_id, media_url, media_type, caption, reactions, created_at)
values
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000021',
   'b0000000-0000-4000-8000-000000000001',
   'https://picsum.photos/seed/wyndhow1/720/1080', 'image',
   'Golden hour from the top deck 🌅', '{"🔥": 12, "👏": 4}'::jsonb,
   now() - interval '2 hours'),

  ('a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000021',
   'b0000000-0000-4000-8000-000000000003',
   'https://picsum.photos/seed/wyndhow2/720/1080', 'image',
   'Grill master at work 🍢', '{"🔥": 7}'::jsonb,
   now() - interval '100 minutes'),

  ('a0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000021',
   'b0000000-0000-4000-8000-000000000004',
   'https://picsum.photos/seed/wyndhow3/720/1080', 'image',
   'Skyline views forever', '{"👏": 9}'::jsonb,
   now() - interval '45 minutes'),

  -- On the two-day-old picnic: proves the window hides it, not the absence
  ('a0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000023',
   'b0000000-0000-4000-8000-000000000004',
   'https://picsum.photos/seed/wynpicnic2/720/1080', 'image',
   'Worth the 5am alarm', '{"🔥": 3}'::jsonb,
   now() - interval '48 hours')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 5. Run the clock forward. Nothing fires on an events UPDATE, so this is
--    where the three ended events actually end.
-- ----------------------------------------------------------------------------
update public.events e
   set starts_at = v.starts_at
  from (values
    ('e0000000-0000-4000-8000-000000000021'::uuid, now() - interval '6 hours'),
    ('e0000000-0000-4000-8000-000000000022'::uuid, now() - interval '7 hours'),
    ('e0000000-0000-4000-8000-000000000023'::uuid, now() - interval '50 hours')
  ) as v(id, starts_at)
 where e.id = v.id;
