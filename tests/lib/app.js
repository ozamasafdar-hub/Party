import { phone } from './browser.js'

/**
 * The flows every spec needs, written once.
 *
 * Driving these through the real controls rather than poking stores is the
 * point: a store call that works while the button next to it is broken is
 * exactly the kind of pass that teaches you nothing.
 */

/** Woman is first in the radiogroup, Man second — see LoginPanel GENDERS. */
const genderButton = (gender) =>
  `.map-view__login .login-panel__gender-btn:nth-child(${gender === 'female' ? 1 : 2})`

/**
 * Create an account and land back on the map.
 *
 * Tapping Create is the entry point a visitor actually uses: it is the
 * first members-only action most people reach for, so it opens sign-in and
 * then resumes what you were doing — which is why the create sheet is open
 * afterwards and has to be dismissed.
 */
export async function signUp(page, { name, email, gender = 'male', password = 'secret123' }) {
  await page.click('.map-view__fab')
  await page.waitForSelector('.map-view__login', { timeout: 8000 })
  await page.click('.map-view__login .login-panel__switch')
  await page.fill('.map-view__login #auth-name', name)
  await page.fill('.map-view__login #auth-email', email)
  await page.fill('.map-view__login #auth-password', password)
  await page.click(genderButton(gender))
  await page.click('.map-view__login .login-panel__submit')
  await page.waitForSelector('.map-view__login', { state: 'detached', timeout: 8000 })

  // The pending action resumes, so the create sheet is now open
  const close = page.locator('.create-modal__close')
  if (await close.count()) await close.click()
  await page.waitForTimeout(250)
}

/** A page with a member already signed in, ready on the map. */
export async function asMember(browser, base, member) {
  const page = await phone(browser)
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.map-view__fab', { timeout: 15000 })
  await page.waitForTimeout(600)
  await signUp(page, member)
  return page
}

/**
 * Try to join an event, and report what the app said.
 *
 * `smartJoin` is what the card's button calls — it picks between joining,
 * waitlisting and requesting — so testing it tests the real path. It runs
 * through the store rather than the button because the gates have to hold
 * for a shared link and a poked console too: hiding the event is not the
 * same as refusing the join, and it was the refusal that regressed.
 */
export async function tryJoin(page, eventId) {
  return page.evaluate(async (id) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const events = pinia._s.get('events')
    const auth = pinia._s.get('auth')
    try {
      await events.smartJoin(id, auth.currentUser.id)
      const event = events.events.find((e) => e.id === id)
      return {
        joined: !!event?.attendeeIds.includes(auth.currentUser.id),
        message: null
      }
    } catch (e) {
      return { joined: false, message: e.message }
    }
  }, eventId)
}

/** Whoever is signed in right now, as the app sees them. */
export const currentUser = (page) =>
  page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    return pinia._s.get('auth').currentUser
  })
