import { SEED_EVENTS, SEED_MEMBERS } from '@/data/seedData'

/**
 * Data-access layer.
 *
 * Today it runs against an in-memory copy of the seed data so the app works
 * with zero backend setup. Every function returns a Promise and mirrors the
 * calls we will make against Supabase (see docs/database-schema.sql), so
 * going live is a drop-in replacement of these bodies:
 *
 *   listEvents()        -> supabase.from('events').select('*, rsvps(user_id)')
 *   createEvent(data)   -> supabase.from('events').insert(...)
 *   joinEvent(...)      -> supabase.rpc('join_event', { event_id })
 *   leaveEvent(...)     -> supabase.from('rsvps').delete()...
 */

const db = {
  events: SEED_EVENTS.map((e) => ({ ...e, attendeeIds: [...e.attendeeIds] })),
  members: [...SEED_MEMBERS]
}

const listeners = new Set()

function emit(change) {
  listeners.forEach((cb) => cb(change))
}

function clone(event) {
  return { ...event, attendeeIds: [...event.attendeeIds] }
}

export async function listEvents() {
  return db.events.map(clone)
}

export async function listMembers() {
  return db.members.map((m) => ({ ...m }))
}

export async function createEvent(data, host) {
  const event = {
    id: `e-${Date.now().toString(36)}`,
    hostId: host.id,
    title: data.title.trim(),
    description: data.description.trim(),
    category: data.category,
    locationName: data.locationName.trim(),
    lat: data.lat,
    lng: data.lng,
    startsAt: data.startsAt,
    durationMinutes: data.durationMinutes,
    maxCapacity: data.maxCapacity,
    attendeeIds: [host.id] // host always attends their own event
  }
  db.events.push(event)
  emit({ type: 'INSERT', event: clone(event) })
  return clone(event)
}

export async function joinEvent(eventId, userId) {
  const event = db.events.find((e) => e.id === eventId)
  if (!event) throw new Error('Event not found')
  if (event.attendeeIds.includes(userId)) return clone(event)
  // Capacity is enforced server-side too (unique constraint + trigger in
  // Postgres) — this mirrors that behavior locally.
  if (event.attendeeIds.length >= event.maxCapacity) {
    throw new Error('This event is already full')
  }
  event.attendeeIds.push(userId)
  emit({ type: 'UPDATE', event: clone(event) })
  return clone(event)
}

export async function leaveEvent(eventId, userId) {
  const event = db.events.find((e) => e.id === eventId)
  if (!event) throw new Error('Event not found')
  if (event.hostId === userId) throw new Error('Hosts cannot leave their own event')
  event.attendeeIds = event.attendeeIds.filter((id) => id !== userId)
  emit({ type: 'UPDATE', event: clone(event) })
  return clone(event)
}

/**
 * Realtime subscription — same shape as
 * supabase.channel('events').on('postgres_changes', ...).subscribe().
 * Returns an unsubscribe function.
 */
export function subscribeToEvents(callback) {
  listeners.add(callback)
  const timer = startActivitySimulator()
  return () => {
    listeners.delete(callback)
    clearInterval(timer)
  }
}

/**
 * Simulates other members RSVPing so the map feels live in demo mode.
 * Deleted entirely once a real backend is wired up.
 */
function startActivitySimulator() {
  let tick = 0
  return setInterval(() => {
    const open = db.events.filter(
      (e) => e.attendeeIds.length < e.maxCapacity
    )
    if (!open.length) return
    const event = open[tick % open.length]
    const joiner = db.members.find((m) => !event.attendeeIds.includes(m.id))
    tick += 1
    if (!joiner) return
    event.attendeeIds.push(joiner.id)
    emit({ type: 'UPDATE', event: clone(event) })
  }, 25000)
}
