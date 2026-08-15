-- ============================================================================
-- WYN — Migration 014: leaving, without taking everyone else's evening
--
-- Until now there was no way for a member to leave at all. Adding one is
-- not optional: WYN holds names, photographs, locations and private
-- messages for real people, and under Qatar's PDPL they have a right to
-- have that erased.
--
-- The obvious implementation is wrong. Every foreign key into profiles is
-- `on delete cascade` — thirteen of them — so deleting the row would take
-- with it their hosted events, and with those events every other member's
-- RSVP; their event-chat messages, leaving holes in conversations; their
-- recap photographs, out of shared recaps. A host with twelve guests
-- deletes their account on Friday and Saturday quietly disappears for
-- twelve people who were counting on it.
--
-- So the row stays and the person leaves it. The profile becomes a
-- tombstone: "Former member", no name, no photograph, no bio, no gender,
-- no login. Everything that is somebody else's record of their own evening
-- stays exactly where it is, pointing at that tombstone.
--
-- Run ONCE in the Supabase SQL Editor, after migration 013.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Let a profile outlive its login
--
-- profiles.id references auth.users on delete cascade, which is the single
-- constraint that would destroy the record. Dropped: auth.users is the
-- login, profiles is the member, and a tombstone is a member with no login.
-- ----------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set when the member deleted their account. The row survives so other '
  'people''s events, guestlists and messages keep something to point at.';

-- ----------------------------------------------------------------------------
-- 2. The gender freeze needs to allow an erasure
--
-- Migration 013 refuses any change to a gender that is already set, unless
-- the caller is an admin or carries no identity. A member erasing their own
-- account is neither, so without this the erasure would be refused by our
-- own trigger. The freeze does not apply to a row being tombstoned.
-- ----------------------------------------------------------------------------
create or replace function public.freeze_gender()
returns trigger
language plpgsql
security definer
as $$
begin
  if old.gender is not null
     and new.gender is distinct from old.gender
     and new.deleted_at is null
  then
    if auth.uid() is not null and not exists (
      select 1 from public.profiles where id = auth.uid() and is_admin
    ) then
      raise exception
        'GENDER_LOCKED: gender is set once when you join and cannot be changed here';
    end if;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Leaving
--
-- Acts only on auth.uid(), so it cannot be pointed at anybody else however
-- it is called.
-- ----------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'NOT_SIGNED_IN: there is no account to delete';
  end if;

  if exists (select 1 from public.profiles where id = me and deleted_at is not null) then
    raise exception 'ALREADY_DELETED: this account has already been deleted';
  end if;

  -- Anything they are hosting that has not happened yet is CANCELLED, not
  -- deleted. Guests see a cancellation and the app tells them; an event
  -- that simply vanished would leave them turning up.
  update public.events
     set is_cancelled = true
   where host_id = me
     and starts_at + make_interval(mins => duration_minutes) > now()
     and not is_cancelled;

  -- They are not coming, so give the spot back. Past RSVPs stay — that is
  -- attendance history, and it is the host's record as much as theirs.
  delete from public.rsvps r
   using public.events e
   where r.event_id = e.id
     and r.user_id = me
     and e.starts_at + make_interval(mins => e.duration_minutes) > now();

  -- Private by nature. A one-sided log of a deleted account is worse for
  -- the other person than no log at all.
  delete from public.dm_threads where member_a = me or member_b = me;
  delete from public.dm_blocks  where blocker_id = me or blocked_id = me;
  delete from public.follows    where follower_id = me or followee_id = me;

  -- Erase the person; the record keeps a tombstone to point at
  update public.profiles
     set full_name  = 'Former member',
         avatar_url = null,
         bio        = null,
         gender     = null,
         deleted_at = now()
   where id = me;

  -- Last, because after this they cannot sign in to undo any of it
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. A tombstone is readable but never editable
--
-- No new policy is needed: "members update own profile" is
-- `using (id = auth.uid())`, and auth.uid() can never again equal a deleted
-- account's id because the login is gone. Stated here because it is the
-- kind of thing that should be asserted rather than assumed — see
-- docs/sql-tests/leaving.sql.
-- ----------------------------------------------------------------------------
