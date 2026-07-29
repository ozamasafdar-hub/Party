<script setup>
/**
 * LoginView — gated, members-only entry, two modes:
 *
 *  - LIVE (Supabase configured): email → 6-digit code sent to the inbox →
 *    verify. First-time members also give their name + an invite code,
 *    redeemed server-side.
 *  - DEMO: name + invite code, local session only.
 */
import { reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const form = reactive({ name: '', inviteCode: '', email: '', code: '' })
const error = ref('')
const busy = ref(false)
const step = ref('details') // live mode: 'details' → 'code'

function enter() {
  router.push(route.query.redirect || { name: 'map' })
}

function submitDemo() {
  error.value = ''
  try {
    authStore.login(form)
    enter()
  } catch (e) {
    error.value = e.message
  }
}

async function submitEmail() {
  error.value = ''
  if (!/.+@.+\..+/.test(form.email.trim())) {
    error.value = 'Enter a valid email address.'
    return
  }
  busy.value = true
  try {
    await authStore.requestCode(form.email)
    step.value = 'code'
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function submitCode() {
  error.value = ''
  busy.value = true
  try {
    await authStore.verifyCode(form)
    enter()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="login__backdrop" aria-hidden="true" />
    <div class="login__card glass-panel">
      <div class="login__logo">🗺️</div>
      <h1 class="login__title">WYN</h1>
      <p class="login__subtitle">
        Qatar's members-only social map.<br />
        See what's happening. Join in. Host your own.
      </p>

      <!-- LIVE: email + one-time code -->
      <form v-if="authStore.isLiveMode" @submit.prevent="step === 'details' ? submitEmail() : submitCode()">
        <template v-if="step === 'details'">
          <label class="field-label" for="login-email">Email</label>
          <input
            id="login-email"
            v-model="form.email"
            class="field-input"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
          />

          <label class="field-label" for="login-name">Your name <span class="login__optional">(new members)</span></label>
          <input
            id="login-name"
            v-model="form.name"
            class="field-input"
            type="text"
            autocomplete="name"
            placeholder="e.g. Noora Al-Thani"
          />

          <label class="field-label" for="login-code">Invite code <span class="login__optional">(new members)</span></label>
          <input
            id="login-code"
            v-model="form.inviteCode"
            class="field-input login__code"
            type="text"
            autocomplete="off"
            placeholder="MEMBERS ONLY"
          />
        </template>

        <template v-else>
          <p class="login__sent">
            We emailed a 6-digit code to<br /><strong>{{ form.email }}</strong>
          </p>
          <label class="field-label" for="login-otp">Enter the code</label>
          <input
            id="login-otp"
            v-model="form.code"
            class="field-input login__code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="••••••"
          />
          <button type="button" class="login__resend" :disabled="busy" @click="step = 'details'">
            Wrong email? Go back
          </button>
        </template>

        <p v-if="error" class="login__error">{{ error }}</p>

        <button type="submit" class="btn-primary login__submit" :disabled="busy">
          {{ busy ? 'One moment…' : step === 'details' ? 'Email me a code' : 'Enter the map' }}
        </button>
      </form>

      <!-- DEMO: name + invite code -->
      <form v-else @submit.prevent="submitDemo">
        <label class="field-label" for="login-name">Your name</label>
        <input
          id="login-name"
          v-model="form.name"
          class="field-input"
          type="text"
          autocomplete="name"
          placeholder="e.g. Noora Al-Thani"
        />

        <label class="field-label" for="login-code">Invite code</label>
        <input
          id="login-code"
          v-model="form.inviteCode"
          class="field-input login__code"
          type="text"
          autocomplete="off"
          placeholder="MEMBERS ONLY"
        />

        <p v-if="error" class="login__error">{{ error }}</p>

        <button type="submit" class="btn-primary login__submit">Enter the map</button>

        <p class="login__hint">Demo invite code: <code>PEARL2026</code></p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: hidden;
}

.login__backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 20% 15%, rgba(139, 21, 56, 0.35), transparent),
    radial-gradient(ellipse 50% 40% at 85% 80%, rgba(56, 189, 248, 0.12), transparent),
    radial-gradient(ellipse 40% 35% at 70% 20%, rgba(212, 175, 106, 0.14), transparent),
    var(--bg-900);
}

.login__card {
  position: relative;
  width: min(400px, 100%);
  padding: 36px 32px;
  text-align: center;
}

.login__logo {
  font-size: 44px;
}

.login__title {
  margin-top: 10px;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.login__subtitle {
  margin: 10px 0 24px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.login__card .field-label {
  text-align: left;
  margin-top: 14px;
}

.login__optional {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
  color: rgba(154, 165, 184, 0.7);
}

.login__code {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
}

.login__sent {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.login__sent strong {
  color: var(--text-primary);
}

.login__resend {
  display: block;
  margin: 10px auto 0;
  font-size: 12.5px;
  color: var(--text-secondary);
  text-decoration: underline;
}

.login__error {
  margin-top: 14px;
  font-size: 13px;
  color: var(--danger);
}

.login__submit {
  width: 100%;
  margin-top: 22px;
}

.login__hint {
  margin-top: 18px;
  font-size: 12px;
  color: var(--text-secondary);
}

.login__hint code {
  color: var(--gold);
  font-weight: 700;
}
</style>
