import { asMember, tryJoin } from '../lib/app.js'
import { suite } from '../lib/suite.js'

export const title = 'Seats — one RSVP, several people'

/**
 * A father brings his family; a friend brings a friend.
 *
 * The whole feature is arithmetic, and the arithmetic is what oversells an
 * event. `attendeeIds.length` counts members and used to be the same number
 * as the people in the room — it isn't any more, and every capacity bar,
 * progress ring, map pin and "4/12 going" that still counts members is
 * quietly lying about how full the night is.
 *
 * The database enforces the same rules and is tested where it can actually
 * run, in docs/sql-tests/seats.sql. This covers what a member can see and
 * do, against the demo backend.
 */

const open = (page, id) =>
  page.evaluate((eventId) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    pinia._s.get('events').clearSelection()
    pinia._s.get('events').select(eventId)
  }, id)

const readEvent = (page, id) =>
  page.evaluate((eventId) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const es = pinia._s.get('events')
    const ev = es.events.find((e) => e.id === eventId)
    return ev && {
      members: ev.attendeeIds.length,
      capacity: ev.maxCapacity,
      spotsLeft: es.spotsLeft(ev),
      full: es.isFull(ev),
      mySeats: ev.seats?.[pinia._s.get('auth').currentUser?.id] ?? null,
      waitlisted: ev.waitlistIds.includes(pinia._s.get('auth').currentUser?.id)
    }
  }, id)

export default async function ({ browser, demo }) {
  const s = suite(title)

  const page = await asMember(browser, demo, {
    name: 'Family Man',
    email: 'seats-spec@example.com',
    gender: 'male'
  })

  /* ------------------------------------------------------ the control -- */
  s.section('Choosing how many of you are coming')

  await open(page, 'e-katara')
  await page.waitForSelector('.event-card', { timeout: 8000 })
  await page.waitForTimeout(400)

  s.check(
    'a roomy event offers a way to say "four of us"',
    (await page.locator('.event-card__stepper').count()) === 1,
    'no seat picker on an event with places to spare'
  )
  s.check(
    'and starts at one, not at some number nobody chose',
    (await page.textContent('.event-card__seats-count')) === '1',
    `it opened showing ${await page.textContent('.event-card__seats-count')}`
  )
  s.check(
    'you cannot go below one person',
    (await page.getAttribute('.event-card__step', 'disabled')) !== null,
    'the minus button is live at a party of one'
  )

  const plus = page.locator('.event-card__step').last()
  await plus.click()
  await plus.click()
  await plus.click()
  await page.waitForTimeout(250)

  s.check(
    'tapping up counts up',
    (await page.textContent('.event-card__seats-count')) === '4',
    `after three taps it shows ${await page.textContent('.event-card__seats-count')}`
  )
  s.check(
    'and the join button says what you are about to do',
    /4 places/.test(await page.textContent('.event-card__join')),
    `the button reads "${(await page.textContent('.event-card__join')).trim()}"`
  )

  /* ------------------------------------------------- booking a party --- */
  s.section('Booking four places')

  const before = await readEvent(page, 'e-katara')
  await page.click('.event-card__join')
  await page.waitForTimeout(700)
  const after = await readEvent(page, 'e-katara')

  s.check(
    'four places are taken, not one',
    before.spotsLeft - after.spotsLeft === 4,
    `${before.spotsLeft} places free before, ${after.spotsLeft} after — it only counted ${before.spotsLeft - after.spotsLeft}`
  )
  s.check(
    'but only one person joins the guestlist',
    after.members === before.members + 1,
    `the guestlist grew by ${after.members - before.members} members — a family should be one row, not four`
  )
  s.check(
    'and the party size is remembered',
    after.mySeats === 4,
    `the booking says ${JSON.stringify(after.mySeats)} places`
  )

  const bar = await page.textContent('.event-card__guestlist-head')
  s.check(
    'the guestlist count shows people, not members',
    bar?.includes(`${before.capacity - after.spotsLeft}/${before.capacity}`),
    `it reads "${(bar || '').trim()}" — members and people are different numbers now`
  )

  /* ---------------------------------------------- a party that cannot -- */
  s.section('A party that does not fit')

  /**
   * A SEEDED event, not one we create.
   *
   * Each signed-in member gets their own browser context, and the demo
   * backend's database lives in the page — so an event created in one
   * browser simply does not exist in another. The first version of this
   * section created one here and then tried to join it from the guest's
   * browser, where every call failed with "Event not found" and every
   * assertion passed on an event that was not there. The negative control
   * is the only reason that surfaced.
   *
   * e-golf is in the seed, so every page has it: four places, with the
   * host already holding one.
   */
  const tight = 'e-golf'

  const asGuest = await asMember(browser, demo, {
    name: 'Big Party',
    email: 'bigparty@example.com',
    gender: 'male'
  })

  const room = await readEvent(asGuest, tight)
  s.check(
    'the fixture really is a small event with places free',
    room && room.capacity === 4 && room.spotsLeft > 0 && room.spotsLeft < 4,
    `e-golf reads ${JSON.stringify(room)} — this section proves nothing unless it is genuinely tight`
  )

  const refused = await asGuest.evaluate(async (id) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const es = pinia._s.get('events')
    const auth = pinia._s.get('auth')
    try {
      await es.smartJoin(id, auth.currentUser.id, 5)
      const ev = es.events.find((e) => e.id === id)
      return {
        joined: ev?.attendeeIds.includes(auth.currentUser.id),
        waitlisted: ev?.waitlistIds.includes(auth.currentUser.id),
        people: (ev?.attendeeIds || []).reduce((n, m) => n + (ev.seats?.[m] ?? 1), 0),
        capacity: ev?.maxCapacity
      }
    } catch (e) {
      return { error: e.message }
    }
  }, tight)

  s.check(
    'five people cannot squeeze into four places',
    refused.joined === false,
    `they got on the guestlist and the event now holds ${refused.people} of ${refused.capacity}`
  )
  s.check(
    'the whole party waits together rather than being split up',
    refused.waitlisted === true,
    'half the family got in and half did not, which is worse than telling them all to wait'
  )
  s.check(
    'and the event was never oversold',
    refused.people <= refused.capacity,
    `${refused.people} people booked into ${refused.capacity} places`
  )

  /**
   * smartJoin() routes an oversized party to the waitlist before the
   * backend is ever asked, which is the right thing for a button to do and
   * useless as a guarantee. A stale tab, a forwarded link or a poked
   * console all arrive at rsvp() directly — so the refusal has to live
   * there too, and that is what this checks. Without it the whole section
   * above passes with the backend's capacity rule deleted.
   */
  const direct = await asGuest.evaluate(async (id) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const es = pinia._s.get('events')
    const auth = pinia._s.get('auth')
    try {
      await es.rsvp(id, auth.currentUser.id, 5)
      const ev = es.events.find((e) => e.id === id)
      return {
        joined: !!ev?.attendeeIds.includes(auth.currentUser.id),
        people: (ev?.attendeeIds || []).reduce((n, m) => n + (ev.seats?.[m] ?? 1), 0),
        capacity: ev?.maxCapacity
      }
    } catch (e) {
      return { joined: false, message: e.message }
    }
  }, tight)

  s.check(
    'and the refusal holds when the button is bypassed entirely',
    !direct.joined,
    `going straight to rsvp() put ${direct.people} people into ${direct.capacity} places`
  )
  s.check(
    'saying how many places are actually left',
    /place|full/i.test(direct.message || ''),
    `the refusal said ${JSON.stringify(direct.message)}`
  )

  /* ------------------------------------------------------ women-only --- */
  s.section('Women-only events take one place per member')

  await open(page, 'e-brunch')
  await page.waitForTimeout(500)
  s.check(
    'no seat picker is offered',
    (await page.locator('.event-card__stepper').count()) === 0,
    'a women-only event is offering extra places'
  )
  s.check(
    'and the reason is given rather than the control just being missing',
    /own names/i.test((await page.textContent('.event-card__seats-note')) || ''),
    'nothing explains why you cannot bring anyone'
  )

  const women = await asMember(browser, demo, {
    name: 'Ladies Guest',
    email: 'ladies-seats@example.com',
    gender: 'female'
  })
  const guests = await women.evaluate(async () => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const es = pinia._s.get('events')
    const auth = pinia._s.get('auth')
    try {
      await es.smartJoin('e-brunch', auth.currentUser.id, 4)
      const ev = es.events.find((e) => e.id === 'e-brunch')
      return { allowed: ev?.attendeeIds.includes(auth.currentUser.id), seats: ev?.seats?.[auth.currentUser.id] }
    } catch (e) {
      return { allowed: false, message: e.message }
    }
  })
  s.check(
    'and the rule holds even when the control is bypassed',
    !guests.allowed || guests.seats === 1,
    `she brought ${guests.seats} people nobody has checked into a women-only event`
  )
  s.check(
    'with a reason a member would understand',
    !guests.allowed && /own names|one place/i.test(guests.message || ''),
    `the refusal said "${guests.message}"`
  )
  s.check(
    'while she can still take her own place',
    (await tryJoin(women, 'e-brunch')).joined,
    'a woman can no longer join a women-only event at all'
  )

  const errs = page.errors()
  s.check('nothing threw along the way', errs.length === 0, errs.slice(0, 2).join(' | '))

  await page.context().close()
  await asGuest.context().close()
  await women.context().close()
  return s.result()
}
