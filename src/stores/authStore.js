import { defineStore } from 'pinia'

const SESSION_KEY = 'majlis-map:session'

// localStorage throws in some sandboxed iframes (e.g. hosted previews);
// fall back to in-memory so login still works, just without persistence.
const storage = {
  get(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return storage._mem?.[key] ?? null
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch {
      ;(storage._mem ??= {})[key] = value
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key)
    } catch {
      if (storage._mem) delete storage._mem[key]
    }
  }
}

/**
 * Members-only access. Demo mode gates entry behind an invite code and
 * stores the session locally; in production this becomes Supabase Auth
 * with an `invites` table + admin approval flag (profiles.is_approved).
 */
const VALID_INVITE_CODES = ['PEARL2026', 'MAJLIS-VIP', 'DOHA-CREW']

const AVATAR_COLORS = ['#c62d55', '#38bdf8', '#2dd4a0', '#a78bfa', '#fbbf6e', '#fb7185']

export const useAuthStore = defineStore('auth', {
  state: () => ({
    currentUser: null,
    restored: false
  }),

  getters: {
    isAuthenticated: (state) => !!state.currentUser
  },

  actions: {
    restoreSession() {
      if (this.restored) return
      this.restored = true
      try {
        const raw = storage.get(SESSION_KEY)
        if (raw) this.currentUser = JSON.parse(raw)
      } catch {
        storage.remove(SESSION_KEY)
      }
    },

    login({ name, inviteCode }) {
      const code = inviteCode.trim().toUpperCase()
      if (!VALID_INVITE_CODES.includes(code)) {
        throw new Error('Invalid invite code. This community is invite-only.')
      }
      const trimmed = name.trim()
      if (trimmed.length < 2) {
        throw new Error('Please enter your name.')
      }
      const initials = trimmed
        .split(/\s+/)
        .map((part) => part[0].toUpperCase())
        .slice(0, 2)
        .join('')

      this.currentUser = {
        id: `u-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: trimmed,
        initials,
        avatarColor: AVATAR_COLORS[trimmed.length % AVATAR_COLORS.length]
      }
      storage.set(SESSION_KEY, JSON.stringify(this.currentUser))
      return this.currentUser
    },

    logout() {
      this.currentUser = null
      storage.remove(SESSION_KEY)
    }
  }
})
