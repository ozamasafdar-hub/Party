-- Local harness: enough of Supabase for docs/database-schema.sql to load.
-- Not shipped, not a substitute for the real thing — it exists so seed files
-- and triggers can be *run* instead of read.

-- Roles are cluster-wide, so they survive a drop database
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'supabase_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I', r);
    end if;
  end loop;
end $$;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  raw_app_meta_data   jsonb default '{}'::jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  aud                 text,
  role                text,
  instance_id         uuid,
  confirmation_token     text default '',
  recovery_token         text default '',
  email_change_token_new text default '',
  email_change           text default ''
);

create extension if not exists pgcrypto with schema extensions;

create table storage.buckets (
  id       text primary key,
  name     text not null,
  public   boolean not null default false,
  owner    uuid,
  created_at timestamptz default now()
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  created_at timestamptz default now(),
  metadata   jsonb
);

-- storage.foldername('a/b/c.jpg') -> {a,b}
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- The signed-in member. Tests set it with: select set_config('test.uid', '<uuid>', false)
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated')
$$;

create publication supabase_realtime;

-- ---------------------------------------------------------------------------
-- PostGIS stub. The schema stores a generated `location` column and one
-- radius search uses st_dwithin. Neither is under test here, so `geography`
-- becomes a shell type and the two functions get honest spherical maths.
-- ---------------------------------------------------------------------------
create type public.geography;

create or replace function public.geography_in(cstring) returns public.geography
language internal immutable strict as 'textin';
create or replace function public.geography_out(public.geography) returns cstring
language internal immutable strict as 'textout';

create type public.geography (
  input = public.geography_in,
  output = public.geography_out,
  like = text
);

create or replace function public.st_makepoint(lng double precision, lat double precision)
returns text language sql immutable as $$ select lng || ',' || lat $$;

create or replace function public.st_setsrid(pt text, srid integer)
returns text language sql immutable as $$ select pt $$;

create cast (text as public.geography) without function as implicit;
create cast (public.geography as text) without function as implicit;

-- Haversine, in metres
create or replace function public.st_dwithin(a public.geography, b public.geography, m double precision)
returns boolean language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
      power(sin(radians(split_part(b::text, ',', 2)::float8 - split_part(a::text, ',', 2)::float8) / 2), 2)
    + cos(radians(split_part(a::text, ',', 2)::float8))
    * cos(radians(split_part(b::text, ',', 2)::float8))
    * power(sin(radians(split_part(b::text, ',', 1)::float8 - split_part(a::text, ',', 1)::float8) / 2), 2)
  )) <= m
$$;
