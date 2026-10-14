/**
 * How many PEOPLE are coming, as opposed to how many members said yes.
 *
 * One RSVP can now bring a family. `attendeeIds.length` counts members and
 * used to be the same number as the people in the room; it isn't any more,
 * and the difference is what oversells an event. Capacity, the progress
 * bars, the number on the map pin and "4/12 going" all mean people.
 *
 * Member counts are still right in their own places — the attendance list
 * and the avatar row are about who, not how many — so those keep using the
 * array directly. The distinction is the whole point of this file.
 *
 * Seats live in `event.seats`, a map of member id to party size. A member
 * who isn't in it brings one person, which is what every existing RSVP and
 * every seeded event means.
 */

/** The size of one member's party, including themselves. */
export function seatsOf(event, userId) {
  const n = event?.seats?.[userId]
  return Number.isInteger(n) && n > 0 ? n : 1
}

/** Everyone who will actually walk in. */
export function peopleGoing(event) {
  if (!event?.attendeeIds) return 0
  return event.attendeeIds.reduce((sum, id) => sum + seatsOf(event, id), 0)
}

/** Places still free, never negative. */
export function spotsLeft(event) {
  return Math.max(0, (event?.maxCapacity ?? 0) - peopleGoing(event))
}

export function isFull(event) {
  return peopleGoing(event) >= (event?.maxCapacity ?? 0)
}

/** Would a party of this size still fit? */
export function fits(event, seats = 1) {
  return peopleGoing(event) + seats <= (event?.maxCapacity ?? 0)
}

/**
 * The most one member may book at once: the ten-seat ceiling from migration
 * 015, or whatever is actually left, whichever is smaller. Already-booked
 * places count toward what this member can have, so changing a party of
 * four to five asks for one more rather than five more.
 */
export function maxSeatsFor(event, userId) {
  const mine = event?.attendeeIds?.includes(userId) ? seatsOf(event, userId) : 0
  return Math.max(1, Math.min(10, spotsLeft(event) + mine))
}

/**
 * Women-only events are one place per member.
 *
 * The gate can check the member booking and cannot check "+3". Allowing
 * guests here would open a hole through the rule migrations 011 and 013
 * exist to close — see migration 015 for the same check in the database,
 * which is where it actually holds.
 */
export function canBringGuests(event) {
  return !event?.ladiesOnly
}
