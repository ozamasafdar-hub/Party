-- ============================================================================
-- WYN — Test data: bot members + events across Qatar (with covers)
--
-- Creates 8 bot accounts (@wyn.test — they can never log in) and ~10
-- events spread over Doha, Lusail, Al Wakrah, Al Khor and Sealine, with
-- cover photos, galleries, guestlists, a live event, a full event with a
-- waitlist, a paid+approval+blurred desert trip, a ladies-only pool day,
-- and featured pro pins.
--
-- Safe to run more than once (fixed ids + on conflict do nothing).
--
-- REMOVE ALL BOTS LATER with one line (cascades to their events, rsvps,
-- payments and messages):
--   delete from auth.users where email like '%@wyn.test';
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bot accounts (auth.users → handle_new_user trigger creates profiles)
-- ----------------------------------------------------------------------------
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change_token_new, email_change)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       email, extensions.crypt('wyn-bot-no-login', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', full_name), now(), now(), '', '', '', ''
from (values
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'faisal@wyn.test',  'Faisal Al-Kuwari'),
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'aisha@wyn.test',   'Aisha Al-Mannai'),
  ('b0000000-0000-4000-8000-000000000003'::uuid, 'salem@wyn.test',   'Salem Al-Marri'),
  ('b0000000-0000-4000-8000-000000000004'::uuid, 'maryam@wyn.test',  'Maryam Al-Emadi'),
  ('b0000000-0000-4000-8000-000000000005'::uuid, 'khalid@wyn.test',  'Khalid Al-Sulaiti'),
  ('b0000000-0000-4000-8000-000000000006'::uuid, 'dana@wyn.test',    'Dana Al-Naimi'),
  ('b0000000-0000-4000-8000-000000000007'::uuid, 'yousuf@wyn.test',  'Yousuf Darwish'),
  ('b0000000-0000-4000-8000-000000000008'::uuid, 'hessa@wyn.test',   'Hessa Al-Thani')
) as bots(id, email, full_name)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Profiles: gender, reliability history, subscription tiers
--    (must run before events/rsvps — the tier & reliability triggers read it)
-- ----------------------------------------------------------------------------
update public.profiles set gender = 'male',   reliability_score = 96,  events_attended = 24, events_flaked = 1,
       subscription_tier = 'host_pro', subscription_status = 'active',
       bio = 'Sea, padel, karak — in that order ⚓'
 where id = 'b0000000-0000-4000-8000-000000000001';
update public.profiles set gender = 'female', reliability_score = 99,  events_attended = 35, events_flaked = 0,
       subscription_tier = 'host_pro', subscription_status = 'active',
       bio = 'Art, brunches and good company 🎨'
 where id = 'b0000000-0000-4000-8000-000000000002';
update public.profiles set gender = 'male',   reliability_score = 91,  events_attended = 30, events_flaked = 3,
       subscription_tier = 'host_pro', subscription_status = 'active',
       bio = 'Desert trips every winter weekend 🏜️'
 where id = 'b0000000-0000-4000-8000-000000000003';
update public.profiles set gender = 'female', reliability_score = 88,  events_attended = 14, events_flaked = 2,
       bio = 'Board games and karak enthusiast ☕'
 where id = 'b0000000-0000-4000-8000-000000000004';
update public.profiles set gender = 'male',   reliability_score = 74,  events_attended = 11, events_flaked = 4,
       bio = 'Football on the beach, every week'
 where id = 'b0000000-0000-4000-8000-000000000005';
update public.profiles set gender = 'female', reliability_score = 95,  events_attended = 19, events_flaked = 1,
       bio = 'Kayaks, mangroves, sunrises 🛶'
 where id = 'b0000000-0000-4000-8000-000000000006';
update public.profiles set gender = 'male',   reliability_score = 63,  events_attended = 10, events_flaked = 6,
       bio = 'Movie buff — Novo & Msheireb regular'
 where id = 'b0000000-0000-4000-8000-000000000007';
update public.profiles set gender = 'female', reliability_score = 100, events_attended = 8,  events_flaked = 0,
       bio = 'Museums, culture and calligraphy'
 where id = 'b0000000-0000-4000-8000-000000000008';

-- ----------------------------------------------------------------------------
-- 3. Events (is_pro_event is set automatically by the tier trigger)
-- ----------------------------------------------------------------------------
insert into public.events
  (id, host_id, title, description, category, location_name, lat, lng,
   starts_at, duration_minutes, max_capacity, cover_url, photo_urls,
   approval_mode, min_reliability, price_per_spot, is_ladies_only,
   is_location_blurred, is_featured_pin)
values
  -- Faisal (PRO): featured paid yacht party + padel night
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'Sunset yacht party — Porto Arabia',
   '46ft yacht, swimming stop near Banana Island, sunset over the skyline. Snacks and karak on board.',
   'yacht', 'Porto Arabia, The Pearl', 25.3697, 51.5536,
   now() + interval '26 hours', 360, 12,
   'https://picsum.photos/seed/wynyacht/800/450',
   array['https://picsum.photos/seed/wynyacht/800/450','https://picsum.photos/seed/wynsea/800/450','https://picsum.photos/seed/wyndeck/800/450'],
   false, null, 150, false, false, true),

  ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
   'Padel night under the lights',
   'Four courts booked in Lusail. All levels — we rotate pairs every 20 minutes.',
   'sports', 'Padel In, Lusail', 25.4106, 51.4904,
   now() + interval '8 hours', 120, 16,
   'https://picsum.photos/seed/wynpadel/800/450',
   array['https://picsum.photos/seed/wynpadel/800/450'],
   false, null, 40, false, false, true),

  -- Aisha (PRO): ladies-only pool day + gallery walk
  ('e0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002',
   'Ladies pool day — West Bay',
   'Girls-only afternoon at the pool deck: cabanas booked, bring SPF and good stories 💅',
   'other', 'W Hotel, West Bay', 25.3208, 51.5305,
   now() + interval '30 hours', 300, 15,
   'https://picsum.photos/seed/wynpool/800/450',
   array['https://picsum.photos/seed/wynpool/800/450','https://picsum.photos/seed/wyncabana/800/450'],
   false, null, 0, true, false, false),

  ('e0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000002',
   'Gallery walk at the Fire Station',
   'Guided walk through the new resident-artists exhibition, then karak at the garage café.',
   'culture', 'Fire Station Artist in Residence', 25.2925, 51.5137,
   now() + interval '50 hours', 120, 20,
   'https://picsum.photos/seed/wynart/800/450',
   array['https://picsum.photos/seed/wynart/800/450'],
   false, null, 0, false, false, false),

  -- Salem (PRO): paid + approval + reliability lock + blurred location
  ('e0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000003',
   'Overnight desert camp — Sealine',
   'Dune bashing, BBQ, bonfire and tents at our family camp. QR 200 covers food, gear and the 4x4 convoy. Serious attendees only.',
   'other', 'Sealine desert camp', 24.7510, 51.0310,
   now() + interval '3 days', 720, 10,
   'https://picsum.photos/seed/wyndunes/800/450',
   array['https://picsum.photos/seed/wyndunes/800/450','https://picsum.photos/seed/wyncamp/800/450','https://picsum.photos/seed/wynfire/800/450'],
   true, 80, 200, false, true, false),

  -- Maryam (free): small karak night
  ('e0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000004',
   'Karak & board games',
   'Catan, Jackal and endless karak at our usual café. Small cozy table — first five in.',
   'dining', 'Al Sadd café strip', 25.2782, 51.4906,
   now() + interval '5 hours', 180, 5,
   'https://picsum.photos/seed/wynkarak/800/450',
   array['https://picsum.photos/seed/wynkarak/800/450'],
   false, null, 0, false, false, false),

  -- Khalid (free): LIVE right now
  ('e0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000005',
   'Beach football — Al Wakrah',
   'Happening now! 5-a-side on the sand next to the old port. Jump in for the next match.',
   'sports', 'Al Wakrah beach', 25.1715, 51.6067,
   now() - interval '30 minutes', 180, 5,
   'https://picsum.photos/seed/wynbeach/800/450',
   array['https://picsum.photos/seed/wynbeach/800/450'],
   false, null, 0, false, false, false),

  -- Dana (free): kayaking, deliberately FULL (waitlist demo)
  ('e0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000006',
   'Sunrise kayaking — Purple Island',
   'Through the mangroves at first light. 4 kayaks only — waitlist opens once we''re full.',
   'sports', 'Purple Island, Al Khor', 25.6799, 51.5468,
   now() + interval '20 hours', 150, 4,
   'https://picsum.photos/seed/wynkayak/800/450',
   array['https://picsum.photos/seed/wynkayak/800/450'],
   false, null, 0, false, false, false),

  -- Yousuf (free): cinema night
  ('e0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000007',
   'Movie night at Msheireb',
   'New release at the boutique cinema, dinner at the food hall after. Meeting by the box office.',
   'cinema', 'Msheireb Downtown', 25.2854, 51.5310,
   now() + interval '10 hours', 150, 5,
   'https://picsum.photos/seed/wyncinema/800/450',
   array['https://picsum.photos/seed/wyncinema/800/450'],
   false, null, 0, false, false, false),

  -- Hessa (free): museum tour
  ('e0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000008',
   'MIA highlights tour',
   'One-hour walk through the Museum of Islamic Art''s best pieces, then karak on the MIA park lawn.',
   'culture', 'Museum of Islamic Art', 25.2760, 51.5390,
   now() + interval '2 days', 90, 5,
   'https://picsum.photos/seed/wynmia/800/450',
   array['https://picsum.photos/seed/wynmia/800/450'],
   false, null, 0, false, false, false)
on conflict (id) do nothing;

-- Exact spot for the blurred desert camp (host + approved guests only)
insert into public.event_locations (event_id, lat, lng)
values ('e0000000-0000-4000-8000-000000000005', 24.7405, 51.0335)
on conflict (event_id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Guestlists (hosts + cross-joins; kayaking ends up full with a waitlist)
-- ----------------------------------------------------------------------------
insert into public.rsvps (event_id, user_id, status) values
  -- hosts attend their own events
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'going'),
  ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'going'),
  ('e0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'going'),
  ('e0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000002', 'going'),
  ('e0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000003', 'going'),
  ('e0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000004', 'going'),
  ('e0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000005', 'going'),
  ('e0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000006', 'going'),
  ('e0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000007', 'going'),
  ('e0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000008', 'going'),
  -- yacht party guests (paid)
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'going'),
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'going'),
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000006', 'going'),
  -- padel
  ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000005', 'going'),
  ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000007', 'going'),
  -- ladies pool day
  ('e0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004', 'going'),
  ('e0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000006', 'going'),
  ('e0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000008', 'going'),
  -- gallery walk
  ('e0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000008', 'going'),
  -- desert camp: two paid guests + one pending request for the host to review
  ('e0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'going'),
  ('e0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000002', 'going'),
  ('e0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000004', 'requested'),
  -- karak night
  ('e0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000007', 'going'),
  ('e0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000008', 'going'),
  -- beach football (live)
  ('e0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000001', 'going'),
  ('e0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000003', 'going'),
  -- kayaking: FULL (cap 4) + waitlist
  ('e0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000005', 'going'),
  ('e0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000007', 'going'),
  ('e0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000008', 'going'),
  ('e0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000004', 'waitlist'),
  -- cinema
  ('e0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000006', 'going'),
  -- museum tour
  ('e0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000002', 'going')
on conflict (event_id, user_id) do nothing;

-- Escrow payments for the paid events
insert into public.rsvp_payments (event_id, user_id, amount, status) values
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 150, 'held_in_escrow'),
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 150, 'held_in_escrow'),
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000006', 150, 'held_in_escrow'),
  ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000005', 40,  'held_in_escrow'),
  ('e0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 200, 'held_in_escrow'),
  ('e0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000002', 200, 'held_in_escrow'),
  ('e0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000004', 200, 'pending')
on conflict (event_id, user_id) do nothing;

-- A little chat history on the yacht party
insert into public.messages (id, event_id, user_id, body, created_at) values
  ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001', 'Berth 12, Porto Arabia — look for the blue hull ⚓', now() - interval '3 hours'),
  ('c0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000002', 'Anyone carpooling from West Bay?', now() - interval '2 hours'),
  ('c0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000003', 'I can take 3 — leaving 4:30 from City Center', now() - interval '90 minutes')
on conflict (id) do nothing;
