import { phone } from '../lib/browser.js'
import { suite } from '../lib/suite.js'
import { SITE_URL } from '../../site.config.js'

export const title = 'Launch readiness — the confirmation link, previews, and installing'

/**
 * The three things that stood between the build and a stranger actually
 * using it, none of which are visible from inside the app.
 *
 * The first is the one that matters. Supabase returns the session in the
 * URL as `#access_token=…`, and the app routes on the hash — so the router
 * read that as a page name, matched nothing, and the catch-all rewrote the
 * hash to `#/`, destroying the session on the way past. The member clicked
 * the link in their inbox, landed on the map, and was still signed out with
 * nothing on screen explaining why.
 *
 * Runs against the LIVE build (Supabase configured, backend unreachable),
 * because none of the callback path exists without a backend to call.
 */

const TOKENS =
  '#access_token=FAKE_ACCESS&refresh_token=FAKE_REFRESH&expires_in=3600&token_type=bearer&type=signup'
const EXPIRED =
  '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'

/**
 * A fresh page per case, always.
 *
 * goto() to a URL that differs only in the hash does NOT reload, so the
 * module never re-runs and the store still holds the previous case's
 * answer. An earlier version of this file "proved" a bug that way which
 * did not exist.
 */
async function land(browser, live, path, { mockUser = false } = {}) {
  const page = await phone(browser)
  if (mockUser) {
    // The one call the implicit flow makes to turn a token into a session.
    // Mocking it is what lets the SUCCESS path be tested at all — a test
    // that can only ever observe failure proves nothing about the case
    // that actually matters.
    await page.route('**/auth/v1/user*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-4000-8000-000000000001',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'newmember@example.com',
          app_metadata: {},
          user_metadata: { full_name: 'New Member', gender: 'female' },
          created_at: '2026-01-01T00:00:00Z'
        })
      })
    )
  }
  await page.goto(live + path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2300)
  const state = await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    return {
      href: location.href,
      notice: pinia._s.get('auth').callbackNotice,
      onScreen: document.querySelector('.map-view__notice--auth')?.textContent?.trim() || null,
      mapUp: !!document.querySelector('.map-view__fab')
    }
  })
  await page.context().close()
  return state
}

export default async function ({ browser, demo, live }) {
  const s = suite(title)

  /* ------------------------------------- the link points somewhere real */
  s.section('The link the email carries')

  /**
   * Where a confirmation link comes back to must be decided by the app,
   * not by a field in a dashboard.
   *
   * It was left to Supabase's Site URL, which had lost its `/Party/` path,
   * so the first real member clicked their link and landed on GitHub's
   * "There isn't a GitHub Pages site here" page. The sign-up worked
   * perfectly; the destination was wrong, and nothing in the repo could
   * have told you.
   */
  const signup = await phone(browser)
  let asked = null
  await signup.route('**/auth/v1/signup*', (route) => {
    asked = route.request().url()
    // Answer as a project with confirmation switched on does: a user, no
    // session, so the app shows "check your email"
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '00000000-0000-4000-8000-000000000009',
        email: 'brand-new@example.com',
        role: 'authenticated',
        confirmation_sent_at: new Date().toISOString()
      })
    })
  })

  await signup.goto(live, { waitUntil: 'domcontentloaded' })
  await signup.waitForSelector('.map-view__fab', { timeout: 15000 })
  await signup.waitForTimeout(500)
  await signup.click('.map-view__fab')
  await signup.waitForSelector('.map-view__login', { timeout: 8000 })
  await signup.click('.map-view__login .login-panel__switch')
  await signup.fill('.map-view__login #auth-name', 'Brand New')
  await signup.fill('.map-view__login #auth-email', 'brand-new@example.com')
  await signup.fill('.map-view__login #auth-password', 'secret123')
  await signup.click('.map-view__login .login-panel__gender-btn:nth-child(1)')
  await signup.click('.map-view__login .login-panel__submit')
  await signup.waitForTimeout(900)

  s.check('signing up reaches the backend at all', !!asked, 'no sign-up request was made')

  const redirect = asked && new URL(asked).searchParams.get('redirect_to')
  s.check(
    'and tells it exactly where to send the member back',
    !!redirect,
    'no redirect_to on the sign-up — the destination falls back to a dashboard field nobody can see from here'
  )
  s.check(
    'with the full path, not just the domain',
    !!redirect && new URL(redirect).pathname.length > 1,
    `redirect_to is ${redirect} — a bare domain lands on GitHub's "no site here" page`
  )
  s.check(
    'matching the address the app is built with',
    redirect === SITE_URL,
    `the email would return to ${redirect}, but the app is served from ${SITE_URL}`
  )

  const told = await signup.textContent('.login-panel__notice').catch(() => null)
  s.check(
    'and the member is told to go and look in their inbox',
    /email|confirm/i.test(told || ''),
    `the screen said ${JSON.stringify(told)}`
  )
  await signup.context().close()

  /* -------------------------------------- the link in the email works -- */
  s.section('Clicking the link in the confirmation email')

  const good = await land(browser, live, '/' + TOKENS, { mockUser: true })
  s.check(
    'the session survives the router and gets claimed',
    good.notice?.ok === true,
    good.notice
      ? `the app reported ${JSON.stringify(good.notice)}`
      : 'no callback was seen at all — the router reached the URL first and wiped it'
  )
  s.check(
    'and the member is told it worked',
    /confirmed/i.test(good.onScreen || ''),
    `the screen says ${JSON.stringify(good.onScreen)}`
  )
  s.check(
    'the tokens do not linger in the address bar',
    !/access_token|refresh_token/.test(good.href),
    `the url still reads ${good.href} — that is a session anyone can copy out of a screenshot`
  )

  s.section('And when the link is dead')

  const stale = await land(browser, live, '/' + EXPIRED)
  s.check(
    'an expired link is explained rather than ignored',
    stale.notice?.ok === false && /expired/i.test(stale.notice.message),
    `the app reported ${JSON.stringify(stale.notice)}`
  )
  s.check(
    'in plain words, with no Supabase jargon',
    !/otp|access_denied|error_code/i.test(stale.notice?.message || ''),
    `the message reads "${stale.notice?.message}"`
  )

  const plain = await land(browser, live, '/')
  s.check(
    'and an ordinary visit says nothing at all',
    plain.notice === null && plain.onScreen === null,
    `an ordinary visit produced ${JSON.stringify(plain.notice)}`
  )

  /* ------------------------------------------------------- previews --- */
  s.section('Sharing the link shows a card, not a bare address')

  const page = await phone(browser)
  await page.goto(demo, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  const meta = await page.evaluate(() => {
    const get = (sel) => document.querySelector(sel)?.getAttribute('content') || null
    return {
      title: get('meta[property="og:title"]'),
      description: get('meta[property="og:description"]'),
      image: get('meta[property="og:image"]'),
      width: get('meta[property="og:image:width"]'),
      height: get('meta[property="og:image:height"]'),
      card: get('meta[name="twitter:card"]'),
      twitterImage: get('meta[name="twitter:image"]')
    }
  })

  s.check('it has a title', (meta.title || '').length > 5, `og:title is ${meta.title}`)
  s.check(
    'and a description short enough not to be cut off',
    !!meta.description && meta.description.length <= 200,
    `og:description is ${meta.description?.length} characters`
  )
  s.check(
    'the preview image is an absolute address',
    /^https?:\/\/[^/]+\/.+\.(jpg|png)$/.test(meta.image || ''),
    `og:image is ${meta.image} — an unfurler has no page to resolve a relative path against`
  )
  s.check(
    'declared at the size unfurlers expect',
    meta.width === '1200' && meta.height === '630',
    `declared ${meta.width}×${meta.height}`
  )
  s.check(
    'twitter gets the big card and the same image',
    meta.card === 'summary_large_image' && meta.twitterImage === meta.image,
    `card=${meta.card}, image=${meta.twitterImage}`
  )

  // The tag can be perfect and the file missing — that is the entire
  // failure mode of a link preview, and nobody sees it until they share one
  const imgName = (meta.image || '').split('/').pop()
  const img = await page.request.get(`${demo}/${imgName}`)
  const bytes = img.ok() ? (await img.body()).length : 0
  s.check(
    'and the image it points at is really served',
    img.ok() && (img.headers()['content-type'] || '').startsWith('image/'),
    `GET /${imgName} → ${img.status()} ${img.headers()['content-type']}`
  )
  s.check(
    'at a weight an unfurler will actually fetch',
    bytes > 5000 && bytes < 300000,
    `${Math.round(bytes / 1024)}KB`
  )

  /* --------------------------------------------- add to home screen --- */
  s.section('It installs as an app, not as a screenshot of a browser')

  const links = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') || null,
    apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') || null,
    appleCapable: document
      .querySelector('meta[name="apple-mobile-web-app-capable"]')
      ?.getAttribute('content'),
    appleTitle: document
      .querySelector('meta[name="apple-mobile-web-app-title"]')
      ?.getAttribute('content')
  }))

  s.check('there is a manifest', !!links.manifest, 'no <link rel="manifest">')
  s.check(
    'iOS gets its own icon, since it reads none of the manifest',
    !!links.apple && links.appleCapable === 'yes' && !!links.appleTitle,
    `apple-touch-icon=${links.apple}, capable=${links.appleCapable}, title=${links.appleTitle}`
  )

  const mf = await page.request.get(`${demo}/${(links.manifest || '').replace(/^\.\//, '')}`)
  s.check('the manifest is really served', mf.ok(), `→ ${mf.status()}`)

  if (mf.ok()) {
    const m = await mf.json()
    s.check('it opens without browser chrome', m.display === 'standalone', `display is ${m.display}`)
    s.check(
      'it starts relative, so one manifest serves every host',
      typeof m.start_url === 'string' && !/^https?:/.test(m.start_url),
      `start_url is ${m.start_url}`
    )
    s.check(
      'its name matches the page rather than drifting from it',
      m.name === meta.title,
      `manifest says "${m.name}", the page says "${meta.title}"`
    )
    s.check(
      'and the launcher gets a shape it can crop safely',
      (m.icons || []).some((i) => i.purpose === 'maskable'),
      'no maskable icon — Android will bite a corner off the pin'
    )

    const missing = []
    for (const src of [...(m.icons || []).map((i) => i.src), links.apple]) {
      const name = String(src).replace(/^\.\//, '')
      const res = await page.request.get(`${demo}/${name}`)
      if (!res.ok() || !(res.headers()['content-type'] || '').startsWith('image/')) {
        missing.push(`${name} → ${res.status()}`)
      }
    }
    s.check('every icon it promises is actually there', missing.length === 0, missing.join(', '))
  }

  await page.context().close()
  return s.result()
}
