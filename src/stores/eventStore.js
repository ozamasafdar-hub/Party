import { defineStore } from 'pinia'
import {
  listEvents,
  listMembers,
  createEvent,
  joinEvent,
  leaveEvent,
  subscribeToEvents
} from '@/services/eventService'
import { hasEnded } from '@/utils/datetime'

export const useEventStore = defineStore('events', {
  state: () => ({
    events: [],
    members: [],
    selectedEventId: null,
    activeCategory: null, // null = show every category
    loading: false,
    unsubscribe: null
  }),

  getters: {
    /** Events still worth showing on the map (not finished yet). */
    visibleEvents(state) {
      const now = new Date()
      return state.events.filter((e) => {
        if (hasEnded(e, now)) return false
        if (state.activeCategory && e.category !== state.activeCategory) return false
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

    /** Live sync: INSERT/UPDATE changes stream in and patch local state. */
    startRealtime() {
      if (this.unsubscribe) return
      this.unsubscribe = subscribeToEvents((change) => {
        if (change.type === 'INSERT') {
          this.events.push(change.event)
        } else if (change.type === 'UPDATE') {
          const i = this.events.findIndex((e) => e.id === change.event.id)
          if (i !== -1) this.events.splice(i, 1, change.event)
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

    async create(data, host) {
      const event = await createEvent(data, host)
      // Realtime echo already appended it; guard against double-insert.
      if (!this.events.some((e) => e.id === event.id)) {
        this.events.push(event)
      }
      this.selectedEventId = event.id
      return event
    },

    /** RSVP — service rejects when full, which auto-closes the guestlist. */
    async rsvp(eventId, userId) {
      const event = await joinEvent(eventId, userId)
      const i = this.events.findIndex((e) => e.id === event.id)
      if (i !== -1) this.events.splice(i, 1, event)
      return event
    },

    async cancelRsvp(eventId, userId) {
      const event = await leaveEvent(eventId, userId)
      const i = this.events.findIndex((e) => e.id === event.id)
      if (i !== -1) this.events.splice(i, 1, event)
      return event
    }
  }
})
