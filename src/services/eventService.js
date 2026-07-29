import { SEED_EVENTS, SEED_MEMBERS, SEED_MESSAGES } from '@/data/seedData'
import { supabase, isLive } from './supabaseClient'

/**
 * Data-access layer with two backends behind one API:
 *
 *  - LIVE (Supabase configured): events/rsvps/profiles/messages in
 *    Postgres, with realtime change streaming.
 *  - DEMO (no Supabase env): in-memory seed data plus a simulated activity
 *    feed, so the app works with zero backend setup.
 *
 * Event realtime callbacks receive incremental changes
 * ({type:'INSERT'|'UPDATE', event}) or a full snapshot
 * ({type:'SYNC', events}). Chat has its own per-event subscription.
 */

/* ========================================================================== */
/* Demo backend                                                               */
/* ========================================================================== */

const db = {
  events: SEED_EVENTS.map((e) => ({ ...e, attendeeIds: [...e.attendeeIds], waitlistIds: [] })),
  members: [...SEED_MEMBERS],
  messages: SEED_MESSAGES.map((m) => ({ ...m }))
}

const listeners = new Set()
const messageListeners = new Set()

function emit(change) {
  listeners.forEach((cb) => cb(change))
}

function emitMessage(message) {
  messageListeners.forEach((cb) => cb({ ...message }))
}

function clone(event) {
  return {
    ...event,
    attendeeIds: [...event.attendeeIds],
    waitlistIds: [...(event.waitlistIds || [])]
  }
}

function demoFind(eventId) {
  const event = db.events.find((e) => e.id === eventId)
  if (!event) throw new Error('Event not found')
  return event
}

/** When a "going" spot frees up, the longest-waiting member gets it. */
function demoPromote(event) {
  while (
    event.waitlistIds.length &&
    event.attendeeIds.length < event.maxCapacity
  ) {
    event.attendeeIds.push(event.waitlistIds.shift())
  }
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
      coverUrl: data.coverDataUrl || null,
      attendeeIds: [host.id],
      waitlistIds: []
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
      maxCapacity: data.maxCapacity,
      ...(data.coverDataUrl ? { coverUrl: data.coverDataUrl } : {})
    })
    demoPromote(event)
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
    event.waitlistIds = event.waitlistIds.filter((id) => id !== userId)
    event.attendeeIds.push(userId)
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  async joinWaitlist(eventId, userId) {
    const event = demoFind(eventId)
    if (event.attendeeIds.includes(userId) || event.waitlistIds.includes(userId)) {
      return clone(event)
    }
    event.waitlistIds.push(userId)
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  async leaveEvent(eventId, userId) {
    const event = demoFind(eventId)
    if (event.hostId === userId) throw new Error('Hosts cannot leave their own event')
    event.attendeeIds = event.attendeeIds.filter((id) => id !== userId)
    event.waitlistIds = event.waitlistIds.filter((id) => id !== userId)
    demoPromote(event)
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  subscribeToEvents(callback) {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  },

  /* chat ------------------------------------------------------------------ */

  async listMessages(eventId) {
    return db.messages
      .filter((m) => m.eventId === eventId)
      .sort((a, b) => new Date(a.at) - new Date(b.at))
      .map((m) => ({ ...m }))
  },

  async sendMessage(eventId, user, text) {
    const message = {
      id: `m-${Date.now().toString(36)}`,
      eventId,
      userId: user.id,
      text: text.trim().slice(0, 500),
      at: new Date().toISOString()
    }
    db.messages.push(message)
    emitMessage(message)
    return { ...message }
  },

  subscribeToMessages(eventId, callback) {
    const filtered = (message) => {
      if (message.eventId === eventId) callback(message)
    }
    messageListeners.add(filtered)
    return () => messageListeners.delete(filtered)
  }
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
    avatarColor: colorFor(profile.id),
    avatarUrl: profile.avatar_url || null,
    bio: profile.bio || ''
  }
}

function toEvent(row) {
  const rsvps = row.rsvps || []
  const waitlist = rsvps
    .filter((r) => r.status === 'waitlist')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
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
    coverUrl: row.cover_url || null,
    attendeeIds: rsvps.filter((r) => r.status === 'going').map((r) => r.user_id),
    waitlistIds: waitlist.map((r) => r.user_id)
  }
}

function toMessage(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    text: row.body,
    at: row.created_at
  }
}

function friendly(error) {
  if (/EVENT_FULL/.test(error.message)) return new Error('This event is already full')
  return new Error(error.message)
}

async function uploadCover(userId, coverDataUrl) {
  const { dataUrlToBlob } = await import('@/utils/image')
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from('covers')
    .upload(path, dataUrlToBlob(coverDataUrl), { contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)
  return supabase.storage.from('covers').getPublicUrl(path).data.publicUrl
}

const EVENT_SELECT = '*, rsvps(user_id, status, created_at)'

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
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
    if (error) throw friendly(error)
    return data.map(toMember)
  },

  async createEvent(data, host) {
    const cover_url = data.coverDataUrl ? await uploadCover(host.id, data.coverDataUrl) : null
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
        max_capacity: data.maxCapacity,
        cover_url
      })
      .select(EVENT_SELECT)
      .single()
    if (error) throw friendly(error)
    // Host always attends their own event
    await supabase.from('rsvps').insert({ event_id: row.id, user_id: host.id })
    return { ...toEvent(row), attendeeIds: [host.id] }
  },

  async updateEvent(eventId, data) {
    const patch = {
      title: data.title.trim(),
      description: data.description.trim(),
      category: data.category,
      location_name: data.locationName.trim(),
      starts_at: data.startsAt,
      duration_minutes: data.durationMinutes,
      max_capacity: data.maxCapacity
    }
    if (data.coverDataUrl) {
      const { data: current } = await supabase
        .from('events')
        .select('host_id')
        .eq('id', eventId)
        .single()
      patch.cover_url = await uploadCover(current.host_id, data.coverDataUrl)
    }
    const { data: row, error } = await supabase
      .from('events')
      .update(patch)
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

  async joinWaitlist(eventId, userId) {
    const { error } = await supabase
      .from('rsvps')
      .upsert({ event_id: eventId, user_id: userId, status: 'waitlist' })
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
  },

  /* chat ------------------------------------------------------------------ */

  async listMessages(eventId) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at')
    if (error) throw friendly(error)
    return data.map(toMessage)
  },

  async sendMessage(eventId, user, text) {
    const { data, error } = await supabase
      .from('messages')
      .insert({ event_id: eventId, user_id: user.id, body: text.trim().slice(0, 500) })
      .select()
      .single()
    if (error) throw friendly(error)
    return toMessage(data)
  },

  subscribeToMessages(eventId, callback) {
    const channel = supabase
      .channel(`chat-${eventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `event_id=eq.${eventId}` },
        (payload) => callback(toMessage(payload.new))
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
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
export const joinWaitlist = (...a) => backend.joinWaitlist(...a)
export const leaveEvent = (...a) => backend.leaveEvent(...a)
export const subscribeToEvents = (...a) => backend.subscribeToEvents(...a)
export const listMessages = (...a) => backend.listMessages(...a)
export const sendMessage = (...a) => backend.sendMessage(...a)
export const subscribeToMessages = (...a) => backend.subscribeToMessages(...a)
