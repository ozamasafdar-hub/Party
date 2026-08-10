-- ============================================================================
-- WYN — Migration 011: enforce ladies-only and "already ended" on joining
--
-- Two rules were enforced only by what the app showed you:
--
--   * Ladies-only events are hidden from members who are not female, but
--     the rsvps insert policy never checked it. Anyone who came by an
--     event id — a link forwarded by a friend who can see it, or a tab
--     open since before the host flipped the toggle — could still RSVP.
--   * Nothing stopped anyone joining an event that finished hours ago.
--
-- Both now live in enforce_event_capacity(), which already runs SECURITY
-- DEFINER on every rsvps insert, so there is no new surface to secure and
-- no second round trip.
--
-- The host is exempt from both: they are on their own guestlist, and they
-- keep access to their own event after it ends to record attendance.
--
-- Run ONCE in the Supabase SQL Editor, after migration 010.
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
begin
  select * into ev from public.events where id = new.event_id for update;
  cap := ev.max_capacity;
  min_rel := ev.min_reliability;

  -- The host is always allowed on their own event, before and after it runs
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

  end if;

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
