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
