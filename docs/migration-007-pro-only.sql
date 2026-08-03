-- ============================================================================
-- WYN — Migration 007: "Host Pro members only" events
--
-- A Host Pro host can restrict an event so only other Host Pro members can
-- join or request a spot. Setting the flag is itself a Pro perk (free
-- hosts have it stripped, like featured pins).
--
-- Run ONCE in the Supabase SQL Editor, after migration 006.
-- ============================================================================

alter table public.events
  add column if not exists pro_only boolean not null default false;

-- ----------------------------------------------------------------------------
-- Join enforcement: capacity + reliability + Pro-only, all server-side
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
  only_pro boolean;
  score numeric;
  tier text;
begin
  select max_capacity, min_reliability, pro_only
    into cap, min_rel, only_pro
    from public.events where id = new.event_id for update;

  if new.status in ('going', 'requested') then
    if min_rel is not null then
      select reliability_score into score
        from public.profiles where id = new.user_id;
      if coalesce(score, 100) < min_rel then
        raise exception 'RELIABILITY_TOO_LOW: this host requires a % percent attendance record or better', min_rel;
      end if;
    end if;

    if coalesce(only_pro, false) then
      select subscription_tier into tier
        from public.profiles where id = new.user_id;
      if coalesce(tier, 'free') <> 'host_pro' then
        raise exception 'PRO_ONLY: this event is open to Host Pro members only';
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

-- ----------------------------------------------------------------------------
-- Free hosts can't set the flag (same treatment as featured pins)
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

  new.is_pro_event := false;
  new.is_featured_pin := false;
  new.pro_only := false;

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

-- ----------------------------------------------------------------------------
-- Optional: let logged-out visitors see follower counts on profiles.
-- (Following/followers still only writable by their owner.)
-- ----------------------------------------------------------------------------
drop policy if exists "approved members read follows" on public.follows;
drop policy if exists "anyone can read follows" on public.follows;
create policy "anyone can read follows" on public.follows
  for select using (true);
