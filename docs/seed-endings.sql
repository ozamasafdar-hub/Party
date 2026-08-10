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
-- Run AFTER seed-bots.sql, and after migrations 008 and 011.
-- Safe to run more than once.
--
-- Remove everything from both seed files with one line:
--   delete from auth.users where email like '%@wyn.test';
-- ============================================================================

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
   now() - interval '6 hours', 180, 12,
   'https://picsum.photos/seed/wyndhow1/800/450',
   array['https://picsum.photos/seed/wyndhow1/800/450'],
   false, 0, false, false, false, false, null),

  -- Ended 5h ago and nobody posted → no recap chip, no pin, nothing
  ('e0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-000000000006',
   'Pub quiz at the Torch',
   'Six rounds, one team, zero chance. Free to join, bring your general knowledge.',
   'other', 'The Torch, Aspire', 25.2606, 51.4447,
   now() - interval '7 hours', 120, 8,
   null, array[]::text[],
   false, 0, false, false, false, false, null),

  -- Ended two days ago, and it has a photo: the 24h window is what hides it
  ('e0000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-000000000004',
   'Sunrise picnic — Al Bidda',
   'Early start, flasks of karak, and the skyline waking up across the bay.',
   'other', 'Al Bidda Park', 25.2985, 51.5233,
   now() - interval '50 hours', 120, 10,
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
  ('e0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-000000000007',
   'Free walk & talk — Aspire Park',
   'Two laps of the lake at an easy pace. No cost, no signup fee, just turn up.',
   'sports', 'Aspire Park', 25.2632, 51.4479,
   now() + interval '14 hours', 60, 20,
   null, array[]::text[],
   false, 0, false, false, false, false, '#6366F1')
on conflict (id) do nothing;

-- Guestlists (hosts are added by the app; these are the others)
insert into public.rsvps (event_id, user_id, status) values
  ('e0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000003', 'going'),
  ('e0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000001', 'going'),
  ('e0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000004', 'going'),
  ('e0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000006', 'going'),
  ('e0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-000000000006', 'going'),
  ('e0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-000000000008', 'going'),
  ('e0000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-000000000004', 'going'),
  ('e0000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-000000000002', 'going'),
  ('e0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001', 'going'),
  ('e0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000002', 'going'),
  ('e0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-000000000007', 'going'),
  ('e0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-000000000005', 'going')
on conflict (event_id, user_id) do nothing;

-- ----------------------------------------------------------------------------
-- Recap photos
--
-- created_at is what the 24h window is measured against for the story's
-- own ordering; the pin itself expires 24h after the EVENT ends, which is
-- why the picnic's photo below never shows even though it exists.
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

-- The organisers' dinner needs a Host Pro host for its pro-only flag to
-- survive the enforce_host_tier trigger
update public.profiles
   set subscription_tier = 'host_pro', subscription_status = 'active'
 where id in ('b0000000-0000-4000-8000-000000000001',
              'b0000000-0000-4000-8000-000000000002');
