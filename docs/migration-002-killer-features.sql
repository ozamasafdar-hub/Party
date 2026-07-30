-- ============================================================================
-- WYN — Migration 002: host controls, reliability, payments, privacy
-- Run ONCE in the Supabase SQL Editor on a database that already has the
-- original schema (docs/database-schema.sql). Fresh installs should run the
-- updated main schema instead, which already includes all of this.
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
      raise exception 'RELIABILITY_TOO_LOW: this host requires a %%% attendance record', min_rel;
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
-- Ladies-only events are visible only to female members (and the host)
-- ----------------------------------------------------------------------------
drop policy if exists "approved members read events" on public.events;
create policy "approved members read events" on public.events
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_approved)
    and (
      not is_ladies_only
      or host_id = auth.uid()
      or exists (select 1 from public.profiles p2
                  where p2.id = auth.uid() and p2.gender = 'female')
    )
  );
