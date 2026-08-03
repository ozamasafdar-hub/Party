-- ============================================================================
-- WYN — Migration 008: host-chosen pin colours
--
-- Hosts may give their event a custom pin colour. NULL means "match the
-- category", which is the behaviour every existing event keeps.
--
-- The value ends up inside the pin's SVG markup in every visitor's
-- browser, so it is constrained to a fixed allowlist here as well as in
-- the client — a modified client cannot store arbitrary text.
--
-- Run ONCE in the Supabase SQL Editor, after migration 007.
-- ============================================================================

alter table public.events
  add column if not exists pin_color text
    check (pin_color is null or pin_color in (
      '#F4587A', -- coral
      '#FBBF6E', -- amber
      '#2DD4A0', -- emerald
      '#14B8A6', -- teal
      '#38BDF8', -- sky
      '#6366F1', -- indigo
      '#A78BFA', -- violet
      '#D946A6', -- magenta
      '#C62D55', -- maroon
      '#64748B'  -- slate
    ));
