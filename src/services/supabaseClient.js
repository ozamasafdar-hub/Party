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

/**
 * The URL exactly as the page opened, captured before the client exists.
 *
 * createClient() starts reading the fragment for a session as part of its
 * own initialisation, and strips it either way — success or failure. Read
 * `window.location` after that and the callback is simply not there any
 * more, which is precisely what happened the first time this was written
 * against the live URL: the `?code=` branch worked and both fragment
 * branches silently did nothing.
 */
const ENTRY_URL = typeof window === 'undefined' ? '' : window.location.href

export const supabase =
  !isDemoForced && url && anonKey ? createClient(url, anonKey) : null

export const isLive = !!supabase

/* --- coming back from a confirmation email -------------------------------- */

/**
 * Put the URL back to a plain map view, keeping nothing of the callback.
 *
 * The hash is set to '#/' rather than emptied because the app routes on the
 * hash: an empty one leaves the address bar showing a bare domain that the
 * router then rewrites anyway, and one visible rewrite is better than two.
 */
function scrubCallback() {
  const url = new URL(window.location.href)
  for (const key of ['code', 'error', 'error_code', 'error_description', 'type']) {
    url.searchParams.delete(key)
  }
  window.history.replaceState(null, '', `${url.pathname}${url.search}#/`)
}

/** Supabase's wording is for developers. Say it the way a member would. */
function readable(raw) {
  const text = String(raw || '')
  if (/expired|invalid|otp/i.test(text)) {
    return 'That confirmation link has expired. Sign in again and we’ll send a fresh one.'
  }
  if (/already/i.test(text)) return 'That link has already been used — try signing in.'
  if (/failed to fetch|network|load failed/i.test(text)) {
    return 'Couldn’t reach WYN just now. Check your connection and open the link again.'
  }
  return 'We couldn’t finish confirming your email. Try the link again.'
}

/**
 * Absorb a Supabase auth callback, before the router exists.
 *
 * A confirmation email links back to the site carrying the session in the
 * URL — `#access_token=…&type=signup` on the implicit flow this client uses
 * by default, or `?code=…` if it is ever switched to PKCE. But the app
 * routes on the hash, so the router reads `#access_token=…` as a page name,
 * matches nothing, and the catch-all rewrites the hash to `#/` — taking the
 * tokens with it. Whoever reads the URL first wins, and the router wins:
 * replaying a real confirmation URL against the build showed the tokens
 * gone before anything could use them, every time.
 *
 * So this runs on its own, first, and main.js waits for it before the app
 * is created. `getSession()` is the join point — it resolves only once the
 * client has finished reading the URL, which is the part that must happen
 * before the rewrite.
 *
 * Returns null on an ordinary visit, which is almost every visit, so the
 * app boots without waiting on anything.
 */
export async function consumeAuthCallback() {
  if (!supabase) return null

  const entry = new URL(ENTRY_URL)
  const query = entry.searchParams
  const fragment = new URLSearchParams(entry.hash.replace(/^#/, ''))

  const code = query.get('code')
  const hasTokens = !!fragment.get('access_token')
  const failed = fragment.get('error_description') || query.get('error_description')

  if (!code && !hasTokens && !failed) return null

  try {
    if (failed) return { ok: false, message: readable(failed) }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) return { ok: false, message: readable(error.message) }
    } else {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session) return { ok: false, message: readable(error?.message) }
    }

    const kind = fragment.get('type') || query.get('type')
    return {
      ok: true,
      message:
        kind === 'recovery'
          ? 'Email confirmed — you can set a new password now.'
          : 'Email confirmed. Welcome to WYN!'
    }
  } catch (e) {
    return { ok: false, message: readable(e.message) }
  } finally {
    // Whatever happened, the tokens must not survive in the address bar to
    // be copied, shared, or replayed out of somebody's history
    scrubCallback()
  }
}
