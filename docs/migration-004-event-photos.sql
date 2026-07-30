-- ============================================================================
-- WYN — Migration 004: multiple photos per event
--
-- Events gain a photo gallery. photo_urls holds every photo in display
-- order; cover_url stays in sync with the first one (map cards and older
-- rows keep working unchanged).
--
-- Run ONCE in the Supabase SQL Editor.
-- ============================================================================

alter table public.events
  add column if not exists photo_urls text[] not null default '{}';

-- Backfill: existing single covers become one-photo galleries
update public.events
   set photo_urls = array[cover_url]
 where cover_url is not null and photo_urls = '{}';
