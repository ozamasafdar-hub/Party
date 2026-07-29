<script setup>
/**
 * LoginPanel — the sign-in / join form, usable as a page (LoginView) or as
 * a modal over the map (opened when a visitor tries to join or host).
 *
 *  - LIVE (Supabase configured): email → 6-digit code; first-timers also
 *    give a name + invite code, redeemed server-side.
 *  - DEMO: name + invite code, local session only.
 */
import { reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'

defineProps({
  prompt: { type: String, default: '' } // context line, e.g. "Sign in to join this event"
})

const emit = defineEmits(['success'])

const authStore = useAuthStore()

const form = reactive({ name: '', inviteCode: '', email: '', code: '' })
const error = ref('')
const busy = ref(false)
const step = ref('details') // live mode: 'details' → 'code'

function submitDemo() {
  error.value = ''
  try {
    authStore.login(form)
    emit('success')
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
    emit('success')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login-panel">
    <div class="login-panel__logo">🗺️</div>
    <h1 class="login-panel__title">WYN</h1>
    <p class="login-panel__subtitle">
      <template v-if="prompt">{{ prompt }}</template>
      <template v-else>
        Qatar's members-only social map.<br />
        See what's happening. Join in. Host your own.
      </template>
    </p>

    <!-- LIVE: email + one-time code -->
    <form
      v-if="authStore.isLiveMode"
      @submit.prevent="step === 'details' ? submitEmail() : submitCode()"
    >
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

        <label class="field-label" for="login-name">
          Your name <span class="login-panel__optional">(new members)</span>
        </label>
        <input
          id="login-name"
          v-model="form.name"
          class="field-input"
          type="text"
          autocomplete="name"
          placeholder="e.g. Noora Al-Thani"
        />

        <label class="field-label" for="login-code">
          Invite code <span class="login-panel__optional">(new members)</span>
        </label>
        <input
          id="login-code"
          v-model="form.inviteCode"
          class="field-input login-panel__code"
          type="text"
          autocomplete="off"
          placeholder="MEMBERS ONLY"
        />
      </template>

      <template v-else>
        <p class="login-panel__sent">
          We emailed a 6-digit code to<br /><strong>{{ form.email }}</strong>
        </p>
        <label class="field-label" for="login-otp">Enter the code</label>
        <input
          id="login-otp"
          v-model="form.code"
          class="field-input login-panel__code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="••••••"
        />
        <button type="button" class="login-panel__resend" :disabled="busy" @click="step = 'details'">
          Wrong email? Go back
        </button>
      </template>

      <p v-if="error" class="login-panel__error">{{ error }}</p>

      <button type="submit" class="btn-primary login-panel__submit" :disabled="busy">
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
        class="field-input login-panel__code"
        type="text"
        autocomplete="off"
        placeholder="MEMBERS ONLY"
      />

      <p v-if="error" class="login-panel__error">{{ error }}</p>

      <button type="submit" class="btn-primary login-panel__submit">Join · Sign in</button>

      <p class="login-panel__hint">Demo invite code: <code>PEARL2026</code></p>
    </form>
  </div>
</template>

<style scoped>
.login-panel {
  text-align: center;
}

.login-panel__logo {
  font-size: 44px;
}

.login-panel__title {
  margin-top: 10px;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.login-panel__subtitle {
  margin: 10px 0 24px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.login-panel .field-label {
  text-align: left;
  margin-top: 14px;
}

.login-panel__optional {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
  color: rgba(154, 165, 184, 0.7);
}

.login-panel__code {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
}

.login-panel__sent {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.login-panel__sent strong {
  color: var(--text-primary);
}

.login-panel__resend {
  display: block;
  margin: 10px auto 0;
  font-size: 12.5px;
  color: var(--text-secondary);
  text-decoration: underline;
}

.login-panel__error {
  margin-top: 14px;
  font-size: 13px;
  color: var(--danger);
}

.login-panel__submit {
  width: 100%;
  margin-top: 22px;
}

.login-panel__hint {
  margin-top: 18px;
  font-size: 12px;
  color: var(--text-secondary);
}

.login-panel__hint code {
  color: var(--gold);
  font-weight: 700;
}
</style>
