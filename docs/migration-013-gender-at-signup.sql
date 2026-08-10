-- ============================================================================
-- WYN — Migration 013: gender is asked once, at the door, and then frozen
--
-- Ladies-only events are already enforced properly: hidden from the map,
-- and refused by enforce_event_capacity() on the way into rsvps. What was
-- never protected is the value those checks read.
--
--   * gender was never asked for at sign-up — handle_new_user() inserted
--     (id, full_name) only, so every account was born with gender null
--   * gender was editable forever — "members update own profile" has no
--     with-check and no column restriction
--
-- So a man reached a ladies-only event in two taps: set female in Edit
-- Profile, join, set it back. No document check closes that, because the
-- value being checked is one he controls.
--
-- The rule here is "set once": null may be filled in, a filled-in value may
-- not change. That single rule covers three cases at the same time — new
-- sign-ups arrive with it already set and therefore frozen; the members who
-- signed up before this all hold null, so they set it the first time they
-- answer and it freezes then; and the switch-to-join attack simply fails on
-- the second write. Nothing has to guess anybody's gender.
--
-- Run ONCE in the Supabase SQL Editor, after migration 012.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The freeze
--
-- The exceptions are written into the trigger itself rather than fought
-- with session_replication_role, which needs privileges the postgres role
-- does not reliably hold on a hosted project.
--
--   * an admin may correct a mistake
--   * a request carrying no user identity — the SQL editor, a migration,
--     the service role — passes, because RLS is what stops an anonymous
--     client here: "members update own profile" is `using (id = auth.uid())`,
--     which no null uid can satisfy
--
-- security definer so the is_admin lookup is not itself subject to RLS.
-- ----------------------------------------------------------------------------
create or replace function public.freeze_gender()
returns trigger
language plpgsql
security definer
as $$
begin
  if old.gender is not null and new.gender is distinct from old.gender then
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

drop trigger if exists profiles_freeze_gender on public.profiles;
create trigger profiles_freeze_gender
  before update on public.profiles
  for each row execute function public.freeze_gender();

-- ----------------------------------------------------------------------------
-- 2. The way back
--
-- "Nobody can change it" needs exactly one exception, or a mistyped choice
-- at sign-up means an account that can never be right. Admins only, and it
-- sets the value directly rather than lifting the freeze.
-- ----------------------------------------------------------------------------
create or replace function public.set_member_gender(p_member uuid, p_gender text)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_admin
  ) then
    raise exception 'NOT_ADMIN: only an admin can change a member''s gender';
  end if;

  if p_gender is not null and p_gender not in ('female', 'male') then
    raise exception 'INVALID_GENDER: expected female or male';
  end if;

  -- freeze_gender() lets an admin through, so this is a plain update. The
  -- function earns its place by validating the value and checking the
  -- caller in one named place rather than leaving both to the client.
  update public.profiles set gender = p_gender where id = p_member;
end;
$$;

revoke all on function public.set_member_gender(uuid, text) from public;
grant execute on function public.set_member_gender(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Carry the answer in from sign-up
--
-- The client puts gender in the sign-up metadata; without this it would sit
-- in auth.users and never reach the profile the app actually reads.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name, gender)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
             split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data ->> 'gender', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
