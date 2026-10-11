import { phone } from '../lib/browser.js'
import { suite } from '../lib/suite.js'

export const title = 'Boot — the map comes up, for a stranger and for a member'

/**
 * The cheapest spec, and the one most likely to catch a catastrophe. If the
 * map does not paint, nothing else in this suite means anything.
 *
 * The second half is a real regression: with a session in hand and the
 * backend unreachable, the profile query never settles — it does not fail,
 * it hangs — and the router used to await it before the first render. The
 * result was a white screen with no map and no error, indefinitely. A
 * paused free-tier Supabase project looks exactly like that from outside.
 */
export default async function ({ browser, demo, live }) {
  const s = suite(title)

  s.section('A visitor who has never signed in')
  const page = await phone(browser)
  await page.goto(demo, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.map-view', { timeout: 15000 })
  await page.waitForTimeout(900)

  s.check(
    'the map is on screen',
    await page.isVisible('.map-view__fab'),
    'no create button, so the map never finished rendering'
  )
  s.check(
    'events were loaded and pinned',
    (await page.locator('.leaflet-marker-icon').count()) > 0,
    'zero markers on the map'
  )
  s.check(
    'the time filters are there',
    (await page.locator('.time-pills__pill').count()) >= 5,
    `${await page.locator('.time-pills__pill').count()} pills`
  )
  s.check(
    'browsing is public — no sign-in wall',
    await page.isVisible('.map-view__fab'),
    'a visitor is blocked from the map'
  )

  const errs = page.errors()
  s.check('nothing threw on the way up', errs.length === 0, errs.slice(0, 3).join(' | '))
  await page.context().close()

  /* ------------------------------------------------------------------ */
  s.section('A member whose backend is not answering')

  const dead = await phone(browser)

  // Give the app a session to restore, so it tries to load a profile from
  // a backend that is not there. Without this the query never runs and the
  // hang that caused the white screen is never reached.
  await dead.route('**/auth/v1/user*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '00000000-0000-4000-8000-000000000001',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'member@example.com',
        app_metadata: {},
        user_metadata: { full_name: 'Stranded Member' },
        created_at: '2026-01-01T00:00:00Z'
      })
    })
  )

  const TOKENS =
    '#access_token=FAKE&refresh_token=R&expires_in=3600&token_type=bearer&type=signup'
  await dead.goto(live + '/' + TOKENS, { waitUntil: 'domcontentloaded' })
  await dead.waitForTimeout(2500)

  const state = await dead.evaluate(() => ({
    mapUp: !!document.querySelector('.map-view__fab'),
    blank: document.querySelector('#app').innerHTML.length < 50,
    href: location.href
  }))

  s.check(
    'the map paints anyway, rather than a white screen',
    state.mapUp && !state.blank,
    'nothing rendered — the first paint is blocked on the backend again'
  )
  s.check(
    'and the public route did not wait for a login it does not need',
    state.mapUp,
    'the map is still gated behind the session restore'
  )
  await dead.context().close()

  return s.result()
}
