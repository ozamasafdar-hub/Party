import { defineStore } from 'pinia'
import {
  blockMember,
  listBlocked,
  listDmMessages,
  listDmThreads,
  markDmRead,
  openDmThread,
  sendDm,
  subscribeToDmInbox,
  subscribeToDmThread,
  unblockMember
} from '@/services/eventService'

/**
 * Direct messages. Modelled on chatStore: one open thread at a time, the
 * teardown closure held in state. Two subscriptions run:
 *
 *   - the inbox watch, alive for the whole signed-in session, which keeps
 *     unread counts and previews current wherever you are in the app
 *   - the thread watch, alive only while a conversation is open
 *
 * Unlike chatStore, the thread subscription is attached BEFORE the history
 * is fetched, so a message that lands mid-fetch isn't dropped.
 */
export const useDmStore = defineStore('dm', {
  state: () => ({
    threads: [],
    blockedIds: [],
    openThreadId: null,
    peerId: null,
    messages: [],
    loading: false,
    watchingFor: null,
    unsubThread: null,
    unsubInbox: null
  }),

  getters: {
    unreadTotal: (state) => state.threads.reduce((sum, t) => sum + (t.unread || 0), 0),
    isBlocked: (state) => (memberId) => state.blockedIds.includes(memberId),
    /** The conversation currently on screen, for its preview/unread state. */
    openThread: (state) => state.threads.find((t) => t.id === state.openThreadId) || null
  },

  actions: {
    async loadInbox(meId) {
      if (!meId) return
      const [threads, blocked] = await Promise.all([listDmThreads(meId), listBlocked(meId)])
      this.threads = threads
      this.blockedIds = blocked
    },

    /**
     * Keeps the inbox live for the whole session. `onMessage` lets the app
     * raise a notification for messages that arrive while you're elsewhere.
     */
    watchInbox(meId, onMessage) {
      if (!meId || this.watchingFor === meId) return
      this.stopInbox()
      this.watchingFor = meId
      this.unsubInbox = subscribeToDmInbox(meId, async (message) => {
        await this.loadInbox(meId)
        if (message.senderId !== meId && message.threadId !== this.openThreadId) {
          onMessage?.(message)
        }
      })
    },

    stopInbox() {
      if (this.unsubInbox) {
        this.unsubInbox()
        this.unsubInbox = null
      }
      this.watchingFor = null
    },

    /** Opens (creating if needed) the conversation with another member. */
    async openWith(meId, peerId) {
      const threadId = await openDmThread(meId, peerId)
      await this.open(threadId, meId, peerId)
      return threadId
    },

    async open(threadId, meId, peerId = null) {
      this.close()
      this.openThreadId = threadId
      this.peerId = peerId || this.threads.find((t) => t.id === threadId)?.peerId || null
      this.loading = true
      // Subscribe first so nothing that arrives during the fetch is lost
      this.unsubThread = subscribeToDmThread(threadId, (message) => {
        this.appendMessage(message)
        if (meId) markDmRead(threadId, meId)
      })
      try {
        this.messages = await listDmMessages(threadId)
      } finally {
        this.loading = false
      }
      if (meId) await this.markRead(meId)
    },

    close() {
      if (this.unsubThread) {
        this.unsubThread()
        this.unsubThread = null
      }
      this.openThreadId = null
      this.peerId = null
      this.messages = []
    },

    appendMessage(message) {
      if (!this.messages.some((m) => m.id === message.id)) this.messages.push(message)
    },

    async send(user, text) {
      const trimmed = text.trim()
      if (!trimmed || !this.openThreadId) return
      const message = await sendDm(this.openThreadId, user, trimmed)
      this.appendMessage(message)
      await this.loadInbox(user.id)
    },

    async markRead(meId) {
      if (!this.openThreadId || !meId) return
      await markDmRead(this.openThreadId, meId)
      const thread = this.threads.find((t) => t.id === this.openThreadId)
      if (thread) thread.unread = 0
    },

    async setBlocked(meId, peerId, blocked) {
      this.blockedIds = blocked
        ? await blockMember(meId, peerId)
        : await unblockMember(meId, peerId)
    },

    reset() {
      this.close()
      this.stopInbox()
      this.threads = []
      this.blockedIds = []
    }
  }
})
