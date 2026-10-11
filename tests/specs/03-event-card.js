import { phone } from '../lib/browser.js'
import { asMember } from '../lib/app.js'
import { suite } from '../lib/suite.js'

export const title = 'Event card — opening one, reading it, and getting back out'

/**
 * The card is where almost everything happens, and three separate bugs have
 * landed in it:
 *
 *  - Opened from a profile, the ✕ dropped you on a map you had never
 *    chosen. It has to read as ← and return you where you came from.
 *  - The card grew past the screen and the bottom was unreachable on a
 *    phone, because the document itself is locked and every sheet has to be
 *    its own scroller.
 *  - A scrollbar gutter on the right edge left a dead strip down the card.
 */
export default async function ({ browser, demo }) {
  const s = suite(title)

  /* --------------------------------------------------- a shared link --- */
  s.section('A link somebody sent you')

  const page = await phone(browser)
  await page.goto(`${demo}/#/e/e-karak`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.event-card', { timeout: 15000 })
  await page.waitForTimeout(700)

  s.check(
    'opens straight onto that event',
    (await page.textContent('.event-card__title'))?.includes('Karak'),
    `the card says "${await page.textContent('.event-card__title')}"`
  )
  s.check(
    'with a close control, because the map is genuinely behind it',
    (await page.locator('.event-card__close--back').count()) === 0,
    'it offers Back, but there is nowhere behind this card to go'
  )

  /* ------------------------------------------------------- scrolling -- */
  s.section('Reading all of it on a phone')

  const scroll = await page.evaluate(() => {
    const el = document.querySelector('.event-card__scroll')
    if (!el) return null
    el.scrollTop = 99999
    const card = document.querySelector('.event-card')
    return {
      clientH: el.clientHeight,
      scrollH: el.scrollHeight,
      reached: el.scrollTop,
      cardH: card.getBoundingClientRect().height,
      viewport: window.innerHeight,
      // The dead strip: a gutter reserved for a scrollbar nobody wants
      gutter: getComputedStyle(el).scrollbarWidth
    }
  })

  if (!scroll) s.skip('the card scrolls to its own bottom', 'no scroller found')
  else {
    s.check(
      'the card fits the screen rather than growing past it',
      scroll.cardH <= scroll.viewport + 1,
      `${scroll.cardH}px tall in a ${scroll.viewport}px viewport — its overflow is hidden by the locked document`
    )
    if (scroll.scrollH > scroll.clientH) {
      s.check(
        'and scrolls to its bottom',
        scroll.reached > 0,
        `${scroll.scrollH - scroll.clientH}px below the fold and scrollTop stayed at 0`
      )
    }
    s.check(
      'with no reserved scrollbar strip down the edge',
      scroll.gutter === 'none',
      `scrollbar-width is "${scroll.gutter}" — that gutter reads as a dead column`
    )
  }

  /* ------------------------------------------------------------ chat --- */
  s.section('The event chat')

  const toggle = page.locator('.event-card__chat-toggle')
  if (await toggle.count()) {
    await toggle.click()
    await page.waitForTimeout(400)
    s.check(
      'opens when you tap it',
      await page.isVisible('.event-card__chat-body'),
      'the chat stayed shut'
    )
  } else {
    s.skip('the chat opens', 'no chat on this event')
  }
  await page.context().close()

  /* ------------------------------------------- arriving from a profile */
  s.section('A card opened from somewhere else')

  const member = await asMember(browser, demo, {
    name: 'Card Reader',
    email: 'card@example.com',
    gender: 'female'
  })

  await member.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    // Exactly what a profile row does on the way to the map
    pinia._s.get('events').selectFrom('e-karak', { name: 'profile' })
  })
  await member.waitForSelector('.event-card', { timeout: 8000 })
  await member.waitForTimeout(400)

  s.check(
    'offers Back, not Close',
    (await member.locator('.event-card__close--back').count()) === 1,
    'the control is still a ✕, which would strand you on a map you never opened'
  )
  s.check(
    'and says so to a screen reader too',
    (await member.getAttribute('.event-card__close', 'aria-label')) === 'Back',
    `the label reads "${await member.getAttribute('.event-card__close', 'aria-label')}"`
  )

  const errs = member.errors()
  s.check('nothing threw while all that happened', errs.length === 0, errs.slice(0, 2).join(' | '))

  await member.context().close()
  return s.result()
}
