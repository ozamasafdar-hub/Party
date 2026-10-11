import { asMember, tryJoin, currentUser } from '../lib/app.js'
import { suite } from '../lib/suite.js'

export const title = 'Join gates — who is actually allowed on a guestlist'

/**
 * The rules that must not quietly stop working.
 *
 * Two of these have regressed before. Migration 011 silently dropped the
 * Host Pro-only check and nothing noticed until a database was stood up and
 * asked. And a reliability floor once locked hosts off their own guestlists,
 * because the app adds the host's RSVP the moment an event is created.
 *
 * Hiding an event is not the same as refusing the join. A shared link, a tab
 * left open from before the host flipped the toggle, or a poked console all
 * arrive at the join call with the interface bypassed — so these go through
 * the store, which is where the refusal has to live.
 *
 * Seeded fixtures: e-brunch is ladies-only (host u-noora), e-yacht is
 * Host Pro-only (host u-noora), e-golf has 4 places (host u-omar).
 */
export default async function ({ browser, demo }) {
  const s = suite(title)

  /* ------------------------------------------------------- ladies only -- */
  s.section('A women-only event')

  const man = await asMember(browser, demo, {
    name: 'Gate Tester',
    email: 'gates-man@example.com',
    gender: 'male'
  })
  const asMan = await tryJoin(man, 'e-brunch')
  s.check(
    'a man cannot join it',
    !asMan.joined,
    `he got on the guestlist — message was ${JSON.stringify(asMan.message)}`
  )
  s.check(
    'and is told why, in words a member would use',
    !asMan.joined && /ladies|women/i.test(asMan.message || ''),
    `the refusal said "${asMan.message}"`
  )

  const woman = await asMember(browser, demo, {
    name: 'Gate Tester Two',
    email: 'gates-woman@example.com',
    gender: 'female'
  })
  const asWoman = await tryJoin(woman, 'e-brunch')
  s.check(
    'a woman can',
    asWoman.joined,
    `she was refused with "${asWoman.message}"`
  )

  /* ---------------------------------------------------------- pro only -- */
  s.section('A Host Pro-only event')

  const free = await tryJoin(woman, 'e-yacht')
  s.check(
    'a free member cannot join it',
    !free.joined,
    `a free account got on — message was ${JSON.stringify(free.message)}`
  )
  s.check(
    'and the reason mentions Pro',
    !free.joined && /pro/i.test(free.message || ''),
    `the refusal said "${free.message}"`
  )

  // Upgrade through the real path — the Host Pro sheet calls exactly this.
  // Setting the tier on the member object by hand looked like it worked and
  // did not: the gate reads the service's own member table, not the store's
  // copy, so the first version of this test "failed" against working code.
  await woman.evaluate(() =>
    document
      .querySelector('#app')
      .__vue_app__.config.globalProperties.$pinia._s.get('auth')
      .setSubscription('host_pro')
  )
  const upgraded = await tryJoin(woman, 'e-yacht')
  s.check(
    'and a Host Pro member can',
    upgraded.joined,
    `still refused after upgrading: "${upgraded.message}"`
  )

  /* -------------------------------------------------------- the host ---- */
  s.section('The host of an event')

  const host = await man.evaluate(async () => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const events = pinia._s.get('events')
    const auth = pinia._s.get('auth')

    // Host something with a reliability floor far above my own record, the
    // way the create form allows. A floor is itself a Host Pro control, so
    // the tier comes first.
    await auth.setSubscription('host_pro')
    const member = events.memberById(auth.currentUser.id)
    member.reliability = 10

    // Read currentUser AFTER the upgrade: setSubscription assigns a new
    // object rather than mutating, so a reference taken earlier is stale
    const me = auth.currentUser

    try {
      const made = await events.create(
        {
          title: 'Floor test',
          description: 'Has a reliability floor the host does not meet.',
          category: 'sports',
          locationName: 'Doha',
          lat: 25.28,
          lng: 51.52,
          startsAt: new Date(Date.now() + 3 * 864e5).toISOString(),
          durationMinutes: 90,
          maxCapacity: 5,
          minReliability: 90
        },
        me
      )
      const id = made?.id || made

      /**
       * The host cannot leave at all, which is the protection worth
       * asserting here: an event without its host is a room with nobody
       * running it, and every guest on that list turns up to nothing.
       *
       * The related rule — that a host is exempt from their own
       * reliability floor — cannot be reached from this side, precisely
       * because leaving is refused. It is a database rule, enforced by the
       * capacity trigger, and it is asserted where it can actually run:
       * docs/sql-tests/gates.sql, "a host is never locked out of their own
       * reliability-locked event". The first version of this check tested
       * it from here and silently proved nothing.
       */
      const onListAfterCreate = !!events.events
        .find((e) => e.id === id)
        ?.attendeeIds.includes(me.id)

      let refusedToLeave = false
      try {
        await events.cancelRsvp(id, me.id)
      } catch {
        refusedToLeave = true
      }
      const stillOn = !!events.events.find((e) => e.id === id)?.attendeeIds.includes(me.id)

      return { created: true, onListAfterCreate, refusedToLeave, stillOn }
    } catch (e) {
      return { created: false, message: e.message }
    }
  })

  s.check(
    'is put on their own guestlist when they create it',
    host.created && host.onListAfterCreate,
    host.created
      ? 'the event was created with its host missing from the guestlist'
      : `creating it failed: "${host.message}"`
  )
  s.check(
    'and cannot walk away from it, leaving the guests with nobody',
    host.refusedToLeave && host.stillOn,
    host.stillOn
      ? 'leaving was allowed but had no effect, which will confuse whoever tries it'
      : 'the host left their own event — everyone on that guestlist now turns up to nothing'
  )

  /* ---------------------------------------------------------- ended ----- */
  s.section('An event that is already over')

  const over = await man.evaluate(async () => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const events = pinia._s.get('events')
    const auth = pinia._s.get('auth')
    const event = events.events.find((e) => e.hostId !== auth.currentUser.id)
    if (!event) return { skipped: true }
    // Move it into the past without touching anything else
    event.startsAt = new Date(Date.now() - 5 * 3600e3).toISOString()
    event.durationMinutes = 60
    try {
      await events.smartJoin(event.id, auth.currentUser.id)
      return { joined: true }
    } catch (e) {
      return { joined: false, message: e.message }
    }
  })

  if (over.skipped) s.skip('joining is refused after it has ended', 'no event to age')
  else {
    s.check(
      'cannot be joined',
      !over.joined,
      'someone joined an event that already finished'
    )
    s.check(
      'and says so rather than failing silently',
      !over.joined && (over.message || '').length > 5,
      `the refusal said ${JSON.stringify(over.message)}`
    )
  }

  /* --------------------------------------------------------- identity --- */
  s.section('Gender, which the ladies-only gate reads')

  const me = await currentUser(man)
  s.check(
    'is recorded at sign-up, not left blank',
    me?.gender === 'male',
    `the account was created with gender ${JSON.stringify(me?.gender)}`
  )

  const changed = await man.evaluate(async () => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const auth = pinia._s.get('auth')
    try {
      await auth.updateProfile({ name: auth.currentUser.name, bio: '', gender: 'female' })
    } catch {
      /* refusing loudly is fine too */
    }
    return auth.currentUser.gender
  })
  s.check(
    'and cannot be switched afterwards to walk through the gate',
    changed === 'male',
    `gender became ${JSON.stringify(changed)} — the ladies-only gate is now bypassable in two taps`
  )

  await man.context().close()
  await woman.context().close()
  return s.result()
}
