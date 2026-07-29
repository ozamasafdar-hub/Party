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

-- ----------------------------------------------------------------------------
-- Realtime — stream INSERT/UPDATE/DELETE on events + rsvps to every client
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.rsvps;
