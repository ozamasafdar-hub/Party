import { defineStore } from 'pinia'
import {
  listEvents,
  listMembers,
  createEvent,
  updateEvent,
  cancelEvent,
  joinEvent,
  joinWaitlist,
  requestJoin,
  approveRequest,
  declineRequest,
  recordPayment,
  recordAttendance,
  getExactLocation,
  listMemories as fetchMemories,
  addMemory as postMemory,
  reactToMemory as sendReaction,
  leaveEvent,
  subscribeToEvents
} from '@/services/eventService'
import {
  hasEnded,
  isLive,
  isTonight,
  isTomorrow,
  isWeekend,
  inMemoryWindow
} from '@/utils/datetime'
import { useNotifStore } from './notifStore'
import { useAuthStore } from './authStore'

export const useEventStore = defineStore('events', {
  state: () => ({
    events: [],
    members: [],
    memories: [], // 24h post-event recap photos/clips
    mapMode: 'live', // 'live' | 'memories' (📸 past-24h recaps layer)
    selectedEventId: null,
    activeCategory: null, // null = show every category
    timeWindow: 'all', // 'all' | 'now' | 'today' | 'week'
    onlyMine: false, // just events I host / attend / wait on
    userLocation: null, // { lat, lng } once the member shares it
    loading: false,
    unsubscribe: null
  }),

  getters: {
    /** Events still worth showing on the map (not finished yet). */
    visibleEvents(state) {
      const now = new Date()
      const endOfToday = new Date(now)
      endOfToday.setHours(23, 59, 59, 999)
      const weekAhead = new Date(now.getTime() + 7 * 86400000)
      const authStore = useAuthStore()
      const meId = authStore.currentUser?.id
      const myGender = authStore.currentUser?.gender
      return state.events.filter((e) => {
        if (hasEnded(e, now)) return false
        // Ladies-only events are visible to female members and the host
        // (live mode additionally enforces this server-side via RLS)
        if (e.ladiesOnly && myGender !== 'female' && e.hostId !== meId) return false
        if (state.activeCategory && e.category !== state.activeCategory) return false
        if (state.timeWindow === 'now' && !isLive(e, now)) return false
        if (state.timeWindow === 'tonight' && !isTonight(e, now)) return false
        if (state.timeWindow === 'tomorrow' && !isTomorrow(e, now)) return false
        if (state.timeWindow === 'weekend' && !isWeekend(e, now)) return false
        if (state.timeWindow === 'today' && new Date(e.startsAt) > endOfToday) return false
        if (state.timeWindow === 'week' && new Date(e.startsAt) > weekAhead) return false
        if (
          state.onlyMine &&
          !(
            e.hostId === meId ||
            e.attendeeIds.includes(meId) ||
            (e.waitlistIds || []).includes(meId)
          )
        ) {
          return false
        }
        return true
      })
    },

    selectedEvent(state) {
      return state.events.find((e) => e.id === state.selectedEventId) || null
    },

    /** Ended <24h ago with at least one recap upload — glowing memory pins. */
    memoryEvents(state) {
      const withMemories = new Set(state.memories.map((m) => m.eventId))
      return state.events.filter((e) => inMemoryWindow(e) && withMemories.has(e.id))
    },

    /** What the map should plot right now, per the layer toggle. */
    mapEvents(state) {
      return state.mapMode === 'memories' ? this.memoryEvents : this.visibleEvents
    },

    memoriesFor(state) {
      return (eventId) =>
        state.memories
          .filter((m) => m.eventId === eventId)
          .sort((a, b) => new Date(a.at) - new Date(b.at))
    },

    memberById(state) {
      const index = new Map(state.members.map((m) => [m.id, m]))
      return (id) => index.get(id) || null
    },

    spotsLeft() {
      return (event) => Math.max(0, event.maxCapacity - event.attendeeIds.length)
    },

    isFull() {
      return (event) => event.attendeeIds.length >= event.maxCapacity
    },

    isWaitlisted() {
      return (event, userId) => (event.waitlistIds || []).includes(userId)
    },

    isRequested() {
      return (event, userId) => (event.requestedIds || []).includes(userId)
    },

    paymentFor() {
      return (event, userId) => (event.payments || {})[userId] || null
    },

    waitlistPosition() {
      return (event, userId) => (event.waitlistIds || []).indexOf(userId) + 1
    },

    hostedBy(state) {
      return (userId) => state.events.filter((e) => e.hostId === userId)
    },

    attendedBy(state) {
      return (userId) =>
        state.events.filter(
          (e) => e.hostId !== userId && e.attendeeIds.includes(userId)
        )
    }
  },

  actions: {
    async load() {
      this.loading = true
      try {
        const [events, members, memories] = await Promise.all([
          listEvents(),
          listMembers(),
          fetchMemories()
        ])
        this.events = events
        this.members = members
        this.memories = memories
      } finally {
        this.loading = false
      }
      this.startRealtime()
    },

    /** Live sync: changes stream in and patch (or replace) local state. */
    startRealtime() {
      if (this.unsubscribe) return
      const notifStore = useNotifStore()
      const authStore = useAuthStore()
      const meId = () => authStore.currentUser?.id
      const nameOf = (id) => this.memberById(id)?.name || 'Someone'

      this.unsubscribe = subscribeToEvents((change) => {
        if (change.type === 'INSERT') {
          if (!this.events.some((e) => e.id === change.event.id)) {
            this.events.push(change.event)
          }
        } else if (change.type === 'UPDATE') {
          const i = this.events.findIndex((e) => e.id === change.event.id)
          if (i !== -1) {
            notifStore.diffEvent(this.events[i], change.event, meId(), nameOf)
            this.events.splice(i, 1, change.event)
          }
        } else if (change.type === 'SYNC') {
          notifStore.diffSnapshot(this.events, change.events, meId(), nameOf)
          this.events = change.events
        }
      })
    },

    stopRealtime() {
      if (this.unsubscribe) {
        this.unsubscribe()
        this.unsubscribe = null
      }
    },

    select(eventId) {
      this.selectedEventId = eventId
    },

    clearSelection() {
      this.selectedEventId = null
    },

    setCategory(category) {
      this.activeCategory = this.activeCategory === category ? null : category
    },

    setTimeWindow(window) {
      this.timeWindow = window
    },

    setMapMode(mode) {
      this.mapMode = mode
      this.selectedEventId = null
    },

    /** Post a photo/clip to an ended event's 24h recap. */
    async addMemory(eventId, user, media) {
      const memory = await postMemory(eventId, user, media)
      this.memories.push(memory)
      useNotifStore().flash('📸 Added to the recap — visible for 24 hours')
      return memory
    },

    async reactToMemory(memoryId, emoji) {
      const updated = await sendReaction(memoryId, emoji)
      if (!updated) return
      const i = this.memories.findIndex((m) => m.id === memoryId)
      if (i !== -1) this.memories.splice(i, 1, updated)
    },

    setOnlyMine(on) {
      this.onlyMine = on
    },

    setUserLocation(location) {
      this.userLocation = location
    },

    async create(data, host) {
      const event = await createEvent(data, host)
      // Realtime echo already appended it; guard against double-insert.
      if (!this.events.some((e) => e.id === event.id)) {
        this.events.push(event)
      }
      this.selectedEventId = event.id
      return event
    },

    async update(eventId, data) {
      const event = await updateEvent(eventId, data)
      const i = this.events.findIndex((e) => e.id === event.id)
      if (i !== -1) this.events.splice(i, 1, event)
      return event
    },

    async cancel(eventId) {
      await cancelEvent(eventId)
      this.events = this.events.filter((e) => e.id !== eventId)
      if (this.selectedEventId === eventId) this.selectedEventId = null
    },

    /** RSVP — service rejects when full, which auto-closes the guestlist. */
    async rsvp(eventId, userId) {
      const event = await joinEvent(eventId, userId)
      const i = this.events.findIndex((e) => e.id === event.id)
      if (i !== -1) this.events.splice(i, 1, event)
      const notifStore = useNotifStore()
      notifStore.flash(`🎉 You're in — see you at "${event.title}"!`)
      notifStore.push(`You joined "${event.title}"`, event.id)
      return event
    },

    async joinWaitlist(eventId, userId) {
      const event = await joinWaitlist(eventId, userId)
      const i = this.events.findIndex((e) => e.id === event.id)
      if (i !== -1) this.events.splice(i, 1, event)
      const pos = (event.waitlistIds || []).indexOf(userId) + 1
      const notifStore = useNotifStore()
      notifStore.flash(`⏳ You're #${pos} on the waitlist for "${event.title}"`)
      notifStore.push(`You joined the waitlist for "${event.title}" (#${pos})`, event.id)
      return event
    },

    /** Request / join / waitlist — whichever the event calls for. */
    async smartJoin(eventId, userId) {
      const event = this.events.find((e) => e.id === eventId)
      if (event?.approvalMode) return this.requestJoin(eventId, userId)
      if (event && event.attendeeIds.length >= event.maxCapacity) {
        return this.joinWaitlist(eventId, userId)
      }
      return this.rsvp(eventId, userId)
    },

    async requestJoin(eventId, userId) {
      const event = await requestJoin(eventId, userId)
      this._patch(event)
      const notifStore = useNotifStore()
      notifStore.flash(`📨 Request sent for "${event.title}" — the host will review it`)
      notifStore.push(`You requested to join "${event.title}"`, event.id)
      return event
    },

    async approve(eventId, userId) {
      const event = await approveRequest(eventId, userId)
      this._patch(event)
      useNotifStore().flash(`✅ ${this.memberById(userId)?.name || 'Guest'} approved`)
      return event
    },

    async decline(eventId, userId) {
      const event = await declineRequest(eventId, userId)
      this._patch(event)
      return event
    },

    /**
     * Simulated payment then join/request. Escrow status: instant-join
     * events hold the payment; approval events keep it pending until the
     * host approves.
     */
    async payAndJoin(eventId, userId, amount) {
      const event = this.events.find((e) => e.id === eventId)
      const status = event?.approvalMode ? 'pending' : 'held_in_escrow'
      await recordPayment(eventId, userId, amount, status)
      return this.smartJoin(eventId, userId)
    },

    async markAttendance(eventId, hostId, noShowIds) {
      const event = await recordAttendance(eventId, hostId, noShowIds)
      this._patch(event)
      useNotifStore().flash('Attendance recorded — reliability scores updated')
      // Refresh member reliability numbers
      this.members = await listMembers()
      return event
    },

    async fetchExactLocation(eventId) {
      return getExactLocation(eventId)
    },

    _patch(event) {
      const i = this.events.findIndex((e) => e.id === event.id)
      if (i !== -1) this.events.splice(i, 1, event)
    },

    async cancelRsvp(eventId, userId) {
      const event = await leaveEvent(eventId, userId)
      const i = this.events.findIndex((e) => e.id === event.id)
      if (i !== -1) this.events.splice(i, 1, event)
      useNotifStore().flash(`You've left "${event.title}"`)
      return event
    }
  }
})
