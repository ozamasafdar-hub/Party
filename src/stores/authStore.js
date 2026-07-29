import { defineStore } from 'pinia'
import { supabase, isLive } from '@/services/supabaseClient'
import { toMember } from '@/services/eventService'

const SESSION_KEY = 'wyn:session'
const ACCOUNTS_KEY = 'wyn:accounts'

/**
 * Email + password accounts, two modes:
 *
 *  - LIVE (Supabase configured): real Supabase Auth. Profiles are created
 *    by a database trigger on sign-up. If the project requires email
 *    confirmation, sign-up reports that instead of a session.
 *  - DEMO: accounts stored in this browser's localStorage so the full
 *    log-in / sign-up flow works with zero backend setup.
 */

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

function readAccounts() {
  try {
    return JSON.parse(storage.get(ACCOUNTS_KEY)) || {}
  } catch {
    return {}
  }
}

function makeDemoUser(name) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0].toUpperCase())
    .slice(0, 2)
    .join('')
  return {
    id: `u-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
    name,
    initials,
    avatarColor: AVATAR_COLORS[name.length % AVATAR_COLORS.length]
  }
}

function validate({ name, email, password }, { requireName }) {
  if (requireName && (!name || name.trim().length < 2)) {
    throw new Error('Please enter your name.')
  }
  if (!/.+@.+\..+/.test((email || '').trim())) {
    throw new Error('Enter a valid email address.')
  }
  if ((password || '').length < 6) {
    throw new Error('Your password needs at least 6 characters.')
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

    /** Log in with email + password. */
    async signIn({ email, password }) {
      const em = (email || '').trim().toLowerCase()

      if (isLive) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: em,
          password
        })
        if (error) {
          throw new Error(
            /invalid login credentials/i.test(error.message)
              ? 'Wrong email or password.'
              : error.message
          )
        }
        await this._loadProfile(data.user.id)
        if (!this.currentUser) throw new Error('Your account is awaiting approval.')
        return this.currentUser
      }

      const account = readAccounts()[em]
      if (!account || account.password !== password) {
        throw new Error('Wrong email or password.')
      }
      this.currentUser = account.user
      storage.set(SESSION_KEY, JSON.stringify(account.user))
      return this.currentUser
    },

    /**
     * Create an account with name, email + password.
     * Live mode may return { needsEmailConfirmation: true } when the
     * Supabase project requires confirming the address first.
     */
    async signUp({ name, email, password }) {
      validate({ name, email, password }, { requireName: true })
      const trimmedName = name.trim()
      const em = email.trim().toLowerCase()

      if (isLive) {
        const { data, error } = await supabase.auth.signUp({
          email: em,
          password,
          options: { data: { full_name: trimmedName } }
        })
        if (error) {
          throw new Error(
            /already registered/i.test(error.message)
              ? 'An account with this email already exists — log in instead.'
              : error.message
          )
        }
        if (!data.session) return { needsEmailConfirmation: true }
        await this._loadProfile(data.user.id)
        return this.currentUser
      }

      const accounts = readAccounts()
      if (accounts[em]) {
        throw new Error('An account with this email already exists — log in instead.')
      }
      const user = makeDemoUser(trimmedName)
      accounts[em] = { password, user }
      storage.set(ACCOUNTS_KEY, JSON.stringify(accounts))
      this.currentUser = user
      storage.set(SESSION_KEY, JSON.stringify(user))
      return this.currentUser
    },

    async logout() {
      if (isLive) await supabase.auth.signOut()
      this.currentUser = null
      storage.remove(SESSION_KEY)
    }
  }
})
