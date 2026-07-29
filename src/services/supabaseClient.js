import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client — created only when the project is configured via env:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 * (locally in .env, in CI as GitHub Actions secrets).
 *
 * When absent, `supabase` is null and the whole app runs in demo mode
 * against local seeded data — see eventService.js / authStore.js.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Runtime override for testing: visiting ...?demo switches THIS browser
 * to full offline demo mode (seeded events, local accounts) even when
 * the site is built with a live backend; ...?live switches back. The
 * choice sticks per-browser via localStorage. Other visitors are never
 * affected.
 */
const FORCE_DEMO_KEY = 'wyn:force-demo'

function readForcedDemo() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('demo')) localStorage.setItem(FORCE_DEMO_KEY, '1')
    if (params.has('live')) localStorage.removeItem(FORCE_DEMO_KEY)
    return localStorage.getItem(FORCE_DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export const isDemoForced = readForcedDemo()

export const supabase =
  !isDemoForced && url && anonKey ? createClient(url, anonKey) : null

export const isLive = !!supabase
