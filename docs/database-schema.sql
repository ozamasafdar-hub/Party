-- ============================================================================
-- WYN — production database schema (Supabase / PostgreSQL + PostGIS)
--
-- Three core tables: profiles (Users), events (with geospatial coordinates),
-- rsvps. Plus invites for the members-only gate.
-- Run in the Supabase SQL editor. Realtime is enabled on events + rsvps so
-- every connected client's map updates the moment anything changes.
-- ============================================================================

create extension if not exists postgis;

-- ----------------------------------------------------------------------------
-- USERS — profiles extends Supabase's built-in auth.users
-- ----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  avatar_url  text,
  bio         text,
  -- Open sign-up: approved by default. Flip to false (or change the
  -- default) to gate access behind admin approval later.
  is_approved boolean not null default true,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile the moment an account signs up (name arrives via
-- the sign-up call's user metadata)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
             split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- EVENTS — geospatial coordinates stored as PostGIS geography
-- ----------------------------------------------------------------------------
create type public.event_category as enum
  ('bowling', 'yacht', 'golf', 'cinema', 'dining', 'sports', 'culture', 'other');

create table public.events (
  id               uuid primary key default gen_random_uuid(),
  host_id          uuid not null references public.profiles (id) on delete cascade,
  title            text not null check (char_length(title) between 3 and 80),
  description      text check (char_length(description) <= 400),
  category         public.event_category not null default 'other',
  location_name    text not null,
  lat              double precision not null check (lat between -90 and 90),
  lng              double precision not null check (lng between -180 and 180),
  -- geography(Point) derived from lat/lng; distance queries return meters
  location         geography (point, 4326) generated always as
                     (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  starts_at        timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 15 and 1440),
  max_capacity     integer not null check (max_capacity between 2 and 500),
  cover_url        text,
  is_cancelled     boolean not null default false,
  created_at       timestamptz not null default now()
);

-- Spatial index → fast "events within N km of me" / bounding-box queries
create index events_location_idx on public.events using gist (location);
create index events_starts_at_idx on public.events (starts_at);

-- ----------------------------------------------------------------------------
-- RSVPS — one row per member per event
-- ----------------------------------------------------------------------------
create table public.rsvps (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'going' check (status in ('going', 'waitlist', 'cancelled')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index rsvps_user_idx on public.rsvps (user_id);

-- ----------------------------------------------------------------------------
-- Capacity auto-close: reject RSVPs once max_capacity is reached.
-- Runs inside the transaction, so two simultaneous joins can't oversell
-- the last spot.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_event_capacity()
returns trigger
language plpgsql
security definer
as $$
declare
  current_count integer;
  cap integer;
begin
  select max_capacity into cap from public.events where id = new.event_id for update;

  select count(*) into current_count
  from public.rsvps
  where event_id = new.event_id and status = 'going';

  if new.status = 'going' and current_count >= cap then
    raise exception 'EVENT_FULL: this event has reached max capacity';
  end if;

  return new;
end;
$$;

create trigger rsvps_capacity_check
  before insert or update on public.rsvps
  for each row execute function public.enforce_event_capacity();

-- ----------------------------------------------------------------------------
-- Waitlist promotion: when a "going" spot frees up, the longest-waiting
-- member is promoted automatically.
-- ----------------------------------------------------------------------------
create or replace function public.promote_from_waitlist()
returns trigger
language plpgsql
security definer
as $$
declare
  cap integer;
  cnt integer;
  nxt uuid;
begin
  select max_capacity into cap from public.events where id = old.event_id;
  select count(*) into cnt from public.rsvps
   where event_id = old.event_id and status = 'going';
  if cnt < cap then
    select user_id into nxt from public.rsvps
     where event_id = old.event_id and status = 'waitlist'
     order by created_at limit 1;
    if nxt is not null then
      update public.rsvps set status = 'going'
       where event_id = old.event_id and user_id = nxt;
    end if;
  end if;
  return old;
end;
$$;

create trigger rsvps_promote_waitlist
  after delete on public.rsvps
  for each row execute function public.promote_from_waitlist();

-- ----------------------------------------------------------------------------
-- MESSAGES — per-event chat
-- ----------------------------------------------------------------------------
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index messages_event_idx on public.messages (event_id, created_at);

-- ----------------------------------------------------------------------------
-- FOLLOWS — the social graph behind friend highlights
-- ----------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- ----------------------------------------------------------------------------
-- "Events near me" RPC — the map calls this with the visible bounds' center
-- ----------------------------------------------------------------------------
create or replace function public.events_within_radius(
  center_lat double precision,
  center_lng double precision,
  radius_m   double precision default 30000
)
returns setof public.events
language sql
stable
as $$
  select *
  from public.events e
  where not e.is_cancelled
    and e.starts_at + make_interval(mins => e.duration_minutes) > now()
    and st_dwithin(
      e.location,
      st_setsrid(st_makepoint(center_lng, center_lat), 4326)::geography,
      radius_m
    )
  order by e.starts_at;
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security — members-only at the database layer
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.events   enable row level security;
alter table public.rsvps    enable row level security;
alter table public.messages enable row level security;
alter table public.follows  enable row level security;

-- Only approved members can see anything
create policy "approved members read profiles" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_approved)
  );

-- A signed-in user can always read their own row (to check approval status)
create policy "read own profile" on public.profiles
  for select using (id = auth.uid());

create policy "members update own profile" on public.profiles
  for update using (id = auth.uid());

create policy "approved members read events" on public.events
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_approved)
  );

create policy "approved members create events" on public.events
  for insert with check (
    host_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_approved)
  );

create policy "hosts manage own events" on public.events
  for update using (host_id = auth.uid());

create policy "approved members read rsvps" on public.rsvps
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_approved)
  );

create policy "members manage own rsvps" on public.rsvps
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "approved members read messages" on public.messages
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_approved)
  );

create policy "approved members read follows" on public.follows
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_approved)
  );

create policy "members manage own follows" on public.follows
  for all using (follower_id = auth.uid()) with check (follower_id = auth.uid());

-- Only people on the event (host, going, or waitlisted) can post
create policy "attendees post messages" on public.messages
  for insert with check (
    user_id = auth.uid()
    and (
      exists (select 1 from public.rsvps r
               where r.event_id = messages.event_id and r.user_id = auth.uid())
      or exists (select 1 from public.events e
                  where e.id = messages.event_id and e.host_id = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- Avatar storage — public bucket; members write only inside their own
-- folder (avatars/<user-id>/...)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "anyone can view avatars" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "members upload own avatar" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "members update own avatar" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Event cover photos — same pattern as avatars
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

create policy "anyone can view covers" on storage.objects
  for select using (bucket_id = 'covers');

create policy "members upload own covers" on storage.objects
  for insert with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- Realtime — stream INSERT/UPDATE/DELETE on events + rsvps to every client
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.rsvps;
alter publication supabase_realtime add table public.messages;


-- ============================================================================
-- Migration 002 content (idempotent — safe on fresh installs and upgrades)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Profiles: gender (for ladies-only events) + reliability tracking
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists gender text check (gender in ('female', 'male')),
  add column if not exists reliability_score numeric not null default 100,
  add column if not exists events_attended integer not null default 0,
  add column if not exists events_flaked integer not null default 0;

-- ----------------------------------------------------------------------------
-- Events: approval mode, reliability gate, price, privacy flags
-- ----------------------------------------------------------------------------
alter table public.events
  add column if not exists approval_mode boolean not null default false,
  add column if not exists min_reliability integer
    check (min_reliability between 0 and 100),
  add column if not exists price_per_spot numeric(8,2) not null default 0,
  add column if not exists is_ladies_only boolean not null default false,
  add column if not exists is_location_blurred boolean not null default false,
  add column if not exists attendance_recorded boolean not null default false;

-- ----------------------------------------------------------------------------
-- RSVPs: new statuses for the approval flow + attendance outcome
-- ----------------------------------------------------------------------------
alter table public.rsvps drop constraint if exists rsvps_status_check;
alter table public.rsvps add constraint rsvps_status_check
  check (status in ('going', 'waitlist', 'cancelled', 'requested', 'no_show'));

-- Hosts can approve/decline requests on their own events
drop policy if exists "hosts manage rsvps on own events" on public.rsvps;
create policy "hosts manage rsvps on own events" on public.rsvps
  for all using (
    exists (select 1 from public.events e
             where e.id = rsvps.event_id and e.host_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Capacity trigger now also enforces the host's minimum reliability score
-- ----------------------------------------------------------------------------
create or replace function public.enforce_event_capacity()
returns trigger
language plpgsql
security definer
as $$
declare
  current_count integer;
  cap integer;
  min_rel integer;
  score numeric;
begin
  select max_capacity, min_reliability into cap, min_rel
    from public.events where id = new.event_id for update;

  if new.status in ('going', 'requested') and min_rel is not null then
    select reliability_score into score
      from public.profiles where id = new.user_id;
    if coalesce(score, 100) < min_rel then
      raise exception 'RELIABILITY_TOO_LOW: this host requires a % percent attendance record or better', min_rel;
    end if;
  end if;

  select count(*) into current_count
  from public.rsvps
  where event_id = new.event_id and status = 'going';

  if new.status = 'going' and current_count >= cap then
    raise exception 'EVENT_FULL: this event has reached max capacity';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Payments (simulated escrow until a real Qatar gateway is connected)
-- ----------------------------------------------------------------------------
create table if not exists public.rsvp_payments (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  amount     numeric(8,2) not null,
  status     text not null default 'held_in_escrow'
    check (status in ('pending', 'held_in_escrow', 'released', 'refunded')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.rsvp_payments enable row level security;

create policy "approved members read payments" on public.rsvp_payments
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_approved)
  );

create policy "members manage own payments" on public.rsvp_payments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "hosts update payments on own events" on public.rsvp_payments
  for update using (
    exists (select 1 from public.events e
             where e.id = rsvp_payments.event_id and e.host_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Exact locations for blurred events — host + confirmed guests only.
-- The main events row stores coordinates offset ~300 m for everyone else.
-- ----------------------------------------------------------------------------
create table if not exists public.event_locations (
  event_id uuid primary key references public.events (id) on delete cascade,
  lat double precision not null,
  lng double precision not null
);

alter table public.event_locations enable row level security;

create policy "host manages exact location" on public.event_locations
  for all using (
    exists (select 1 from public.events e
             where e.id = event_locations.event_id and e.host_id = auth.uid())
  ) with check (
    exists (select 1 from public.events e
             where e.id = event_locations.event_id and e.host_id = auth.uid())
  );

create policy "confirmed guests read exact location" on public.event_locations
  for select using (
    exists (select 1 from public.rsvps r
             where r.event_id = event_locations.event_id
               and r.user_id = auth.uid() and r.status = 'going')
  );

-- ----------------------------------------------------------------------------
-- Attendance recording — host marks no-shows once, after the event ends.
-- Everyone else on the guestlist counts as attended; scores update.
-- ----------------------------------------------------------------------------
create or replace function public.record_attendance(p_event_id uuid, no_show_ids uuid[])
returns void
language plpgsql
security definer
as $$
declare
  guest record;
begin
  if not exists (
    select 1 from public.events e
     where e.id = p_event_id
       and e.host_id = auth.uid()
       and e.starts_at + make_interval(mins => e.duration_minutes) < now()
       and not e.attendance_recorded
  ) then
    raise exception 'NOT_ALLOWED: only the host may record attendance, once, after the event ends';
  end if;

  for guest in
    select user_id from public.rsvps
     where event_id = p_event_id and status = 'going' and user_id <> auth.uid()
  loop
    if guest.user_id = any(no_show_ids) then
      update public.rsvps set status = 'no_show'
       where event_id = p_event_id and user_id = guest.user_id;
      update public.profiles set events_flaked = events_flaked + 1
       where id = guest.user_id;
    else
      update public.profiles set events_attended = events_attended + 1
       where id = guest.user_id;
    end if;
    update public.profiles
       set reliability_score =
             round(100.0 * events_attended / greatest(1, events_attended + events_flaked))
     where id = guest.user_id;
  end loop;

  update public.events set attendance_recorded = true where id = p_event_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- The map is PUBLIC (migration 003): anyone — signed in or not — can browse
-- events, host profiles, and guestlists. Logging in is required only to
-- join or host. Ladies-only events remain visible only to female members
-- and their host. Payments, exact locations of blurred events, and chat
-- messages stay members/participants-only.
-- ----------------------------------------------------------------------------
drop policy if exists "approved members read events" on public.events;
drop policy if exists "anyone can read events" on public.events;
create policy "anyone can read events" on public.events
  for select using (
    not is_ladies_only
    or host_id = auth.uid()
    or exists (select 1 from public.profiles p2
                where p2.id = auth.uid() and p2.gender = 'female')
  );

drop policy if exists "approved members read profiles" on public.profiles;
drop policy if exists "anyone can read profiles" on public.profiles;
create policy "anyone can read profiles" on public.profiles
  for select using (true);

drop policy if exists "approved members read rsvps" on public.rsvps;
drop policy if exists "anyone can read rsvps" on public.rsvps;
create policy "anyone can read rsvps" on public.rsvps
  for select using (true);
-- ============================================================================
-- WYN — Migration 004: multiple photos per event
--
-- Events gain a photo gallery. photo_urls holds every photo in display
-- order; cover_url stays in sync with the first one (map cards and older
-- rows keep working unchanged).
--
-- Run ONCE in the Supabase SQL Editor.
-- ============================================================================

alter table public.events
  add column if not exists photo_urls text[] not null default '{}';

-- Backfill: existing single covers become one-photo galleries
update public.events
   set photo_urls = array[cover_url]
 where cover_url is not null and photo_urls = '{}';
-- ============================================================================
-- WYN — Migration 005: Freemium vs Host Pro tiers
--
-- Free hosts: 1 live pin at a time, 2 events per calendar month, max 5
-- guests, free events only, no reliability lock, no featured pin.
-- Host Pro: all limits lifted + featured glowing pins + paid events +
-- reliability locks + WhatsApp broadcasts (client feature).
--
-- Notes:
--  * The spec's `events_hosted_this_month` counter is computed from
--    events.created_at instead of stored — no monthly reset job needed
--    and it can never drift out of sync.
--  * The subscription itself is SIMULATED (set_subscription RPC) until a
--    real payment provider is connected; the enforcement is real.
--
-- Run ONCE in the Supabase SQL Editor, after migrations 002-004.
-- ============================================================================

alter table public.profiles
  add column if not exists subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'host_pro')),
  add column if not exists subscription_status text not null default 'none'
    check (subscription_status in ('active', 'canceled', 'past_due', 'none'));

alter table public.events
  add column if not exists is_pro_event boolean not null default false,
  add column if not exists is_featured_pin boolean not null default false;
-- (price_per_spot already exists from migration 002)

-- ----------------------------------------------------------------------------
-- Tier enforcement — runs server-side on every event insert, so the limits
-- hold even against a modified client.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_host_tier()
returns trigger
language plpgsql
security definer
as $$
declare
  tier text;
  active_count integer;
  month_count integer;
begin
  select subscription_tier into tier
    from public.profiles where id = new.host_id;

  if coalesce(tier, 'free') = 'host_pro' then
    new.is_pro_event := true;
    return new;
  end if;

  -- Free tier: strip pro-only styling and enforce the caps
  new.is_pro_event := false;
  new.is_featured_pin := false;

  if new.max_capacity > 5 then
    raise exception 'FREE_TIER_CAPACITY: free events are capped at 5 guests';
  end if;
  if coalesce(new.price_per_spot, 0) > 0 then
    raise exception 'FREE_TIER_PAID: paid events need Host Pro';
  end if;
  if new.min_reliability is not null then
    raise exception 'FREE_TIER_RELIABILITY: reliability locks need Host Pro';
  end if;

  select count(*) into active_count
    from public.events e
   where e.host_id = new.host_id
     and not e.is_cancelled
     and e.starts_at + make_interval(mins => e.duration_minutes) > now();
  if active_count >= 1 then
    raise exception 'FREE_TIER_PINS: free hosts keep 1 live pin on the map';
  end if;

  select count(*) into month_count
    from public.events e
   where e.host_id = new.host_id
     and date_trunc('month', e.created_at) = date_trunc('month', now());
  if month_count >= 2 then
    raise exception 'FREE_TIER_MONTHLY: free hosts can create 2 events per month';
  end if;

  return new;
end;
$$;

drop trigger if exists events_tier_check on public.events;
create trigger events_tier_check
  before insert on public.events
  for each row execute function public.enforce_host_tier();

-- ----------------------------------------------------------------------------
-- Simulated subscription switch — replace with real billing webhooks later.
-- Members can only change their own tier.
-- ----------------------------------------------------------------------------
create or replace function public.set_subscription(p_tier text)
returns void
language plpgsql
security definer
as $$
begin
  if p_tier not in ('free', 'host_pro') then
    raise exception 'invalid tier';
  end if;
  update public.profiles
     set subscription_tier = p_tier,
         subscription_status = case when p_tier = 'host_pro' then 'active' else 'none' end
   where id = auth.uid();
end;
$$;
-- ============================================================================
-- WYN — Migration 006: 24-Hour Memory Pins (post-event photo/video recaps)
--
-- When an event ends its pin becomes a "memory pin" for 24 hours: verified
-- attendees upload photos / short clips; everyone else can watch the
-- story-style recap.
--
-- Design note: the spec's stored status enum ('upcoming'/'live'/'ended'/
-- 'expired') and ended_at / memory_expires_at columns are COMPUTED instead:
--   ended_at          = starts_at + duration_minutes
--   memory_expires_at = ended_at + 24 hours
-- No cron job has to flip states, and nothing can drift out of sync.
--
-- Run ONCE in the Supabase SQL Editor.
-- ============================================================================

create table if not exists public.event_memories (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  media_url  text not null,
  media_type text not null check (media_type in ('image', 'video')),
  caption    text check (char_length(caption) <= 100),
  reactions  jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists event_memories_event_idx
  on public.event_memories (event_id, created_at);

alter table public.event_memories enable row level security;

-- The map is public — anyone can watch recaps (that's the FOMO loop)
drop policy if exists "anyone can view memories" on public.event_memories;
create policy "anyone can view memories" on public.event_memories
  for select using (true);

-- Only verified attendees may post, and only during the 24h window
drop policy if exists "attendees post memories in the window" on public.event_memories;
create policy "attendees post memories in the window" on public.event_memories
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1
        from public.events e
        join public.rsvps r
          on r.event_id = e.id and r.user_id = auth.uid() and r.status = 'going'
       where e.id = event_memories.event_id
         and e.starts_at + make_interval(mins => e.duration_minutes) < now()
         and e.starts_at + make_interval(mins => e.duration_minutes)
             + interval '24 hours' > now()
    )
  );

drop policy if exists "members delete own memories" on public.event_memories;
create policy "members delete own memories" on public.event_memories
  for delete using (user_id = auth.uid());

drop policy if exists "hosts moderate memories on own events" on public.event_memories;
create policy "hosts moderate memories on own events" on public.event_memories
  for delete using (
    exists (select 1 from public.events e
             where e.id = event_memories.event_id and e.host_id = auth.uid())
  );

-- Emoji reactions from viewers (attendee or not) — counts kept in jsonb
create or replace function public.react_to_memory(p_memory_id uuid, p_emoji text)
returns void
language plpgsql
security definer
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in to react';
  end if;
  if p_emoji not in ('🔥', '👏') then
    raise exception 'unsupported reaction';
  end if;
  update public.event_memories
     set reactions = jsonb_set(
           reactions, array[p_emoji],
           to_jsonb(coalesce((reactions ->> p_emoji)::int, 0) + 1))
   where id = p_memory_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Storage bucket for recap media (public read, members upload to own folder)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('memories', 'memories', true)
on conflict (id) do nothing;

drop policy if exists "anyone can view memory media" on storage.objects;
create policy "anyone can view memory media" on storage.objects
  for select using (bucket_id = 'memories');

drop policy if exists "members upload own memory media" on storage.objects;
create policy "members upload own memory media" on storage.objects
  for insert with check (
    bucket_id = 'memories'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
