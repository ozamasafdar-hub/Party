import { defineStore } from 'pinia'

const SESSION_KEY = 'majlis-map:session'

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
        const raw = localStorage.getItem(SESSION_KEY)
        if (raw) this.currentUser = JSON.parse(raw)
      } catch {
        localStorage.removeItem(SESSION_KEY)
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
      localStorage.setItem(SESSION_KEY, JSON.stringify(this.currentUser))
      return this.currentUser
    },

    logout() {
      this.currentUser = null
      localStorage.removeItem(SESSION_KEY)
    }
  }
})
