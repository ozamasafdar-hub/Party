import { SEED_EVENTS, SEED_MEMBERS } from '@/data/seedData'
import { supabase, isLive } from './supabaseClient'

/**
 * Data-access layer with two backends behind one API:
 *
 *  - LIVE (Supabase configured): events/rsvps/profiles in Postgres, with
 *    realtime change streaming so every open map stays in sync.
 *  - DEMO (no Supabase env): in-memory seed data plus a simulated activity
 *    feed, so the app works with zero backend setup.
 *
 * Realtime callbacks receive either incremental changes
 * ({type:'INSERT'|'UPDATE', event}) or a full snapshot ({type:'SYNC', events}).
 */

/* ========================================================================== */
/* Demo backend                                                               */
/* ========================================================================== */

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

function demoFind(eventId) {
  const event = db.events.find((e) => e.id === eventId)
  if (!event) throw new Error('Event not found')
  return event
}

const demo = {
  async listEvents() {
    return db.events.filter((e) => !e.cancelled).map(clone)
  },

  async listMembers() {
    return db.members.map((m) => ({ ...m }))
  },

  async createEvent(data, host) {
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
      attendeeIds: [host.id]
    }
    db.events.push(event)
    emit({ type: 'INSERT', event: clone(event) })
    return clone(event)
  },

  async updateEvent(eventId, data) {
    const event = demoFind(eventId)
    Object.assign(event, {
      title: data.title.trim(),
      description: data.description.trim(),
      category: data.category,
      locationName: data.locationName.trim(),
      startsAt: data.startsAt,
      durationMinutes: data.durationMinutes,
      maxCapacity: data.maxCapacity
    })
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  async cancelEvent(eventId) {
    const event = demoFind(eventId)
    event.cancelled = true
    emit({ type: 'SYNC', events: await demo.listEvents() })
  },

  async joinEvent(eventId, userId) {
    const event = demoFind(eventId)
    if (event.attendeeIds.includes(userId)) return clone(event)
    if (event.attendeeIds.length >= event.maxCapacity) {
      throw new Error('This event is already full')
    }
    event.attendeeIds.push(userId)
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  async leaveEvent(eventId, userId) {
    const event = demoFind(eventId)
    if (event.hostId === userId) throw new Error('Hosts cannot leave their own event')
    event.attendeeIds = event.attendeeIds.filter((id) => id !== userId)
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  subscribeToEvents(callback) {
    listeners.add(callback)
    const timer = startActivitySimulator()
    return () => {
      listeners.delete(callback)
      clearInterval(timer)
    }
  }
}

/** Demo-only: simulates other members RSVPing so the map feels live. */
function startActivitySimulator() {
  let tick = 0
  return setInterval(() => {
    const open = db.events.filter(
      (e) => !e.cancelled && e.attendeeIds.length < e.maxCapacity
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

/* ========================================================================== */
/* Live backend (Supabase)                                                    */
/* ========================================================================== */

const AVATAR_COLORS = ['#c62d55', '#38bdf8', '#2dd4a0', '#a78bfa', '#fbbf6e', '#fb7185']

function colorFor(id) {
  let hash = 0
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function initialsOf(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .slice(0, 2)
    .join('') || 'M'
}

export function toMember(profile) {
  return {
    id: profile.id,
    name: profile.full_name,
    initials: initialsOf(profile.full_name || ''),
    avatarColor: colorFor(profile.id)
  }
}

function toEvent(row) {
  return {
    id: row.id,
    hostId: row.host_id,
    title: row.title,
    description: row.description || '',
    category: row.category,
    locationName: row.location_name,
    lat: row.lat,
    lng: row.lng,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    maxCapacity: row.max_capacity,
    attendeeIds: (row.rsvps || [])
      .filter((r) => r.status === 'going')
      .map((r) => r.user_id)
  }
}

function friendly(error) {
  if (/EVENT_FULL/.test(error.message)) return new Error('This event is already full')
  return new Error(error.message)
}

const EVENT_SELECT = '*, rsvps(user_id, status)'

const live = {
  async listEvents() {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('is_cancelled', false)
      .order('starts_at')
    if (error) throw friendly(error)
    return data.map(toEvent)
  },

  async listMembers() {
    const { data, error } = await supabase.from('profiles').select('id, full_name')
    if (error) throw friendly(error)
    return data.map(toMember)
  },

  async createEvent(data, host) {
    const { data: row, error } = await supabase
      .from('events')
      .insert({
        host_id: host.id,
        title: data.title.trim(),
        description: data.description.trim(),
        category: data.category,
        location_name: data.locationName.trim(),
        lat: data.lat,
        lng: data.lng,
        starts_at: data.startsAt,
        duration_minutes: data.durationMinutes,
        max_capacity: data.maxCapacity
      })
      .select(EVENT_SELECT)
      .single()
    if (error) throw friendly(error)
    // Host always attends their own event
    await supabase.from('rsvps').insert({ event_id: row.id, user_id: host.id })
    return { ...toEvent(row), attendeeIds: [host.id] }
  },

  async updateEvent(eventId, data) {
    const { data: row, error } = await supabase
      .from('events')
      .update({
        title: data.title.trim(),
        description: data.description.trim(),
        category: data.category,
        location_name: data.locationName.trim(),
        starts_at: data.startsAt,
        duration_minutes: data.durationMinutes,
        max_capacity: data.maxCapacity
      })
      .eq('id', eventId)
      .select(EVENT_SELECT)
      .single()
    if (error) throw friendly(error)
    return toEvent(row)
  },

  async cancelEvent(eventId) {
    const { error } = await supabase
      .from('events')
      .update({ is_cancelled: true })
      .eq('id', eventId)
    if (error) throw friendly(error)
  },

  async joinEvent(eventId, userId) {
    const { error } = await supabase
      .from('rsvps')
      .upsert({ event_id: eventId, user_id: userId, status: 'going' })
    if (error) throw friendly(error)
    return live.fetchEvent(eventId)
  },

  async leaveEvent(eventId, userId) {
    const { error } = await supabase
      .from('rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId)
    if (error) throw friendly(error)
    return live.fetchEvent(eventId)
  },

  async fetchEvent(eventId) {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('id', eventId)
      .single()
    if (error) throw friendly(error)
    return toEvent(data)
  },

  /** Any change to events or rsvps → debounced full snapshot to the store. */
  subscribeToEvents(callback) {
    let timer = null
    const resync = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        try {
          callback({ type: 'SYNC', events: await live.listEvents() })
        } catch {
          /* transient network failure — next change retries */
        }
      }, 250)
    }
    const channel = supabase
      .channel('events-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, resync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rsvps' }, resync)
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }
}

/* ========================================================================== */

const backend = isLive ? live : demo

export const listEvents = (...a) => backend.listEvents(...a)
export const listMembers = (...a) => backend.listMembers(...a)
export const createEvent = (...a) => backend.createEvent(...a)
export const updateEvent = (...a) => backend.updateEvent(...a)
export const cancelEvent = (...a) => backend.cancelEvent(...a)
export const joinEvent = (...a) => backend.joinEvent(...a)
export const leaveEvent = (...a) => backend.leaveEvent(...a)
export const subscribeToEvents = (...a) => backend.subscribeToEvents(...a)
