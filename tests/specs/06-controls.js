import { phone } from '../lib/browser.js'
import { suite } from '../lib/suite.js'

export const title = 'Controls — what you tapped still looks tapped'

/**
 * A whole class of bug lived here, and it is invisible on a desktop.
 *
 * `.pill:hover` scores one class plus a pseudo-class; `.pill--active`
 * scores one class. Wherever both paint the same element, hover wins
 * whatever order they are written in — and on a touch screen the hover
 * sticks to whatever you just pressed. The selected control then wears the
 * hover wash instead of its own colour, which over a light basemap reads
 * as nothing at all. Four controls had it at once.
 *
 * `scripts/check-hover-active.js` catches the pattern statically from the
 * built CSS. This catches what it cannot: that the thing is actually
 * visible after a real tap from a real touch device.
 *
 * The second half is the time pills, which read as boxes despite having
 * been fully rounded all along — the square edge was the row clipping a
 * pill in half, not the corner radius.
 */
export default async function ({ browser, demo }) {
  const s = suite(title)

  // A real touch device: this is the only way the stuck-hover state happens
  const page = await phone(browser, { touch: true })
  await page.goto(demo, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.time-pills__pill', { timeout: 15000 })
  await page.waitForTimeout(900)

  /* ------------------------------------------- tapped stays visible --- */
  s.section('Tapping a filter leaves it looking chosen')

  await page.locator('.time-pills__pill', { hasText: 'Tonight' }).first().tap()
  await page.waitForTimeout(400)

  const chosen = await page.evaluate(() => {
    const el = document.querySelector('.time-pills__pill--active')
    if (!el) return null
    const cs = getComputedStyle(el)
    return { bg: cs.backgroundColor, image: cs.backgroundImage, text: el.textContent.trim() }
  })

  s.check('the tap registered', !!chosen, 'nothing ended up selected')
  if (chosen) {
    // A translucent white wash is the signature of the bug: it is what
    // :hover paints, and over a pale basemap it is indistinguishable from
    // an unselected pill
    const washed =
      /rgba\(255,\s*255,\s*255,\s*0\.\d+\)/.test(chosen.bg) && !/gradient/.test(chosen.image)
    s.check(
      'and it is wearing its own colour, not a hover wash',
      !washed,
      `the selected pill is painted ${chosen.bg} / ${chosen.image} — that is the hover state, invisible on a light map`
    )
  }

  /* ----------------------------------------------- the pills' shape --- */
  s.section('The filter row reads as curves, not boxes')

  const row = await page.evaluate(() => {
    const el = document.querySelector('.time-pills')
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      left: +r.left.toFixed(1),
      right: +r.right.toFixed(1),
      viewport: window.innerWidth,
      mask: cs.maskImage || cs.webkitMaskImage,
      snap: cs.scrollSnapType,
      ctrlLeft: Math.min(
        ...[...document.querySelectorAll('.map-view__ctrl')].map(
          (c) => c.getBoundingClientRect().left
        ),
        Infinity
      ),
      pills: [...el.querySelectorAll('.time-pills__pill')].map((p) => ({
        text: p.textContent.trim(),
        h: +p.getBoundingClientRect().height.toFixed(1),
        radius: getComputedStyle(p).borderTopLeftRadius
      }))
    }
  })

  s.check(
    'a pill leaving the row fades instead of being cut off square',
    /gradient/.test(row.mask || 'none'),
    `mask-image is "${row.mask}" — without it the row guillotines a rounded shape with a straight vertical line`
  )
  s.check(
    'a flick parks pills cleanly rather than half in',
    /x/.test(row.snap || ''),
    `scroll-snap-type is "${row.snap}"`
  )
  s.check(
    'the row uses the empty left side of the screen',
    row.left <= 16,
    `it starts ${row.left}px in, wasting room nothing else is using`
  )
  s.check(
    'and still clears the map controls on the right',
    row.right <= row.ctrlLeft,
    `the row ends at ${row.right}, the controls start at ${row.ctrlLeft}`
  )

  const notRound = row.pills.filter((p) => parseFloat(p.radius) < p.h / 2)
  s.check(
    'every pill is rounded to a full half-height',
    notRound.length === 0,
    notRound.map((p) => `${p.text} r=${p.radius} h=${p.h}`).join(', ')
  )
  const short = row.pills.filter((p) => p.h < 40)
  s.check(
    'and tall enough to be a comfortable target',
    short.length === 0,
    short.map((p) => `${p.text} is only ${p.h}px tall`).join(', ')
  )

  /* -------------------------------------------- the map's own buttons - */
  s.section('The map controls behave the same way')

  const ctrl = page.locator('.map-view__ctrl').last()
  await ctrl.tap()
  await page.waitForTimeout(400)
  const active = await page.evaluate(() => {
    const el = document.querySelector('.map-view__ctrl--active')
    if (!el) return null
    const cs = getComputedStyle(el)
    return { bg: cs.backgroundColor, border: cs.borderColor }
  })

  if (!active) s.skip('a toggled control stays lit', 'that control has no selected state')
  else {
    s.check(
      'a toggled control stays lit after the finger leaves',
      !/rgba\(255,\s*255,\s*255,\s*0\.0?[0-9]\)/.test(active.bg),
      `it is painted ${active.bg}, which is the hover wash rather than its own colour`
    )
  }

  const errs = page.errors()
  s.check('and nothing threw while tapping around', errs.length === 0, errs.slice(0, 2).join(' | '))

  await page.context().close()
  return s.result()
}
