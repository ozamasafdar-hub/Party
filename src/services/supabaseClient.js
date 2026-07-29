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

export const supabase = url && anonKey ? createClient(url, anonKey) : null

export const isLive = !!supabase
