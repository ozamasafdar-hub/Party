-- ============================================================================
-- WYN — Migration 003: make the live map truly public
--
-- The v1 policies only let logged-in approved members READ events, so in
-- live mode a visitor (or a freshly opened browser before signing in) saw
-- an empty map. The product behavior is: anyone can browse the map and
-- ongoing events; logging in is required only to join or host.
--
-- Run ONCE in the Supabase SQL Editor, AFTER migration 002.
-- ============================================================================

-- Anyone (signed in or not) can browse events. Ladies-only events remain
-- visible only to female members and their host.
drop policy if exists "approved members read events" on public.events;
drop policy if exists "anyone can read events" on public.events;
create policy "anyone can read events" on public.events
  for select using (
    not is_ladies_only
    or host_id = auth.uid()
    or exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.gender = 'female')
  );

-- Visitor event cards show host names, avatars and the guestlist, so
-- profiles and rsvps are readable too. (Payments, exact locations of
-- blurred events, and chat messages stay members/participants-only.)
drop policy if exists "approved members read profiles" on public.profiles;
drop policy if exists "anyone can read profiles" on public.profiles;
create policy "anyone can read profiles" on public.profiles
  for select using (true);

drop policy if exists "approved members read rsvps" on public.rsvps;
drop policy if exists "anyone can read rsvps" on public.rsvps;
create policy "anyone can read rsvps" on public.rsvps
  for select using (true);

-- Cosmetic fix from 002: the reliability error printed "%85" instead of
-- "85%". Same function otherwise.
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
