-- ============================================================================
-- WYN — Migration 012: put the Host Pro-only gate back
--
-- Migration 011 added the ladies-only and already-ended checks by replacing
-- enforce_event_capacity() wholesale, and in doing so it dropped the
-- PRO_ONLY check that migration 007 had put there. The effect on any
-- database that ran 011: a free member could RSVP to a Host Pro-only event.
-- The app still hid the button, so nothing looked wrong — which is exactly
-- the failure mode 011 was written to close in the first place.
--
-- This definition is the whole gate in one place. Every check the trigger
-- has ever carried is listed below; anything that replaces this function in
-- future must carry all of them:
--
--   EVENT_ENDED          the event finished before you tried to join
--   LADIES_ONLY          women-only event, joiner is not female
--   PRO_ONLY             Host Pro-only event, joiner is on the free tier
--   RELIABILITY_TOO_LOW  host set an attendance floor and you are under it
--   EVENT_FULL           no spots left
--
-- The host is exempt from the first four. They are not a guest applying to
-- their own event: they are on their own guestlist by definition, and they
-- keep access after it ends to record attendance. RELIABILITY_TOO_LOW joins
-- that list here, because it did lock hosts out of their own events — the
-- app inserts the host's RSVP immediately after creating the event, so a
-- host whose score sat below the floor they had just set got an error and
-- an event on the map with nobody on the guestlist, themselves included.
--
-- Run ONCE in the Supabase SQL Editor, after migration 011.
-- ============================================================================

create or replace function public.enforce_event_capacity()
returns trigger
language plpgsql
security definer
as $$
declare
  current_count integer;
  cap           integer;
  min_rel       integer;
  score         numeric;
  ev            public.events%rowtype;
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

  select count(*) into current_count
  from public.rsvps
  where event_id = new.event_id and status = 'going';

  if new.status = 'going' and current_count >= cap then
    raise exception 'EVENT_FULL: this event has reached max capacity';
  end if;

  return new;
end;
$$;
