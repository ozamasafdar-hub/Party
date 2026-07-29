<script setup>
/**
 * LoginPanel — log in / sign up with email + password. Used as a page
 * (LoginView) and as a modal over the map (opened when a visitor tries
 * to join or host an event).
 */
import { reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'

defineProps({
  prompt: { type: String, default: '' } // context line, e.g. "Sign in to join this event"
})

const emit = defineEmits(['success'])

const authStore = useAuthStore()

const mode = ref('signin') // 'signin' | 'signup'
const form = reactive({ name: '', email: '', password: '' })
const error = ref('')
const notice = ref('')
const busy = ref(false)

function switchMode() {
  mode.value = mode.value === 'signin' ? 'signup' : 'signin'
  error.value = ''
  notice.value = ''
}

async function submit() {
  error.value = ''
  notice.value = ''
  busy.value = true
  try {
    if (mode.value === 'signup') {
      const result = await authStore.signUp(form)
      if (result?.needsEmailConfirmation) {
        notice.value =
          'Almost there — we sent a confirmation link to your email. Open it, then log in here.'
        mode.value = 'signin'
        return
      }
    } else {
      await authStore.signIn(form)
    }
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
        Qatar's social map.<br />
        See what's happening. Join in. Host your own.
      </template>
    </p>

    <form @submit.prevent="submit">
      <template v-if="mode === 'signup'">
        <label class="field-label" for="auth-name">Your name</label>
        <input
          id="auth-name"
          v-model="form.name"
          class="field-input"
          type="text"
          autocomplete="name"
          placeholder="e.g. Noora Al-Thani"
        />
      </template>

      <label class="field-label" for="auth-email">Email</label>
      <input
        id="auth-email"
        v-model="form.email"
        class="field-input"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
      />

      <label class="field-label" for="auth-password">Password</label>
      <input
        id="auth-password"
        v-model="form.password"
        class="field-input"
        type="password"
        :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
        :placeholder="mode === 'signup' ? 'At least 6 characters' : '••••••••'"
      />

      <p v-if="error" class="login-panel__error">{{ error }}</p>
      <p v-if="notice" class="login-panel__notice">{{ notice }}</p>

      <button type="submit" class="btn-primary login-panel__submit" :disabled="busy">
        {{ busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Log in' }}
      </button>
    </form>

    <button type="button" class="login-panel__switch" @click="switchMode">
      <template v-if="mode === 'signin'">New here? <strong>Create an account</strong></template>
      <template v-else>Already a member? <strong>Log in</strong></template>
    </button>

    <p v-if="!authStore.isLiveMode" class="login-panel__hint">
      Demo mode — accounts live only in this browser.
    </p>
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

.login-panel__error {
  margin-top: 14px;
  font-size: 13px;
  color: var(--danger);
}

.login-panel__notice {
  margin-top: 14px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--success);
}

.login-panel__submit {
  width: 100%;
  margin-top: 22px;
}

.login-panel__switch {
  margin-top: 16px;
  font-size: 13.5px;
  color: var(--text-secondary);
}

.login-panel__switch strong {
  color: var(--accent-bright);
}

.login-panel__switch:hover strong {
  text-decoration: underline;
}

.login-panel__hint {
  margin-top: 14px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
