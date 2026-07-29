import { defineStore } from 'pinia'
import { listMessages, sendMessage, subscribeToMessages } from '@/services/eventService'

/**
 * Per-event chat. `open(eventId)` loads the thread and subscribes to new
 * messages; `close()` tears down. Only one thread is active at a time
 * (the currently open event card).
 */
export const useChatStore = defineStore('chat', {
  state: () => ({
    eventId: null,
    messages: [],
    loading: false,
    unsubscribe: null
  }),

  actions: {
    async open(eventId) {
      this.close()
      this.eventId = eventId
      this.loading = true
      try {
        this.messages = await listMessages(eventId)
      } finally {
        this.loading = false
      }
      this.unsubscribe = subscribeToMessages(eventId, (message) => {
        if (!this.messages.some((m) => m.id === message.id)) {
          this.messages.push(message)
        }
      })
    },

    close() {
      if (this.unsubscribe) {
        this.unsubscribe()
        this.unsubscribe = null
      }
      this.eventId = null
      this.messages = []
    },

    async send(user, text) {
      const trimmed = text.trim()
      if (!trimmed || !this.eventId) return
      const message = await sendMessage(this.eventId, user, trimmed)
      if (!this.messages.some((m) => m.id === message.id)) {
        this.messages.push(message)
      }
    }
  }
})
