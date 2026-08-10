-- ============================================================================
-- Local test harness — run by docs/sql-tests/run.sh, NOT in the Supabase SQL
-- editor. It writes to and reads from a throwaway database.
-- ============================================================================

-- ============================================================================
-- The gender freeze, exercised against the real trigger.
--
-- The rule is "set once": a null may be filled in, a filled-in value may
-- not change. Every case below states what should happen; the run prints
-- PASS/FAIL rather than just failing to error.
-- ============================================================================

-- Attempts a write and reports the refusal, rolling back either way so the
-- question never changes the answer for the next case.
--
-- `acting` is who the request comes from — it defaults to the member
-- editing their own profile, which is the real scenario. It matters:
-- freeze_gender() deliberately waves through anything with no user
-- identity, so a probe that forgot to set one would pass every case while
-- proving nothing.
create or replace function public.try_gender(member uuid, want text, acting uuid default null)
returns text language plpgsql as $$
begin
  begin
    perform set_config('test.uid', coalesce(acting, member)::text, true);
    update public.profiles set gender = want where id = member;
    raise exception 'WYN_PROBE_ALLOWED';
  exception when others then
    perform set_config('test.uid', '', true);
    if sqlerrm like 'WYN_PROBE_ALLOWED%' then return 'ALLOWED'; end if;
    return split_part(sqlerrm, ':', 1);
  end;
end $$;

-- A member who has never answered, and one who has
insert into auth.users (id, email, raw_user_meta_data)
values ('c0000000-0000-4000-8000-000000000001', 'unset@wyn.test', '{"full_name":"Unset Member"}'::jsonb)
on conflict (id) do nothing;

update public.profiles set gender = null
 where id = 'c0000000-0000-4000-8000-000000000001';

\echo ''
\echo 'THE FREEZE'

with cases(sort, name, got, want) as (
  values
    (1, 'a member who never answered can set it',
        public.try_gender('c0000000-0000-4000-8000-000000000001', 'female'), 'ALLOWED'),

    (2, 'a woman cannot become a man',
        public.try_gender('b0000000-0000-4000-8000-000000000002', 'male'), 'GENDER_LOCKED'),

    (3, 'a man cannot become a woman',
        public.try_gender('b0000000-0000-4000-8000-000000000001', 'female'), 'GENDER_LOCKED'),

    (4, 'writing the same value again is not an error',
        public.try_gender('b0000000-0000-4000-8000-000000000001', 'male'), 'ALLOWED'),

    (5, 'it cannot be cleared back to null either',
        public.try_gender('b0000000-0000-4000-8000-000000000002', null), 'GENDER_LOCKED'),

    (6, 'another member cannot change mine',
        public.try_gender('b0000000-0000-4000-8000-000000000002', 'male',
                          'b0000000-0000-4000-8000-000000000005'), 'GENDER_LOCKED')
)
select case when got = want then '  PASS  ' else '  FAIL  ' end
       || rpad(name, 46) || '  got ' || coalesce(got, 'null') ||
       case when got = want then '' else '   want ' || want end as result
from cases order by sort;

\echo ''
\echo 'THE DELIBERATE EXCEPTION'

-- A request carrying no user identity — the SQL editor, a migration, the
-- service role. Not a hole: "members update own profile" is
-- `using (id = auth.uid())`, which no null uid can satisfy, so an
-- anonymous client never reaches this trigger at all.
do $$
declare before text; msg text;
begin
  perform set_config('test.uid', '', true);
  select gender into before from public.profiles
   where id = 'b0000000-0000-4000-8000-000000000004';
  begin
    update public.profiles set gender = 'male'
     where id = 'b0000000-0000-4000-8000-000000000004';
    msg := '  PASS  a request with no user identity is allowed through';
  exception when others then
    msg := '  FAIL  the SQL editor could not correct a profile: ' || sqlerrm;
  end;
  raise notice '%', msg;
  update public.profiles set gender = before
   where id = 'b0000000-0000-4000-8000-000000000004';
end $$;

\echo ''
\echo 'EVERYTHING ELSE ON A PROFILE STILL SAVES'

do $$
declare ok boolean;
begin
  update public.profiles set bio = 'still editable' where id = 'b0000000-0000-4000-8000-000000000001';
  select bio = 'still editable' into ok from public.profiles
   where id = 'b0000000-0000-4000-8000-000000000001';
  raise notice '%', case when ok then '  PASS  bio saves with gender untouched'
                         else '  FAIL  bio did not save' end;
end $$;

\echo ''
\echo 'THE ADMIN WAY BACK'

do $$
declare msg text;
begin
  -- A member who is not an admin
  perform set_config('test.uid', 'b0000000-0000-4000-8000-000000000003', true);
  begin
    perform public.set_member_gender('b0000000-0000-4000-8000-000000000002', 'male');
    msg := '  FAIL  a non-admin was allowed to change someone''s gender';
  exception when others then
    msg := case when sqlerrm like 'NOT_ADMIN%'
                then '  PASS  a non-admin is refused'
                else '  FAIL  wrong error: ' || sqlerrm end;
  end;
  raise notice '%', msg;

  -- Now as an admin
  update public.profiles set is_admin = true
   where id = 'b0000000-0000-4000-8000-000000000003';
  begin
    perform public.set_member_gender('b0000000-0000-4000-8000-000000000002', 'male');
    msg := case when (select gender from public.profiles
                       where id = 'b0000000-0000-4000-8000-000000000002') = 'male'
                then '  PASS  an admin can correct a mistake'
                else '  FAIL  the admin call did not take' end;
  exception when others then
    msg := '  FAIL  admin was refused: ' || sqlerrm;
  end;
  raise notice '%', msg;

  -- Put it back
  perform public.set_member_gender('b0000000-0000-4000-8000-000000000002', 'female');
  update public.profiles set is_admin = false
   where id = 'b0000000-0000-4000-8000-000000000003';
  perform set_config('test.uid', '', true);
end $$;

\echo ''
\echo 'A NEW SIGN-UP ARRIVES WITH IT ALREADY SET'

do $$
declare g text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('c0000000-0000-4000-8000-000000000002', 'newbie@wyn.test',
          '{"full_name":"New Member","gender":"female"}'::jsonb)
  on conflict (id) do nothing;

  select gender into g from public.profiles
   where id = 'c0000000-0000-4000-8000-000000000002';
  raise notice '%', case when g = 'female'
    then '  PASS  gender carried from sign-up into the profile'
    else '  FAIL  profile gender is ' || coalesce(g, 'null') end;

  raise notice '%', case
    when public.try_gender('c0000000-0000-4000-8000-000000000002', 'male') = 'GENDER_LOCKED'
    then '  PASS  and it is frozen from the moment the account exists'
    else '  FAIL  a brand new account could still change it' end;
end $$;

drop function public.try_gender(uuid, text, uuid);
