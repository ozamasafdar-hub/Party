import { defineStore } from 'pinia'
import { supabase, isLive } from '@/services/supabaseClient'
import { toMember, upsertDemoMember } from '@/services/eventService'

const SESSION_KEY = 'wyn:session'
const ACCOUNTS_KEY = 'wyn:accounts'

/**
 * How long a guarded page waits for the backend before giving up and
 * rendering signed-out. Long enough that a slow phone connection still
 * finishes; short enough that a dead backend is a pause, not a hang.
 */
const RESTORE_TIMEOUT_MS = 8000

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

function makeDemoUser(name, gender = null) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0].toUpperCase())
    .slice(0, 2)
    .join('')
  return {
    id: `u-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
    name,
    initials,
    avatarColor: AVATAR_COLORS[name.length % AVATAR_COLORS.length],
    gender,
    reliability: 100,
    attended: 0,
    flaked: 0,
    subscriptionTier: 'free',
    subscriptionStatus: 'none'
  }
}

function validate({ name, email, password, gender }, { requireName, requireGender }) {
  if (requireName && (!name || name.trim().length < 2)) {
    throw new Error('Please enter your name.')
  }
  // Asked at the door because ladies-only events are gated on it, and it
  // cannot be changed afterwards — see migration 013
  if (requireGender && !['female', 'male'].includes(gender)) {
    throw new Error('Please choose whether you are a woman or a man.')
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
    restorePromise: null,
    /**
     * Set once, at boot, when we arrived from a confirmation email —
     * `{ ok, message }`. Without it a member who clicks the link in their
     * inbox lands on the map with nothing at all to say whether it worked.
     */
    callbackNotice: null
  }),

  getters: {
    isAuthenticated: (state) => !!state.currentUser
  },

  actions: {
    /** Handed the result of consumeAuthCallback() by main.js. */
    noteCallback(result) {
      this.callbackNotice = result
      // A success explains itself and can go on its own. A failure is the
      // member's only clue about what to do next, so it waits to be read.
      if (result?.ok) setTimeout(() => this.dismissCallback(), 6000)
    },

    dismissCallback() {
      this.callbackNotice = null
    },

    /** Idempotent; async in live mode. The router guard awaits this. */
    restoreSession() {
      this.restorePromise ??= isLive ? this._restoreLive() : this._restoreDemo()
      return this.restorePromise
    },

    /**
     * Bounded, and it never rejects. Both parts are load-bearing.
     *
     * A profile query against an unreachable backend does not fail — it
     * never settles at all. Measured: with the connection refused,
     * `from('profiles').select()` was still pending after five seconds and
     * showed no sign of stopping. Anything awaiting it waits forever, and a
     * rejection would be no better, since a throw inside the router guard
     * aborts the first navigation and paints nothing either. Either way the
     * member gets a white screen with no map and no error — and a paused
     * free-tier project looks exactly like this from the outside.
     *
     * So: give up after a while and render signed-out over the public map.
     * Nothing is lost. The session stays in storage, and if the query does
     * come back late it still fills the profile in behind the scenes.
     */
    async _restoreLive() {
      const load = (async () => {
        const { data } = await supabase.auth.getSession()
        if (data.session) await this._loadProfile(data.session.user.id)
      })().catch(() => {
        this.currentUser = null
      })

      await Promise.race([
        load,
        new Promise((resolve) => setTimeout(resolve, RESTORE_TIMEOUT_MS))
      ])

      supabase.auth.onAuthStateChange((_evt, session) => {
        if (!session) this.currentUser = null
      })
    },

    _restoreDemo() {
      try {
        const raw = storage.get(SESSION_KEY)
        if (raw) this.currentUser = JSON.parse(raw)
        if (this.currentUser) upsertDemoMember(this.currentUser)
      } catch {
        storage.remove(SESSION_KEY)
      }
    },

    async _loadProfile(userId) {
      const BASE =
        'id, full_name, avatar_url, bio, gender, reliability_score, events_attended, events_flaked, is_approved'
      let { data, error } = await supabase
        .from('profiles')
        .select(`${BASE}, subscription_tier, subscription_status`)
        .eq('id', userId)
        .maybeSingle()
      if (error && /subscription/.test(error.message)) {
        // Database hasn't run migration 005 yet — treat everyone as free
        ;({ data } = await supabase.from('profiles').select(BASE).eq('id', userId).maybeSingle())
      }
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
      upsertDemoMember(account.user)
      return this.currentUser
    },

    /**
     * Create an account with name, email + password.
     * Live mode may return { needsEmailConfirmation: true } when the
     * Supabase project requires confirming the address first.
     */
    async signUp({ name, email, password, gender }) {
      validate({ name, email, password, gender }, { requireName: true, requireGender: true })
      const trimmedName = name.trim()
      const em = email.trim().toLowerCase()

      if (isLive) {
        const { data, error } = await supabase.auth.signUp({
          email: em,
          password,
          // handle_new_user() copies both into the profile row (migration 013)
          options: { data: { full_name: trimmedName, gender } }
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
      const user = makeDemoUser(trimmedName, gender)
      accounts[em] = { password, user }
      storage.set(ACCOUNTS_KEY, JSON.stringify(accounts))
      this.currentUser = user
      storage.set(SESSION_KEY, JSON.stringify(user))
      upsertDemoMember(user)
      return this.currentUser
    },

    /**
     * Update name, bio and/or profile photo. `avatarDataUrl` is a resized
     * JPEG data URL from the edit form. Live mode uploads it to Supabase
     * Storage; demo mode keeps everything in this browser.
     */
    async updateProfile({ name, bio, gender, avatarDataUrl }) {
      const trimmed = (name || '').trim()
      if (trimmed.length < 2) throw new Error('Please enter your name.')
      const cleanBio = (bio || '').trim().slice(0, 160)
      /**
       * Gender is set once (migration 013). Once it holds a value the
       * client stops sending it at all: the database would refuse a changed
       * value, and because that refusal aborts the whole statement it would
       * take an innocent name or bio edit down with it.
       */
      const genderLocked = !!this.currentUser.gender
      const cleanGender = genderLocked
        ? this.currentUser.gender
        : ['female', 'male'].includes(gender)
          ? gender
          : null

      if (isLive) {
        let avatar_url
        if (avatarDataUrl) {
          const { dataUrlToBlob } = await import('@/utils/image')
          const path = `${this.currentUser.id}/avatar.jpg`
          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(path, dataUrlToBlob(avatarDataUrl), {
              upsert: true,
              contentType: 'image/jpeg'
            })
          if (uploadError) throw new Error(uploadError.message)
          const { data } = supabase.storage.from('avatars').getPublicUrl(path)
          avatar_url = `${data.publicUrl}?v=${Date.now()}` // bust stale caches
        }
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: trimmed,
            bio: cleanBio || null,
            ...(genderLocked ? {} : { gender: cleanGender }),
            ...(avatar_url ? { avatar_url } : {})
          })
          .eq('id', this.currentUser.id)
        if (error) {
          throw new Error(
            /GENDER_LOCKED/.test(error.message)
              ? 'Your gender was set when you joined and cannot be changed here. Contact support if it is wrong.'
              : error.message
          )
        }
        await this._loadProfile(this.currentUser.id)
        return this.currentUser
      }

      const initials = trimmed
        .split(/\s+/)
        .map((part) => part[0].toUpperCase())
        .slice(0, 2)
        .join('')
      const user = {
        ...this.currentUser,
        name: trimmed,
        initials,
        bio: cleanBio,
        gender: cleanGender,
        avatarUrl: avatarDataUrl ?? this.currentUser.avatarUrl ?? null
      }
      this.currentUser = user
      storage.set(SESSION_KEY, JSON.stringify(user))
      upsertDemoMember(user)
      const accounts = readAccounts()
      for (const email of Object.keys(accounts)) {
        if (accounts[email].user?.id === user.id) accounts[email].user = user
      }
      storage.set(ACCOUNTS_KEY, JSON.stringify(accounts))
      return user
    },

    /**
     * Leave WYN.
     *
     * Erases the person and keeps the record — see migration 014. The
     * database does the careful part: upcoming events they host are
     * cancelled rather than deleted, so their guests are told instead of
     * turning up to nothing.
     */
    async deleteAccount() {
      if (!this.currentUser) throw new Error('There is no account to delete.')
      const id = this.currentUser.id

      if (isLive) {
        const { error } = await supabase.rpc('delete_my_account')
        if (error) {
          throw new Error(
            /delete_my_account/.test(error.message)
              ? 'Deleting an account needs a database update — run docs/migration-014-leaving-wyn.sql first.'
              : error.message
          )
        }
        await supabase.auth.signOut()
        this.currentUser = null
        return
      }

      // Demo mirrors the same shape: the member row survives as a
      // tombstone so guestlists and chat logs still resolve a name.
      const { demoDeleteAccount } = await import('@/services/eventService')
      await demoDeleteAccount(id)

      const accounts = readAccounts()
      for (const email of Object.keys(accounts)) {
        if (accounts[email].user?.id === id) delete accounts[email]
      }
      storage.set(ACCOUNTS_KEY, JSON.stringify(accounts))
      storage.remove(SESSION_KEY)
      this.currentUser = null
    },

    /**
     * The one-time answer, for members who joined before sign-up asked.
     * Separate from updateProfile so the prompt does not have to resend a
     * name, bio and avatar it never showed the member.
     */
    async setGenderOnce(gender) {
      if (!['female', 'male'].includes(gender)) {
        throw new Error('Please choose whether you are a woman or a man.')
      }
      if (this.currentUser?.gender) {
        throw new Error('Your gender was set when you joined and cannot be changed here.')
      }

      if (isLive) {
        const { error } = await supabase
          .from('profiles')
          .update({ gender })
          .eq('id', this.currentUser.id)
        if (error) throw new Error(error.message)
        await this._loadProfile(this.currentUser.id)
        return this.currentUser
      }

      const user = { ...this.currentUser, gender }
      this.currentUser = user
      storage.set(SESSION_KEY, JSON.stringify(user))
      upsertDemoMember(user)
      const accounts = readAccounts()
      for (const email of Object.keys(accounts)) {
        if (accounts[email].user?.id === user.id) accounts[email].user = user
      }
      storage.set(ACCOUNTS_KEY, JSON.stringify(accounts))
      return user
    },

    /**
     * SIMULATED subscription switch ('free' | 'host_pro') — flips the tier
     * immediately with no real billing. Swap for a payment provider later.
     */
    async setSubscription(tier) {
      if (!this.currentUser) throw new Error('Sign in first.')
      if (!['free', 'host_pro'].includes(tier)) throw new Error('Unknown plan.')

      if (isLive) {
        const { error } = await supabase.rpc('set_subscription', { p_tier: tier })
        if (error) {
          throw new Error(
            /set_subscription/.test(error.message)
              ? 'Host Pro needs a database update — run docs/migration-005-host-pro.sql first.'
              : error.message
          )
        }
        await this._loadProfile(this.currentUser.id)
        return this.currentUser
      }

      const user = {
        ...this.currentUser,
        subscriptionTier: tier,
        subscriptionStatus: tier === 'host_pro' ? 'active' : 'none'
      }
      this.currentUser = user
      storage.set(SESSION_KEY, JSON.stringify(user))
      upsertDemoMember(user)
      const accounts = readAccounts()
      for (const email of Object.keys(accounts)) {
        if (accounts[email].user?.id === user.id) accounts[email].user = user
      }
      storage.set(ACCOUNTS_KEY, JSON.stringify(accounts))
      return user
    },

    async logout() {
      if (isLive) await supabase.auth.signOut()
      this.currentUser = null
      storage.remove(SESSION_KEY)
      const { useFollowStore } = await import('./followStore')
      useFollowStore().reset()
    }
  }
})
