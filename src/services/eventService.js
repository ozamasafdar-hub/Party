import {
  SEED_EVENTS,
  SEED_MEMBERS,
  SEED_MESSAGES,
  SEED_MEMORIES,
  SEED_FOLLOWS
} from '@/data/seedData'
import { safePinColor } from '@/config/categories'
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
  events: SEED_EVENTS.map((e) => ({
    ...e,
    attendeeIds: [...e.attendeeIds],
    waitlistIds: [],
    requestedIds: [...(e.requestedIds || [])],
    payments: {}
  })),
  members: SEED_MEMBERS.map((m) => ({ ...m })),
  messages: SEED_MESSAGES.map((m) => ({ ...m })),
  memories: SEED_MEMORIES.map((m) => ({ ...m, reactions: { ...m.reactions } })),
  // Direct messages: threads keyed by their ordered pair, same shape the
  // live tables use. `dmSeeded` tracks who has had their demo inbox filled.
  dmThreads: [],
  dmMessages: [],
  dmReads: {},
  dmBlocks: new Set(),
  dmSeeded: new Set(),
  dmSeq: 1
}

function demoReliabilityOf(userId) {
  return db.members.find((m) => m.id === userId)?.reliability ?? 100
}

/**
 * Demo accounts live in this browser's localStorage — surface them in the
 * members list so hosts see real names (and reliability history sticks).
 * Attendance history already in the demo db wins over the copy the auth
 * session carries, so recorded no-shows aren't clobbered on re-login.
 */
function demoUpsertMember(user) {
  if (!user?.id) return
  const i = db.members.findIndex((m) => m.id === user.id)
  const existing = i === -1 ? null : db.members[i]
  const member = {
    id: user.id,
    name: user.name,
    initials: user.initials,
    avatarColor: user.avatarColor,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? '',
    gender: user.gender ?? null,
    reliability: existing?.reliability ?? user.reliability ?? 100,
    attended: existing?.attended ?? user.attended ?? 0,
    flaked: existing?.flaked ?? user.flaked ?? 0,
    subscriptionTier: user.subscriptionTier ?? existing?.subscriptionTier ?? 'free',
    subscriptionStatus: user.subscriptionStatus ?? existing?.subscriptionStatus ?? 'none'
  }
  if (i === -1) db.members.push(member)
  else db.members[i] = member
}

/** Mirrors the enforce_host_tier database trigger for demo mode. */
function demoGateHostTier(data, host) {
  const tier =
    host.subscriptionTier ??
    db.members.find((m) => m.id === host.id)?.subscriptionTier ??
    'free'
  if (tier === 'host_pro') return { isPro: true }

  if (data.maxCapacity > 5) {
    throw friendly(new Error('FREE_TIER_CAPACITY'))
  }
  if ((data.pricePerSpot || 0) > 0) {
    throw friendly(new Error('FREE_TIER_PAID'))
  }
  if (data.minReliability != null) {
    throw friendly(new Error('FREE_TIER_RELIABILITY'))
  }
  const now = new Date()
  const active = db.events.filter(
    (e) =>
      e.hostId === host.id &&
      !e.cancelled &&
      new Date(e.startsAt).getTime() + e.durationMinutes * 60000 > now.getTime()
  )
  if (active.length >= 1) {
    throw friendly(new Error('FREE_TIER_PINS'))
  }
  const thisMonth = db.events.filter((e) => {
    if (e.hostId !== host.id) return false
    const created = new Date(e.createdAt || e.startsAt)
    return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth()
  })
  if (thisMonth.length >= 2) {
    throw friendly(new Error('FREE_TIER_MONTHLY'))
  }
  return { isPro: false }
}

function demoGateReliability(event, userId) {
  // A host is not a guest applying to their own event — without this, a host
  // whose own record sits under the floor they set is locked off their own
  // guestlist. Live mode exempts them in the capacity trigger too.
  if (event.hostId === userId) return
  if (event.minReliability != null && demoReliabilityOf(userId) < event.minReliability) {
    throw new Error(
      `This host requires a ${event.minReliability}%+ attendance record`
    )
  }
}

function demoTierOf(userId) {
  return db.members.find((m) => m.id === userId)?.subscriptionTier ?? 'free'
}

/**
 * Seats, in the demo backend.
 *
 * `event.seats` maps a member id to their party size. Absent means one, so
 * every seeded event and every RSVP made before this feature existed still
 * means exactly what it always did. Mirrors src/utils/seats.js, which the
 * views use — the arithmetic has to agree on both sides of the service
 * boundary or the button and the rule disagree.
 */
function demoSeatsOf(event, userId) {
  const n = event?.seats?.[userId]
  return Number.isInteger(n) && n > 0 ? n : 1
}

function demoPeopleGoing(event) {
  return event.attendeeIds.reduce((sum, id) => sum + demoSeatsOf(event, id), 0)
}

/** Pro-only events: only Host Pro members may join or request. */
function demoGateProOnly(event, userId) {
  if (event.proOnly && event.hostId !== userId && demoTierOf(userId) !== 'host_pro') {
    throw friendly(new Error('PRO_ONLY'))
  }
}

/**
 * Ladies-only and "already over" are enforced here, not only by hiding the
 * event: a shared link, a tab left open since before the host flipped the
 * toggle, or a poked console all reach this function with the UI bypassed.
 * Live mode enforces the same two rules in the capacity trigger.
 */
function demoGateJoinable(event, userId, seats = 1) {
  // The seat rule binds the host too: the promise is about who ends up in
  // the room, and a guest is someone nobody has checked. Same reasoning,
  // and the same wording, as migration 015.
  if (event.ladiesOnly && seats > 1) {
    throw friendly(new Error('LADIES_ONLY_SEATS'))
  }
  if (event.hostId === userId) return
  if (event.ladiesOnly && db.members.find((m) => m.id === userId)?.gender !== 'female') {
    throw friendly(new Error('LADIES_ONLY'))
  }
  const end = new Date(event.startsAt).getTime() + event.durationMinutes * 60000
  if (Date.now() > end) throw friendly(new Error('EVENT_ENDED'))
}

const listeners = new Set()
const messageListeners = new Set()
const dmListeners = new Set()

function emit(change) {
  listeners.forEach((cb) => cb(change))
}

function emitMessage(message) {
  messageListeners.forEach((cb) => cb({ ...message }))
}

function emitDm(message) {
  dmListeners.forEach((cb) => cb({ ...message }))
}

/* --- demo direct messages ------------------------------------------------- */

const DM_BLOCKED_MESSAGE = "You can't message this member."

/** Threads are stored under the ordered pair, so a pair has exactly one. */
function demoPairKey(a, b) {
  return [a, b].sort().join('|')
}

function demoFindThread(meId, peerId, create = false) {
  const key = demoPairKey(meId, peerId)
  let thread = db.dmThreads.find((t) => t.key === key)
  if (!thread && create) {
    thread = {
      id: `dt-${db.dmSeq++}`,
      key,
      members: [meId, peerId],
      lastAt: null,
      lastBody: ''
    }
    db.dmThreads.push(thread)
  }
  return thread
}

function demoBlockedEitherWay(a, b) {
  return db.dmBlocks.has(`${a}|${b}`) || db.dmBlocks.has(`${b}|${a}`)
}

function demoUnread(thread, meId) {
  const readAt = new Date(db.dmReads[`${thread.id}|${meId}`] || 0)
  return db.dmMessages.filter(
    (m) => m.threadId === thread.id && m.senderId !== meId && new Date(m.at) > readAt
  ).length
}

/**
 * Demo mode has one browser and one real person, so a fresh account would
 * always open an empty inbox. Seed a single greeting the first time
 * someone looks — enough to show the feature working without pretending
 * there is a crowd.
 */
function demoSeedInbox(meId) {
  if (!meId || db.dmSeeded.has(meId)) return
  db.dmSeeded.add(meId)
  const greeter = db.members.find((m) => m.id === 'u-noora')
  if (!greeter || greeter.id === meId) return
  const thread = demoFindThread(meId, greeter.id, true)
  const at = new Date(Date.now() - 45 * 60 * 1000).toISOString()
  const text = 'Salam! Saw you on the map — the Katara concert has spots if you fancy it 🎶'
  db.dmMessages.push({ id: `dm-${db.dmSeq++}`, threadId: thread.id, senderId: greeter.id, text, at })
  thread.lastAt = at
  thread.lastBody = text.slice(0, 140)
}

function clone(event) {
  return {
    ...event,
    attendeeIds: [...event.attendeeIds],
    waitlistIds: [...(event.waitlistIds || [])],
    requestedIds: [...(event.requestedIds || [])],
    photoUrls: [...(event.photoUrls || [])],
    payments: { ...(event.payments || {}) }
  }
}

/** Kept existing photos + freshly uploaded ones, in display order. */
function mergePhotos(data) {
  return [...(data.keptPhotoUrls || []), ...(data.newPhotoDataUrls || [])]
}

function demoFind(eventId) {
  const event = db.events.find((e) => e.id === eventId)
  if (!event) throw new Error('Event not found')
  return event
}

/**
 * When places free up, the longest-waiting party that FITS gets them.
 *
 * Skipping over a party too big for the gap is the same rule the database
 * uses (migration 015) and the same one every box office uses: holding
 * places empty for a group of five that may never be completed serves
 * nobody. It does mean a single can get in ahead of a family who waited
 * longer, which is unfair and is still the right call.
 */
function demoPromote(event) {
  let moved = true
  while (moved) {
    moved = false
    for (let i = 0; i < event.waitlistIds.length; i++) {
      const id = event.waitlistIds[i]
      if (demoPeopleGoing(event) + demoSeatsOf(event, id) <= event.maxCapacity) {
        event.waitlistIds.splice(i, 1)
        event.attendeeIds.push(id)
        moved = true
        break
      }
    }
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
    const { isPro } = demoGateHostTier(data, host)
    const photos = mergePhotos(data)
    const event = {
      id: `e-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      isProEvent: isPro,
      featuredPin: isPro && !!data.featuredPin,
      hostId: host.id,
      title: data.title.trim(),
      description: data.description.trim(),
      category: data.category,
      locationName: data.locationName.trim(),
      lat: data.lat,
      lng: data.lng,
      exactLat: data.exactLat ?? null,
      exactLng: data.exactLng ?? null,
      startsAt: data.startsAt,
      durationMinutes: data.durationMinutes,
      maxCapacity: data.maxCapacity,
      coverUrl: photos[0] || null,
      photoUrls: photos,
      pinColor: safePinColor(data.pinColor),
      approvalMode: !!data.approvalMode,
      minReliability: data.minReliability ?? null,
      pricePerSpot: data.pricePerSpot || 0,
      ladiesOnly: !!data.ladiesOnly,
      locationBlurred: !!data.locationBlurred,
      proOnly: isPro && !!data.proOnly,
      attendanceRecorded: false,
      attendeeIds: [host.id],
      waitlistIds: [],
      requestedIds: [],
      payments: {}
    }
    db.events.push(event)
    emit({ type: 'INSERT', event: clone(event) })
    return clone(event)
  },

  async updateEvent(eventId, data) {
    const event = demoFind(eventId)
    const photos = mergePhotos(data)
    Object.assign(event, {
      title: data.title.trim(),
      description: data.description.trim(),
      category: data.category,
      locationName: data.locationName.trim(),
      startsAt: data.startsAt,
      durationMinutes: data.durationMinutes,
      maxCapacity: data.maxCapacity,
      approvalMode: !!data.approvalMode,
      minReliability: data.minReliability ?? null,
      pricePerSpot: data.pricePerSpot || 0,
      ladiesOnly: !!data.ladiesOnly,
      proOnly: !!data.proOnly,
      coverUrl: photos[0] || null,
      photoUrls: photos,
      pinColor: safePinColor(data.pinColor)
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

  async joinEvent(eventId, userId, seats = 1) {
    const event = demoFind(eventId)
    demoGateReliability(event, userId)
    demoGateProOnly(event, userId)
    demoGateJoinable(event, userId, seats)

    // Changing an existing booking asks only for the difference, so a party
    // of four becoming five needs one free place rather than five
    const mine = event.attendeeIds.includes(userId) ? demoSeatsOf(event, userId) : 0
    if (demoPeopleGoing(event) - mine + seats > event.maxCapacity) {
      throw friendly(new Error('EVENT_FULL'))
    }
    event.seats = { ...(event.seats || {}), [userId]: seats }
    if (event.attendeeIds.includes(userId)) {
      emit({ type: 'UPDATE', event: clone(event) })
      return clone(event)
    }
    event.waitlistIds = event.waitlistIds.filter((id) => id !== userId)
    event.requestedIds = event.requestedIds.filter((id) => id !== userId)
    event.attendeeIds.push(userId)
    if (event.payments[userId]?.status === 'pending') {
      event.payments[userId].status = 'held_in_escrow'
    }
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  async requestJoin(eventId, userId, seats = 1) {
    const event = demoFind(eventId)
    demoGateReliability(event, userId)
    demoGateProOnly(event, userId)
    demoGateJoinable(event, userId, seats)
    // The party size travels with the request, so approving it later knows
    // how many places to find
    event.seats = { ...(event.seats || {}), [userId]: seats }
    if (event.attendeeIds.includes(userId) || event.requestedIds.includes(userId)) {
      emit({ type: 'UPDATE', event: clone(event) })
      return clone(event)
    }
    event.requestedIds.push(userId)
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  async approveRequest(eventId, userId) {
    const event = demoFind(eventId)
    if (!event.requestedIds.includes(userId)) return clone(event)
    if (demoPeopleGoing(event) + demoSeatsOf(event, userId) > event.maxCapacity) {
      throw friendly(new Error('EVENT_FULL'))
    }
    event.requestedIds = event.requestedIds.filter((id) => id !== userId)
    event.attendeeIds.push(userId)
    if (event.payments[userId]?.status === 'pending') {
      event.payments[userId].status = 'held_in_escrow'
    }
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  async declineRequest(eventId, userId) {
    const event = demoFind(eventId)
    event.requestedIds = event.requestedIds.filter((id) => id !== userId)
    if (event.payments[userId]) event.payments[userId].status = 'refunded'
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  async joinWaitlist(eventId, userId, seats = 1) {
    const event = demoFind(eventId)
    demoGateJoinable(event, userId, seats)
    event.seats = { ...(event.seats || {}), [userId]: seats }
    if (event.attendeeIds.includes(userId) || event.waitlistIds.includes(userId)) {
      return clone(event)
    }
    demoGateReliability(event, userId)
    demoGateProOnly(event, userId)
    demoGateJoinable(event, userId)
    event.waitlistIds.push(userId)
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  async leaveEvent(eventId, userId) {
    const event = demoFind(eventId)
    if (event.hostId === userId) throw new Error('Hosts cannot leave their own event')
    event.attendeeIds = event.attendeeIds.filter((id) => id !== userId)
    event.waitlistIds = event.waitlistIds.filter((id) => id !== userId)
    event.requestedIds = event.requestedIds.filter((id) => id !== userId)
    if (event.payments[userId]) event.payments[userId].status = 'refunded'
    demoPromote(event)
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  /** Simulated escrow — records the payment locally. */
  async recordPayment(eventId, userId, amount, status) {
    const event = demoFind(eventId)
    event.payments[userId] = { amount, status }
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  async recordAttendance(eventId, hostId, noShowIds) {
    const event = demoFind(eventId)
    if (event.hostId !== hostId) throw new Error('Only the host can record attendance')
    if (event.attendanceRecorded) throw new Error('Attendance already recorded')
    for (const guestId of event.attendeeIds) {
      if (guestId === hostId) continue
      const member = db.members.find((m) => m.id === guestId)
      if (!member) continue
      if (noShowIds.includes(guestId)) member.flaked += 1
      else member.attended += 1
      member.reliability = Math.round(
        (100 * member.attended) / Math.max(1, member.attended + member.flaked)
      )
    }
    event.attendanceRecorded = true
    emit({ type: 'UPDATE', event: clone(event) })
    return clone(event)
  },

  async getExactLocation(eventId, userId) {
    const event = demoFind(eventId)
    // The whole point of blurring is that the address is earned. Live mode
    // enforces this with RLS on event_locations; demo has to say no itself.
    if (event.hostId !== userId && !event.attendeeIds.includes(userId)) return null
    return event.exactLat != null
      ? { lat: event.exactLat, lng: event.exactLng }
      : { lat: event.lat, lng: event.lng }
  },

  /* 24h memory recaps ------------------------------------------------------ */

  async listMemories() {
    return db.memories.map((m) => ({ ...m, reactions: { ...m.reactions } }))
  },

  async addMemory(eventId, user, { mediaDataUrl, mediaType, caption }) {
    const event = demoFind(eventId)
    if (!event.attendeeIds.includes(user.id)) {
      throw new Error('Only guests who attended can post to this recap')
    }
    const end = new Date(event.startsAt).getTime() + event.durationMinutes * 60000
    if (Date.now() < end) throw new Error('The recap opens once the event ends')
    if (Date.now() > end + 24 * 3600000) throw new Error('This recap has expired')
    const memory = {
      id: `mem-${Date.now().toString(36)}`,
      eventId,
      userId: user.id,
      mediaUrl: mediaDataUrl,
      mediaType,
      caption: (caption || '').trim().slice(0, 100),
      reactions: {},
      at: new Date().toISOString()
    }
    db.memories.push(memory)
    return { ...memory, reactions: {} }
  },

  async reactToMemory(memoryId, emoji) {
    const memory = db.memories.find((m) => m.id === memoryId)
    if (!memory) throw new Error('Memory not found')
    memory.reactions[emoji] = (memory.reactions[emoji] || 0) + 1
    return { ...memory, reactions: { ...memory.reactions } }
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
  },

  /* follows --------------------------------------------------------------- */

  async listFollowing(userId) {
    try {
      const stored = JSON.parse(localStorage.getItem(`wyn:follows:${userId}`))
      if (stored) return stored
    } catch {
      /* fall through to the seeded graph */
    }
    return [...(SEED_FOLLOWS[userId] || [])]
  },

  /** Reverse lookup: everyone who follows this member. */
  async listFollowers(userId) {
    const followers = new Set()
    for (const [follower, ids] of Object.entries(SEED_FOLLOWS)) {
      if (ids.includes(userId)) followers.add(follower)
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key?.startsWith('wyn:follows:')) continue
        const follower = key.slice('wyn:follows:'.length)
        const ids = JSON.parse(localStorage.getItem(key)) || []
        if (ids.includes(userId)) followers.add(follower)
        else followers.delete(follower) // local list overrides the seed
      }
    } catch {
      /* storage unavailable — seeded graph only */
    }
    return [...followers]
  },

  async follow(userId, targetId) {
    const ids = new Set(await demo.listFollowing(userId))
    ids.add(targetId)
    try {
      localStorage.setItem(`wyn:follows:${userId}`, JSON.stringify([...ids]))
    } catch {
      /* sandboxed iframe — follow just won't persist */
    }
    return [...ids]
  },

  async unfollow(userId, targetId) {
    const ids = new Set(await demo.listFollowing(userId))
    ids.delete(targetId)
    try {
      localStorage.setItem(`wyn:follows:${userId}`, JSON.stringify([...ids]))
    } catch {
      /* sandboxed iframe — follow just won't persist */
    }
    return [...ids]
  },

  /* direct messages -------------------------------------------------------- */

  async openDmThread(meId, peerId) {
    if (demoBlockedEitherWay(meId, peerId)) throw new Error(DM_BLOCKED_MESSAGE)
    return demoFindThread(meId, peerId, true).id
  },

  async listDmThreads(meId) {
    demoSeedInbox(meId)
    return db.dmThreads
      .filter((t) => t.members.includes(meId))
      .map((t) => ({
        id: t.id,
        peerId: t.members.find((id) => id !== meId),
        lastBody: t.lastBody,
        lastAt: t.lastAt,
        unread: demoUnread(t, meId)
      }))
      .sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0))
  },

  async listDmMessages(threadId) {
    return db.dmMessages
      .filter((m) => m.threadId === threadId)
      .sort((a, b) => new Date(a.at) - new Date(b.at))
      .map((m) => ({ ...m }))
  },

  async sendDm(threadId, user, text) {
    const thread = db.dmThreads.find((t) => t.id === threadId)
    if (!thread) throw new Error('Conversation not found')
    const peerId = thread.members.find((id) => id !== user.id)
    if (demoBlockedEitherWay(user.id, peerId)) throw new Error(DM_BLOCKED_MESSAGE)
    const message = {
      id: `dm-${db.dmSeq++}`,
      threadId,
      senderId: user.id,
      text: text.trim().slice(0, 2000),
      at: new Date().toISOString()
    }
    db.dmMessages.push(message)
    thread.lastAt = message.at
    thread.lastBody = message.text.slice(0, 140)
    emitDm(message)
    return { ...message }
  },

  subscribeToDmThread(threadId, callback) {
    const filtered = (message) => {
      if (message.threadId === threadId) callback(message)
    }
    dmListeners.add(filtered)
    return () => dmListeners.delete(filtered)
  },

  subscribeToDmInbox(meId, callback) {
    const filtered = (message) => {
      const thread = db.dmThreads.find((t) => t.id === message.threadId)
      if (thread?.members.includes(meId)) callback(message)
    }
    dmListeners.add(filtered)
    return () => dmListeners.delete(filtered)
  },

  async markDmRead(threadId, meId) {
    db.dmReads[`${threadId}|${meId}`] = new Date().toISOString()
  },

  async listBlocked(meId) {
    return [...db.dmBlocks]
      .filter((key) => key.startsWith(`${meId}|`))
      .map((key) => key.slice(meId.length + 1))
  },

  async blockMember(meId, peerId) {
    db.dmBlocks.add(`${meId}|${peerId}`)
    return demo.listBlocked(meId)
  },

  async unblockMember(meId, peerId) {
    db.dmBlocks.delete(`${meId}|${peerId}`)
    return demo.listBlocked(meId)
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
    bio: profile.bio || '',
    gender: profile.gender || null,
    reliability: Number(profile.reliability_score ?? 100),
    attended: profile.events_attended ?? 0,
    flaked: profile.events_flaked ?? 0,
    subscriptionTier: profile.subscription_tier ?? 'free',
    subscriptionStatus: profile.subscription_status ?? 'none'
  }
}

function toMemory(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    caption: row.caption || '',
    reactions: row.reactions || {},
    at: row.created_at
  }
}

function toEvent(row) {
  const rsvps = row.rsvps || []
  const byStatus = (status) =>
    rsvps
      .filter((r) => r.status === status)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((r) => r.user_id)
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
    photoUrls: row.photo_urls?.length
      ? row.photo_urls
      : row.cover_url
        ? [row.cover_url]
        : [],
    pinColor: row.pin_color || null,
    createdAt: row.created_at || null,
    isProEvent: !!row.is_pro_event,
    featuredPin: !!row.is_featured_pin,
    proOnly: !!row.pro_only,
    approvalMode: !!row.approval_mode,
    minReliability: row.min_reliability ?? null,
    pricePerSpot: Number(row.price_per_spot || 0),
    ladiesOnly: !!row.is_ladies_only,
    locationBlurred: !!row.is_location_blurred,
    attendanceRecorded: !!row.attendance_recorded,
    attendeeIds: byStatus('going'),
    waitlistIds: byStatus('waitlist'),
    requestedIds: byStatus('requested'),
    /**
     * Party sizes, keyed by member.
     *
     * Only members bringing more than themselves are listed; everyone else
     * means one, which is what every row written before migration 015 says
     * by default. An un-migrated database has no seats column at all, and
     * then this is simply empty and every booking counts as one — the same
     * answer the app gave before any of this existed.
     */
    seats: Object.fromEntries(
      rsvps.filter((r) => (r.seats ?? 1) > 1).map((r) => [r.user_id, r.seats])
    ),
    payments: Object.fromEntries(
      (row.rsvp_payments || []).map((p) => [
        p.user_id,
        { amount: Number(p.amount), status: p.status }
      ])
    )
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

function toDm(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    text: row.body,
    at: row.created_at
  }
}

/** Databases that haven't run migration 009 yet name one of these. */
const DM_TABLES = /dm_threads|dm_messages|dm_reads|dm_blocks|dm_inbox|open_dm_thread/

function friendly(error) {
  // Order matters below: LADIES_ONLY_SEATS and BAD_SEATS are checked before
  // the looser patterns that would also match them and answer the wrong
  // question — /LADIES_ONLY/ matches LADIES_ONLY_SEATS perfectly well.
  if (/LADIES_ONLY_SEATS/.test(error.message)) {
    return new Error(
      'Women-only events are one place per member — ask your friends to join in their own names'
    )
  }
  if (/BAD_SEATS/.test(error.message)) {
    return new Error('Choose between 1 and 10 places')
  }
  if (/NOT_SIGNED_IN/.test(error.message)) {
    return new Error('Sign in to book a place')
  }
  if (/EVENT_FULL/.test(error.message)) {
    // The database says how many are left; "already full" throws that away,
    // and how many are left is exactly what you want to know when you have
    // just asked for four
    const left = error.message.match(/only (\d+) of (\d+)/)
    if (left) {
      return new Error(
        left[1] === '0'
          ? 'This event is already full'
          : `Only ${left[1]} place${left[1] === '1' ? '' : 's'} left — try a smaller party`
      )
    }
    return new Error('This event is already full')
  }
  if (/RELIABILITY_TOO_LOW/.test(error.message)) {
    return new Error('This host requires a higher attendance record to join')
  }
  if (/FREE_TIER_CAPACITY/.test(error.message)) {
    return new Error('Free events are capped at 5 guests — upgrade to Host Pro for bigger events')
  }
  if (/FREE_TIER_PAID/.test(error.message)) {
    return new Error('Charging per spot needs Host Pro')
  }
  if (/FREE_TIER_RELIABILITY/.test(error.message)) {
    return new Error('Reliability locks need Host Pro')
  }
  if (/FREE_TIER_PINS/.test(error.message)) {
    return new Error('Free hosts keep 1 live pin on the map — upgrade to Host Pro for unlimited events')
  }
  if (/FREE_TIER_MONTHLY/.test(error.message)) {
    return new Error('Free hosts can create 2 events per month — upgrade to Host Pro for unlimited hosting')
  }
  if (/PRO_ONLY/.test(error.message)) {
    return new Error('This event is open to Host Pro members only')
  }
  if (/LADIES_ONLY/.test(error.message)) {
    return new Error('This event is for women only')
  }
  if (/EVENT_ENDED/.test(error.message)) {
    return new Error('This event has already ended')
  }
  if (/DM_BLOCKED/.test(error.message)) {
    return new Error(DM_BLOCKED_MESSAGE)
  }
  // An insert refused by the DM policy means the other side blocked you —
  // which they are not told, and neither are you, beyond this.
  if (/row-level security/i.test(error.message) && /dm_messages/.test(error.message)) {
    return new Error("This member isn't accepting messages.")
  }
  if (DM_TABLES.test(error.message)) {
    return new Error("Direct messages aren't switched on yet.")
  }
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

/**
 * `rsvps(*)` rather than a column list, deliberately.
 *
 * Naming `seats` explicitly would fail the entire query on a database that
 * has not run migration 015 yet — not degrade, fail — and take every event
 * on the map with it. A star returns whichever columns exist, so the app
 * works before and after the migration and toEvent() simply finds no seats
 * until there are some. The row is five small columns; the extra one costs
 * nothing.
 */
const EVENT_SELECT = '*, rsvps(*), rsvp_payments(user_id, status, amount)'

/**
 * Columns added by later migrations. A database that hasn't run them yet
 * rejects the write naming one missing column at a time, so writes drop
 * the named column and retry rather than failing the host's event.
 */
const OPTIONAL_EVENT_COLUMNS = ['photo_urls', 'is_featured_pin', 'pro_only', 'pin_color']

/** Drops the column Postgres complained about. Returns false if it wasn't one of ours. */
function stripUnknownColumn(payload, error) {
  const column = OPTIONAL_EVENT_COLUMNS.find(
    (name) => name in payload && new RegExp(`\\b${name}\\b`).test(error.message || '')
  )
  if (!column) return false
  delete payload[column]
  return true
}

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
    // gender deliberately not selected — only your own profile needs it
    // (ladies-only filtering), no reason to expose everyone else's
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, bio, reliability_score, events_attended, events_flaked')
    if (error) throw friendly(error)
    return data.map(toMember)
  },

  async createEvent(data, host) {
    const uploaded = []
    for (const dataUrl of data.newPhotoDataUrls || []) {
      uploaded.push(await uploadCover(host.id, dataUrl))
    }
    const photo_urls = [...(data.keptPhotoUrls || []), ...uploaded]
    const insertPayload = {
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
      cover_url: photo_urls[0] || null,
      photo_urls,
      pin_color: safePinColor(data.pinColor),
      approval_mode: !!data.approvalMode,
      min_reliability: data.minReliability ?? null,
      price_per_spot: data.pricePerSpot || 0,
      is_ladies_only: !!data.ladiesOnly,
      is_location_blurred: !!data.locationBlurred,
      // The enforce_host_tier trigger overrides these for free hosts
      is_featured_pin: !!data.featuredPin,
      pro_only: !!data.proOnly
    }
    // Databases behind on migrations 004-008 report one unknown column per
    // attempt — strip and retry so older schemas keep working.
    let row, error
    for (let attempt = 0; attempt < OPTIONAL_EVENT_COLUMNS.length + 1; attempt++) {
      ;({ data: row, error } = await supabase
        .from('events')
        .insert(insertPayload)
        .select(EVENT_SELECT)
        .single())
      if (!error) break
      if (!stripUnknownColumn(insertPayload, error)) break
    }
    if (error) throw friendly(error)
    // Host always attends their own event
    await supabase.from('rsvps').insert({ event_id: row.id, user_id: host.id })
    // Blurred events keep the exact spot in a guarded side table
    if (data.locationBlurred && data.exactLat != null) {
      await supabase.from('event_locations').insert({
        event_id: row.id,
        lat: data.exactLat,
        lng: data.exactLng
      })
    }
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
      max_capacity: data.maxCapacity,
      approval_mode: !!data.approvalMode,
      min_reliability: data.minReliability ?? null,
      price_per_spot: data.pricePerSpot || 0,
      is_ladies_only: !!data.ladiesOnly,
      pro_only: !!data.proOnly,
      pin_color: safePinColor(data.pinColor)
    }
    const uploaded = []
    if (data.newPhotoDataUrls?.length) {
      const { data: current } = await supabase
        .from('events')
        .select('host_id')
        .eq('id', eventId)
        .single()
      for (const dataUrl of data.newPhotoDataUrls) {
        uploaded.push(await uploadCover(current.host_id, dataUrl))
      }
    }
    patch.photo_urls = [...(data.keptPhotoUrls || []), ...uploaded]
    patch.cover_url = patch.photo_urls[0] || null
    let row, error
    for (let attempt = 0; attempt < OPTIONAL_EVENT_COLUMNS.length + 1; attempt++) {
      ;({ data: row, error } = await supabase
        .from('events')
        .update(patch)
        .eq('id', eventId)
        .select(EVENT_SELECT)
        .single())
      if (!error) break
      if (!stripUnknownColumn(patch, error)) break
    }
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

  async joinEvent(eventId, userId, seats = 1) {
    const { error } = await supabase
      .rpc('book_seats', { p_event_id: eventId, p_seats: seats })
    if (error) {
      // Before migration 015 there is no book_seats; fall back to the plain
      // upsert so an un-migrated database still takes single bookings
      if (/book_seats/.test(error.message)) {
        const { error: plain } = await supabase
          .from('rsvps')
          .upsert({ event_id: eventId, user_id: userId, status: 'going' })
        if (plain) throw friendly(plain)
        return live.fetchEvent(eventId)
      }
      throw friendly(error)
    }
    return live.fetchEvent(eventId)
  },

  async joinWaitlist(eventId, userId, seats = 1) {
    const { error } = await supabase
      .from('rsvps')
      .upsert({ event_id: eventId, user_id: userId, status: 'waitlist', seats })
    if (error) throw friendly(error)
    return live.fetchEvent(eventId)
  },

  async requestJoin(eventId, userId, seats = 1) {
    const { error } = await supabase
      .from('rsvps')
      .upsert({ event_id: eventId, user_id: userId, status: 'requested', seats })
    if (error) throw friendly(error)
    return live.fetchEvent(eventId)
  },

  async approveRequest(eventId, userId) {
    const { error } = await supabase
      .from('rsvps')
      .update({ status: 'going' })
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .eq('status', 'requested')
    if (error) throw friendly(error)
    await supabase
      .from('rsvp_payments')
      .update({ status: 'held_in_escrow' })
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .eq('status', 'pending')
    return live.fetchEvent(eventId)
  },

  async declineRequest(eventId, userId) {
    const { error } = await supabase
      .from('rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .eq('status', 'requested')
    if (error) throw friendly(error)
    await supabase
      .from('rsvp_payments')
      .update({ status: 'refunded' })
      .eq('event_id', eventId)
      .eq('user_id', userId)
    return live.fetchEvent(eventId)
  },

  /** Simulated escrow — records the payment row. */
  async recordPayment(eventId, userId, amount, status) {
    const { error } = await supabase
      .from('rsvp_payments')
      .upsert({ event_id: eventId, user_id: userId, amount, status })
    if (error) throw friendly(error)
    return live.fetchEvent(eventId)
  },

  async recordAttendance(eventId, _hostId, noShowIds) {
    const { error } = await supabase.rpc('record_attendance', {
      p_event_id: eventId,
      no_show_ids: noShowIds
    })
    if (error) throw friendly(error)
    return live.fetchEvent(eventId)
  },

  async getExactLocation(eventId) {
    const { data } = await supabase
      .from('event_locations')
      .select('lat, lng')
      .eq('event_id', eventId)
      .maybeSingle()
    return data || null
  },

  /* 24h memory recaps ------------------------------------------------------ */

  async listMemories() {
    const { data, error } = await supabase
      .from('event_memories')
      .select('*')
      .order('created_at')
    if (error) {
      // Database hasn't run migration 006 yet — the map just has no recaps
      if (/event_memories/.test(error.message)) return []
      throw friendly(error)
    }
    return data.map(toMemory)
  },

  async addMemory(eventId, user, { mediaDataUrl, mediaType, caption }) {
    const { dataUrlToBlob } = await import('@/utils/image')
    const ext = mediaType === 'video' ? 'mp4' : 'jpg'
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const blob = dataUrlToBlob(mediaDataUrl)
    const { error: uploadError } = await supabase.storage
      .from('memories')
      .upload(path, blob, { contentType: blob.type })
    if (uploadError) throw new Error(uploadError.message)
    const media_url = supabase.storage.from('memories').getPublicUrl(path).data.publicUrl
    const { data, error } = await supabase
      .from('event_memories')
      .insert({
        event_id: eventId,
        user_id: user.id,
        media_url,
        media_type: mediaType,
        caption: (caption || '').trim().slice(0, 100) || null
      })
      .select()
      .single()
    if (error) throw friendly(error)
    return toMemory(data)
  },

  async reactToMemory(memoryId, emoji) {
    const { error } = await supabase.rpc('react_to_memory', {
      p_memory_id: memoryId,
      p_emoji: emoji
    })
    if (error) throw friendly(error)
    const { data } = await supabase
      .from('event_memories')
      .select('*')
      .eq('id', memoryId)
      .single()
    return data ? toMemory(data) : null
  },

  async leaveEvent(eventId, userId) {
    const { error } = await supabase
      .from('rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId)
    if (error) throw friendly(error)
    await supabase
      .from('rsvp_payments')
      .update({ status: 'refunded' })
      .eq('event_id', eventId)
      .eq('user_id', userId)
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
  },

  /* follows --------------------------------------------------------------- */

  async listFollowing(userId) {
    const { data, error } = await supabase
      .from('follows')
      .select('followee_id')
      .eq('follower_id', userId)
    if (error) throw friendly(error)
    return data.map((r) => r.followee_id)
  },

  async listFollowers(userId) {
    const { data, error } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('followee_id', userId)
    if (error) return [] // policy may hide follows from signed-out visitors
    return data.map((r) => r.follower_id)
  },

  async follow(userId, targetId) {
    const { error } = await supabase
      .from('follows')
      .upsert({ follower_id: userId, followee_id: targetId })
    if (error) throw friendly(error)
    return live.listFollowing(userId)
  },

  /* direct messages -------------------------------------------------------- */

  async openDmThread(meId, peerId) {
    const { data, error } = await supabase.rpc('open_dm_thread', { peer: peerId })
    if (error) throw friendly(error)
    return data
  },

  async listDmThreads() {
    // One round trip: the RPC returns each thread with its unread count.
    const { data, error } = await supabase.rpc('dm_inbox')
    if (error) {
      if (DM_TABLES.test(error.message)) return [] // migration 009 not run yet
      throw friendly(error)
    }
    return data.map((row) => ({
      id: row.id,
      peerId: row.peer_id,
      lastBody: row.last_body || '',
      lastAt: row.last_message_at,
      unread: row.unread || 0
    }))
  },

  async listDmMessages(threadId) {
    const { data, error } = await supabase
      .from('dm_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at')
    if (error) throw friendly(error)
    return data.map(toDm)
  },

  async sendDm(threadId, user, text) {
    const { data, error } = await supabase
      .from('dm_messages')
      .insert({ thread_id: threadId, sender_id: user.id, body: text.trim().slice(0, 2000) })
      .select()
      .single()
    if (error) throw friendly(error)
    return toDm(data)
  },

  subscribeToDmThread(threadId, callback) {
    const channel = supabase
      .channel(`dm-${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${threadId}` },
        (payload) => callback(toDm(payload.new))
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  },

  subscribeToDmInbox(meId, callback) {
    // No filter: row level security already limits delivery to threads
    // this member is in, so an unfiltered subscription leaks nothing.
    const channel = supabase
      .channel(`dm-inbox-${meId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages' },
        (payload) => callback(toDm(payload.new))
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  },

  async markDmRead(threadId, meId) {
    await supabase
      .from('dm_reads')
      .upsert({ thread_id: threadId, user_id: meId, read_at: new Date().toISOString() })
  },

  /** Only my own blocks — being blocked is deliberately not visible. */
  async listBlocked(meId) {
    const { data, error } = await supabase
      .from('dm_blocks')
      .select('blocked_id')
      .eq('blocker_id', meId)
    if (error) return []
    return data.map((r) => r.blocked_id)
  },

  async blockMember(meId, peerId) {
    const { error } = await supabase
      .from('dm_blocks')
      .upsert({ blocker_id: meId, blocked_id: peerId })
    if (error) throw friendly(error)
    return live.listBlocked(meId)
  },

  async unblockMember(meId, peerId) {
    const { error } = await supabase
      .from('dm_blocks')
      .delete()
      .eq('blocker_id', meId)
      .eq('blocked_id', peerId)
    if (error) throw friendly(error)
    return live.listBlocked(meId)
  },

  async unfollow(userId, targetId) {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', userId)
      .eq('followee_id', targetId)
    if (error) throw friendly(error)
    return live.listFollowing(userId)
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
export const requestJoin = (...a) => backend.requestJoin(...a)
export const approveRequest = (...a) => backend.approveRequest(...a)
export const declineRequest = (...a) => backend.declineRequest(...a)
export const recordPayment = (...a) => backend.recordPayment(...a)
export const recordAttendance = (...a) => backend.recordAttendance(...a)
export const getExactLocation = (...a) => backend.getExactLocation(...a)
export const listMemories = (...a) => backend.listMemories(...a)
export const addMemory = (...a) => backend.addMemory(...a)
export const reactToMemory = (...a) => backend.reactToMemory(...a)
export const leaveEvent = (...a) => backend.leaveEvent(...a)
export const subscribeToEvents = (...a) => backend.subscribeToEvents(...a)
export const listMessages = (...a) => backend.listMessages(...a)
export const sendMessage = (...a) => backend.sendMessage(...a)
export const subscribeToMessages = (...a) => backend.subscribeToMessages(...a)
export const listFollowing = (...a) => backend.listFollowing(...a)
export const listFollowers = (...a) => backend.listFollowers(...a)
export const follow = (...a) => backend.follow(...a)
export const unfollow = (...a) => backend.unfollow(...a)
export const openDmThread = (...a) => backend.openDmThread(...a)
export const listDmThreads = (...a) => backend.listDmThreads(...a)
export const listDmMessages = (...a) => backend.listDmMessages(...a)
export const sendDm = (...a) => backend.sendDm(...a)
export const subscribeToDmThread = (...a) => backend.subscribeToDmThread(...a)
export const subscribeToDmInbox = (...a) => backend.subscribeToDmInbox(...a)
export const markDmRead = (...a) => backend.markDmRead(...a)
export const listBlocked = (...a) => backend.listBlocked(...a)
export const blockMember = (...a) => backend.blockMember(...a)
export const unblockMember = (...a) => backend.unblockMember(...a)

/** Demo only — live mode manages profiles server-side. */
export const upsertDemoMember = (user) => {
  if (!isLive) demoUpsertMember(user)
}

/**
 * Demo only — the same shape migration 014 gives the live database.
 *
 * The member row survives as a tombstone so guestlists, chat logs and
 * recaps still resolve a name; upcoming events they host are cancelled
 * rather than deleted, so the people who joined them are told instead of
 * finding an evening that quietly vanished.
 */
export const demoDeleteAccount = async (memberId) => {
  if (isLive) return
  const now = Date.now()

  for (const event of db.events) {
    const ends = new Date(event.startsAt).getTime() + event.durationMinutes * 60000
    if (ends <= now) continue // past events are other people's record too
    if (event.hostId === memberId) event.cancelled = true
    // They are not coming, so give the spot back
    event.attendeeIds = event.attendeeIds.filter((id) => id !== memberId)
    event.requestedIds = (event.requestedIds || []).filter((id) => id !== memberId)
    event.waitlistIds = (event.waitlistIds || []).filter((id) => id !== memberId)
  }

  const goneThreads = new Set(
    db.dmThreads.filter((t) => t.memberA === memberId || t.memberB === memberId).map((t) => t.id)
  )
  db.dmThreads = db.dmThreads.filter((t) => !goneThreads.has(t.id))
  db.dmMessages = db.dmMessages.filter((m) => !goneThreads.has(m.threadId))

  // Demo follows live in localStorage, one key per follower — drop their
  // own list, and take them out of everybody else's
  try {
    localStorage.removeItem(`wyn:follows:${memberId}`)
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('wyn:follows:')) continue
      const ids = JSON.parse(localStorage.getItem(key)) || []
      if (!ids.includes(memberId)) continue
      localStorage.setItem(key, JSON.stringify(ids.filter((id) => id !== memberId)))
    }
  } catch {
    /* sandboxed iframe — nothing was persisted to clean up */
  }

  const member = db.members.find((m) => m.id === memberId)
  if (member) {
    member.name = 'Former member'
    member.initials = '—'
    member.avatarUrl = null
    member.bio = ''
    member.gender = null
    member.deletedAt = new Date().toISOString()
  }

  emit({ type: 'SYNC', events: await demo.listEvents() })
}
