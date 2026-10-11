import { asMember } from '../lib/app.js'
import { suite } from '../lib/suite.js'

export const title = 'Settings and leaving — support, preferences, and the way out'

/**
 * Settings exists because the app told members to "contact support" with no
 * support to contact. Leaving exists because there was no way out at all —
 * and the interesting half of leaving is what SURVIVES it, since a delete
 * that cascaded would take other people's evenings with it.
 *
 * The scroll check is a real regression: the document is locked
 * (html, body and #app are height:100% overflow:hidden) so every full page
 * has to be its own scroller. Settings used min-height instead and grew
 * past the viewport, putting a third of the page out of reach on a phone.
 */
export default async function ({ browser, demo }) {
  const s = suite(title)

  const page = await asMember(browser, demo, {
    name: 'Settings Sami',
    email: 'settings@example.com',
    gender: 'male'
  })

  /* --------------------------------------------------------- support -- */
  s.section('Somewhere real to ask for help')

  await page.goto(`${demo}/#/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.settings', { timeout: 10000 })
  await page.waitForTimeout(400)

  const href = await page.locator('.settings__row--link').first().getAttribute('href')
  s.check(
    'the support link is a real WhatsApp address',
    /^https:\/\/wa\.me\/\d{8,}\?text=/.test(href || ''),
    `the link reads "${href}"`
  )
  s.check(
    'and carries who is writing, so support is not starting from nothing',
    decodeURIComponent(href || '').includes('Settings Sami'),
    `prefilled message: "${decodeURIComponent((href || '').split('text=')[1] || '')}"`
  )
  s.check(
    'the number itself is not printed on the page',
    !(await page.textContent('.settings')).replace(/\s/g, '').includes('97455'),
    'the raw phone number is showing again'
  )

  const about = await page
    .locator('.settings__group', { hasText: 'About' })
    .locator('.settings__row-desc')
    .first()
    .textContent()
  s.check(
    'the version is a real number, not an empty space',
    /Version \d+\.\d+\.\d+/.test((about || '').trim()),
    `About says "${(about || '').trim()}" — a bare token in a template renders as nothing`
  )

  /* -------------------------------------------------------- map style -- */
  s.section('Map style, now that it lives off the map')

  const swatches = await page.locator('.settings__swatch').count()
  s.check('every basemap is offered with a swatch', swatches === 4, `${swatches} swatches`)

  const before = await page.evaluate(
    () => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('prefs').mapStyle
  )
  await page.locator('.settings__row--tap').nth(before === 'streets' ? 1 : 0).click()
  await page.waitForTimeout(350)
  const after = await page.evaluate(
    () => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('prefs').mapStyle
  )
  s.check('choosing one changes the stored style', after !== before, `it stayed on ${before}`)
  s.check(
    'and is written down, so it survives a reload',
    (await page.evaluate(() => localStorage.getItem('wyn:map-style'))) === after,
    'the choice was not persisted'
  )

  /* ------------------------------------------- every page is a scroller */
  s.section('Every full page can reach its own bottom')

  await page.setViewportSize({ width: 390, height: 640 })
  for (const [name, hash, sel] of [
    ['profile', '#/profile', '.profile'],
    ['inbox', '#/inbox', '.inbox'],
    ['settings', '#/settings', '.settings']
  ]) {
    await page.goto(demo + '/' + hash, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(sel, { timeout: 10000 })
    await page.waitForTimeout(400)
    const m = await page.evaluate((q) => {
      const el = document.querySelector(q)
      el.scrollTop = 99999
      return {
        clientH: el.clientHeight,
        scrollH: el.scrollHeight,
        reached: el.scrollTop,
        viewport: window.innerHeight
      }
    }, sel)

    s.check(
      `${name} is its own scroller, not taller than the screen`,
      m.clientH <= m.viewport,
      `${m.clientH}px tall in a ${m.viewport}px viewport — ${m.clientH - m.viewport}px of it is unreachable`
    )
    if (m.scrollH > m.clientH) {
      s.check(
        `${name} scrolls to its bottom`,
        m.reached > 0,
        `${m.scrollH - m.clientH}px below the fold and scrollTop stayed at 0`
      )
    }
  }
  await page.setViewportSize({ width: 390, height: 780 })

  /* --------------------------------------------------------- leaving -- */
  s.section('Leaving, and what survives it')

  const fixture = await page.evaluate(async () => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const events = pinia._s.get('events')
    const auth = pinia._s.get('auth')
    const me = auth.currentUser

    const made = await events.create(
      {
        title: 'Next week padel',
        description: 'Has not happened yet.',
        category: 'sports',
        locationName: 'Doha',
        lat: 25.28,
        lng: 51.52,
        startsAt: new Date(Date.now() + 7 * 864e5).toISOString(),
        durationMinutes: 90,
        maxCapacity: 5
      },
      me
    )
    const id = made?.id || made
    // Somebody else is counting on this evening
    events.events.find((e) => e.id === id)?.attendeeIds.push('u-hassan')
    return { id, meId: me.id, meName: me.name }
  })

  await page.goto(`${demo}/#/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.settings', { timeout: 10000 })
  await page.click('.settings__row--danger')
  await page.waitForSelector('.del', { timeout: 8000 })

  s.check(
    'deleting is blocked until you type your own name',
    (await page.getAttribute('.del__go', 'disabled')) !== null,
    'the button was live the moment the sheet opened'
  )
  await page.fill('#del-name', 'not my name')
  await page.waitForTimeout(200)
  s.check(
    'and stays blocked for the wrong one',
    (await page.getAttribute('.del__go', 'disabled')) !== null,
    'a wrong name unlocked it'
  )
  await page.fill('#del-name', fixture.meName)
  await page.waitForTimeout(200)
  s.check(
    'the right name unlocks it',
    (await page.getAttribute('.del__go', 'disabled')) === null,
    'still disabled with the correct name typed'
  )

  await page.click('.del__go')
  await page.waitForSelector('.map-view__fab', { timeout: 10000 })
  await page.waitForTimeout(700)

  const after2 = await page.evaluate((f) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const events = pinia._s.get('events')
    return {
      signedOut: !pinia._s.get('auth').currentUser,
      stillListed: !!events.events.find((e) => e.id === f.id),
      tombstone: events.memberById(f.meId)?.name ?? null
    }
  }, fixture)

  s.check('you are signed out', after2.signedOut, 'still signed in after deleting the account')
  s.check(
    'their upcoming event leaves the map, so nobody turns up to nothing',
    !after2.stillListed,
    'a hostless event is still being advertised'
  )
  s.check(
    'and their name becomes a tombstone rather than an empty hole',
    after2.tombstone === 'Former member',
    `the member row now reads ${JSON.stringify(after2.tombstone)} — old chat and recaps would show a blank author`
  )

  await page.context().close()
  return s.result()
}
