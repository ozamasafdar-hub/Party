import { defineStore } from 'pinia'
import {
  listEvents,
  listMembers,
  createEvent,
  updateEvent,
  cancelEvent,
  joinEvent,
  joinWaitlist,
  leaveEvent,
  subscribeToEvents
} from '@/services/eventService'
import { hasEnded, isLive } from '@/utils/datetime'
import { useNotifStore } from './notifStore'
import { useAuthStore } from './authStore'

export const useEventStore = defineStore('events', {
  state: () => ({
    events: [],
    members: [],
    selectedEventId: null,
    activeCategory: null, // null = show every category
    timeWindow: 'all', // 'all' | 'now' | 'today' | 'week'
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
      return state.events.filter((e) => {
        if (hasEnded(e, now)) return false
        if (state.activeCategory && e.category !== state.activeCategory) return false
        if (state.timeWindow === 'now' && !isLive(e, now)) return false
        if (state.timeWindow === 'today' && new Date(e.startsAt) > endOfToday) return false
        if (state.timeWindow === 'week' && new Date(e.startsAt) > weekAhead) return false
        return true
      })
    },

    selectedEvent(state) {
      return state.events.find((e) => e.id === state.selectedEventId) || null
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
        const [events, members] = await Promise.all([listEvents(), listMembers()])
        this.events = events
        this.members = members
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

    /** Join if there's room, otherwise queue on the waitlist. */
    async smartJoin(eventId, userId) {
      const event = this.events.find((e) => e.id === eventId)
      if (event && event.attendeeIds.length >= event.maxCapacity) {
        return this.joinWaitlist(eventId, userId)
      }
      return this.rsvp(eventId, userId)
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
