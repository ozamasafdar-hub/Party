import { defineStore } from 'pinia'
import { supabase, isLive } from '@/services/supabaseClient'
import { toMember } from '@/services/eventService'

const SESSION_KEY = 'majlis-map:session'

/**
 * Members-only access, two modes:
 *
 *  - LIVE (Supabase configured): email + one-time code sign-in. First-time
 *    members must redeem an invite code (validated server-side by the
 *    redeem_invite() function), which approves their profile. Every later
 *    sign-in only needs the email code.
 *  - DEMO: name + invite code, session in localStorage.
 */
const DEMO_INVITE_CODES = ['PEARL2026', 'MAJLIS-VIP', 'DOHA-CREW']

const AVATAR_COLORS = ['#c62d55', '#38bdf8', '#2dd4a0', '#a78bfa', '#fbbf6e', '#fb7185']

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

export const useAuthStore = defineStore('auth', {
  state: () => ({
    currentUser: null,
    isLiveMode: isLive,
    restorePromise: null
  }),

  getters: {
    isAuthenticated: (state) => !!state.currentUser
  },

  actions: {
    /** Idempotent; async in live mode. The router guard awaits this. */
    restoreSession() {
      this.restorePromise ??= isLive ? this._restoreLive() : this._restoreDemo()
      return this.restorePromise
    },

    async _restoreLive() {
      const { data } = await supabase.auth.getSession()
      if (data.session) await this._loadProfile(data.session.user.id)
      supabase.auth.onAuthStateChange((_evt, session) => {
        if (!session) this.currentUser = null
      })
    },

    _restoreDemo() {
      try {
        const raw = storage.get(SESSION_KEY)
        if (raw) this.currentUser = JSON.parse(raw)
      } catch {
        storage.remove(SESSION_KEY)
      }
    },

    async _loadProfile(userId) {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, is_approved')
        .eq('id', userId)
        .maybeSingle()
      if (data?.is_approved) this.currentUser = toMember(data)
      return data
    },

    /* ---- live mode: email + one-time code -------------------------------- */

    async requestCode(email) {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true }
      })
      if (error) throw new Error(error.message)
    },

    async verifyCode({ email, code, name, inviteCode }) {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: 'email'
      })
      if (error) throw new Error('That code didn\'t work — check it and try again.')

      const profile = await this._loadProfile(data.user.id)
      if (this.currentUser) return this.currentUser

      // New or unapproved member — redeem an invite (server-validated)
      if (!inviteCode?.trim()) {
        throw new Error('You need an invite code to join. Ask a member for one.')
      }
      const { error: redeemError } = await supabase.rpc('redeem_invite', {
        invite_code: inviteCode.trim().toUpperCase(),
        member_name: (name || profile?.full_name || '').trim() || 'Member'
      })
      if (redeemError) {
        throw new Error(
          /INVALID_INVITE/.test(redeemError.message)
            ? 'Invalid or already-used invite code. This community is invite-only.'
            : redeemError.message
        )
      }
      await this._loadProfile(data.user.id)
      if (!this.currentUser) throw new Error('Your account is awaiting approval.')
      return this.currentUser
    },

    /* ---- demo mode ------------------------------------------------------- */

    login({ name, inviteCode }) {
      const code = inviteCode.trim().toUpperCase()
      if (!DEMO_INVITE_CODES.includes(code)) {
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

    /* ---------------------------------------------------------------------- */

    async logout() {
      if (isLive) await supabase.auth.signOut()
      this.currentUser = null
      storage.remove(SESSION_KEY)
    }
  }
})
