<script setup>
/**
 * LoginPanel — log in / sign up with email + password. Used as a page
 * (LoginView) and as a modal over the map (opened when a visitor tries
 * to join or host an event).
 */
import { reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import WynLogo from '@/components/ui/WynLogo.vue'

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
const showPassword = ref(false)

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
    <div class="login-panel__logo"><WynLogo :size="52" /></div>
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
      <div class="login-panel__password">
        <input
          id="auth-password"
          v-model="form.password"
          class="field-input login-panel__password-input"
          :type="showPassword ? 'text' : 'password'"
          :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
          :placeholder="mode === 'signup' ? 'At least 6 characters' : '••••••••'"
        />
        <button
          type="button"
          class="login-panel__eye"
          :aria-label="showPassword ? 'Hide password' : 'Show password'"
          :title="showPassword ? 'Hide password' : 'Show password'"
          @click="showPassword = !showPassword"
        >
          <svg v-if="showPassword" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3.3 2.3 2 3.6l3.4 3.4C3.4 8.3 1.9 10 1 12c1.7 3.9 6 7 11 7 2 0 3.8-.5 5.4-1.3l3 3 1.3-1.3L3.3 2.3ZM12 16.5c-2.5 0-4.5-2-4.5-4.5 0-.7.2-1.4.5-2l1.5 1.5a2.5 2.5 0 0 0 3 3l1.5 1.5c-.6.3-1.3.5-2 .5Zm-.4-8.9 4.8 4.8v-.4A4.5 4.5 0 0 0 12 7.5l-.4.1ZM12 5c5 0 9.3 3.1 11 7-.6 1.5-1.7 2.9-3 4l-1.4-1.4c.9-.8 1.6-1.6 2.2-2.6-1.6-2.7-5-4.9-8.8-5l-1.6-1.7c.5-.2 1-.3 1.6-.3Z"/>
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7Zm0 11.8c-3.8 0-7.2-2.1-8.8-4.8C4.8 9.3 8.2 7.2 12 7.2s7.2 2.1 8.8 4.8c-1.6 2.7-5 4.8-8.8 4.8Zm0-9.3a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 6.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/>
          </svg>
        </button>
      </div>

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
  display: flex;
  justify-content: center;
  filter: drop-shadow(0 4px 14px rgba(124, 21, 51, 0.55));
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

.login-panel__password {
  position: relative;
}

.login-panel__password-input {
  padding-right: 48px;
}

.login-panel__eye {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: color 0.15s ease;
}

.login-panel__eye:hover {
  color: var(--text-primary);
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
