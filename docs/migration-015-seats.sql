-- ============================================================================
-- WYN — one RSVP, several people
--
-- A father brings his family. A friend brings a friend. Until now there was
-- nowhere to say so: rsvps is keyed (event_id, user_id), one row per person,
-- and capacity is literally count(*). So "four of us are coming" had to be
-- four separate accounts, which is nonsense for a nine-year-old.
--
-- This adds seats to the RSVP rather than rows to the table, deliberately.
-- The guestlist, the event chat, direct messages, follows and reliability
-- all key off one row per member. Making four rows would have broken every
-- one of them to solve an arithmetic problem.
--
-- Run ONCE in the Supabase SQL Editor, after migration 014.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The column
--
-- Ten is a party, not a block booking. A host selling more than that to one
-- person is running a different kind of event than this app is for, and an
-- unbounded number here is how one tap empties a venue.
-- ----------------------------------------------------------------------------
alter table public.rsvps
  add column if not exists seats integer not null default 1;

alter table public.rsvps drop constraint if exists rsvps_seats_check;
alter table public.rsvps add constraint rsvps_seats_check
  check (seats between 1 and 10);

-- ----------------------------------------------------------------------------
-- 2. Capacity, counted in people rather than rows
--
-- ⚠ This replaces enforce_event_capacity() wholesale. Migration 012 was
-- written because migration 011 did the same thing and silently dropped a
-- gate on the way past. Every gate the trigger has ever carried is below,
-- and anything that replaces this function in future must carry all of them:
--
--   EVENT_ENDED          the event finished before you tried to join
--   LADIES_ONLY          women-only event, joiner is not female
--   LADIES_ONLY_SEATS    women-only event, and you tried to bring guests
--   PRO_ONLY             Host Pro-only event, joiner is on the free tier
--   RELIABILITY_TOO_LOW  host set an attendance floor and you are under it
--   EVENT_FULL           not enough spots left for the party you asked for
--
-- The host is exempt from the guest-only gates: they are on their own
-- guestlist by definition and keep access after the event ends to record
-- attendance. They are NOT exempt from LADIES_ONLY_SEATS — see below.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_event_capacity()
returns trigger
language plpgsql
security definer
as $$
declare
  taken_seats integer;
  cap         integer;
  min_rel     integer;
  score       numeric;
  ev          public.events%rowtype;
  joiner_gender text;
  joiner_tier   text;
begin
  select * into ev from public.events where id = new.event_id for update;
  cap := ev.max_capacity;
  min_rel := ev.min_reliability;

  -- Everything in here is about letting someone ELSE in. The host is always
  -- allowed on their own event, before and after it runs.
  if new.user_id <> ev.host_id then

    if ev.starts_at + make_interval(mins => ev.duration_minutes) < now() then
      raise exception 'EVENT_ENDED: this event has already finished';
    end if;

    if ev.is_ladies_only then
      select gender into joiner_gender from public.profiles where id = new.user_id;
      if joiner_gender is distinct from 'female' then
        raise exception 'LADIES_ONLY: this event is for women only';
      end if;
    end if;

    if coalesce(ev.pro_only, false) and new.status in ('going', 'requested') then
      select subscription_tier into joiner_tier
        from public.profiles where id = new.user_id;
      if coalesce(joiner_tier, 'free') <> 'host_pro' then
        raise exception 'PRO_ONLY: this event is open to Host Pro members only';
      end if;
    end if;

    if min_rel is not null and new.status in ('going', 'requested') then
      select reliability_score into score
        from public.profiles where id = new.user_id;
      if coalesce(score, 100) < min_rel then
        raise exception 'RELIABILITY_TOO_LOW: this host requires a % percent attendance record or better', min_rel;
      end if;
    end if;

  end if;

  -- Outside the host exemption on purpose.
  --
  -- The ladies-only guarantee is about who ends up in the room, and a guest
  -- is a person nobody has checked. We can verify the member booking; we
  -- cannot verify "+3". Allowing extra seats here would open a hole straight
  -- through the rule migrations 011 and 013 exist to close, and it would be
  -- open to the host as well as to everybody else. A woman bringing friends
  -- invites them to join in their own names, which is the same number of
  -- taps and keeps the promise intact.
  if ev.is_ladies_only and new.seats > 1 then
    raise exception 'LADIES_ONLY_SEATS: women-only events are one place per member — ask your friends to join in their own names';
  end if;

  -- Seats, not rows. Excluding this member's own row makes the sum correct
  -- for an update as well as an insert: on an insert there is nothing to
  -- exclude, and on an update (waitlist → going, or changing party size) it
  -- replaces the old number with the new one instead of double-counting it.
  select coalesce(sum(seats), 0) into taken_seats
  from public.rsvps
  where event_id = new.event_id
    and status = 'going'
    and user_id <> new.user_id;

  if new.status = 'going' and taken_seats + new.seats > cap then
    raise exception 'EVENT_FULL: only % of % places are left',
      greatest(cap - taken_seats, 0), cap;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Waitlist promotion has to do the same arithmetic
--
-- It counted rows too. Left alone it would promote whoever waited longest
-- without asking whether their party fits — and because the capacity trigger
-- above runs on that update, an oversized promotion would RAISE inside an
-- after-delete trigger and take the delete down with it. Somebody leaving an
-- event would get an error and stay on the guestlist.
--
-- So: promote the longest-waiting party that actually fits. A group of five
-- can be skipped while a single gets in ahead of them, which is not quite
-- fair but is how every box office in the world behaves, and the alternative
-- is holding seats empty for a party that may never be completed.
-- ----------------------------------------------------------------------------
create or replace function public.promote_from_waitlist()
returns trigger
language plpgsql
security definer
as $$
declare
  cap   integer;
  taken integer;
  nxt   uuid;
begin
  select max_capacity into cap from public.events where id = old.event_id;

  select coalesce(sum(seats), 0) into taken from public.rsvps
   where event_id = old.event_id and status = 'going';

  select user_id into nxt from public.rsvps
   where event_id = old.event_id
     and status = 'waitlist'
     and seats <= cap - taken
   order by created_at
   limit 1;

  if nxt is not null then
    update public.rsvps set status = 'going'
     where event_id = old.event_id and user_id = nxt;
  end if;

  return old;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. One way in
--
-- The client could upsert an rsvp directly and still get the gates, because
-- they live in the trigger. This exists so that when migration 016 adds a
-- row of tickets per seat, the seats and the tickets are written in one
-- transaction and cannot drift apart. Same shape as record_attendance and
-- delete_my_account.
-- ----------------------------------------------------------------------------
create or replace function public.book_seats(p_event_id uuid, p_seats integer default 1)
returns void
language plpgsql
security definer
as $$
declare
  me  uuid := auth.uid();
  cap integer;
  taken integer;
  want_status text;
begin
  if me is null then
    raise exception 'NOT_SIGNED_IN: sign in to book a place';
  end if;
  if p_seats is null or p_seats < 1 or p_seats > 10 then
    raise exception 'BAD_SEATS: choose between 1 and 10 places';
  end if;

  select max_capacity into cap from public.events where id = p_event_id;
  if cap is null then
    raise exception 'NO_SUCH_EVENT: that event does not exist';
  end if;

  select coalesce(sum(seats), 0) into taken from public.rsvps
   where event_id = p_event_id and status = 'going' and user_id <> me;

  -- Approval-mode events queue; a full event waitlists the whole party
  -- rather than splitting it, because half a family is not an outing.
  select case
           when coalesce(e.approval_mode, false) then 'requested'
           when taken + p_seats > cap then 'waitlist'
           else 'going'
         end
    into want_status
    from public.events e where e.id = p_event_id;

  insert into public.rsvps (event_id, user_id, status, seats)
  values (p_event_id, me, want_status, p_seats)
  on conflict (event_id, user_id)
  do update set status = excluded.status, seats = excluded.seats;
end;
$$;

revoke all on function public.book_seats(uuid, integer) from public;
grant execute on function public.book_seats(uuid, integer) to authenticated;
