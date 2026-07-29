<script setup>
/**
 * LoginView — gated, members-only entry.
 * Demo mode: name + invite code. Production: Supabase Auth (email/OTP)
 * with an invites table and admin approval before the map unlocks.
 */
import { reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const form = reactive({ name: '', inviteCode: '' })
const error = ref('')

function submit() {
  error.value = ''
  try {
    authStore.login(form)
    router.push(route.query.redirect || { name: 'map' })
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <div class="login">
    <div class="login__backdrop" aria-hidden="true" />
    <form class="login__card glass-panel" @submit.prevent="submit">
      <div class="login__logo">🗺️</div>
      <h1 class="login__title">Majlis Map</h1>
      <p class="login__subtitle">
        Qatar's members-only social map.<br />
        See what's happening. Join in. Host your own.
      </p>

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

.login__code {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
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
