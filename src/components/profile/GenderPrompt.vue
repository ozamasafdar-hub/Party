<script setup>
/**
 * GenderPrompt — the one-time question for members who joined before
 * sign-up asked it.
 *
 * Everyone who signed up before migration 013 holds gender null, which is
 * why they cannot see women-only events. Rather than leave them to find a
 * profile setting they have no reason to look for, ask once.
 *
 * Deliberately dismissible: it is not a wall in front of an app they
 * already belong to. It comes back next session, and answering it is the
 * write that freezes the value.
 */
import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'

const emit = defineEmits(['close', 'answered'])

const authStore = useAuthStore()

const choice = ref('')
const error = ref('')
const busy = ref(false)

async function save() {
  if (!choice.value) return
  error.value = ''
  busy.value = true
  try {
    await authStore.setGenderOnce(choice.value)
    emit('answered')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="gender-prompt glass-panel">
      <h2 class="gender-prompt__title">One quick thing</h2>
      <p class="gender-prompt__body">
        WYN has women-only events, and they stay private to women. We never
        asked you this when you joined, so they are hidden from you either
        way.
      </p>

      <div class="gender-prompt__options" role="radiogroup" aria-label="You are">
        <button
          type="button"
          class="gender-prompt__option"
          :class="{ 'gender-prompt__option--on': choice === 'female' }"
          role="radio"
          :aria-checked="choice === 'female'"
          @click="choice = 'female'"
        >
          Woman
        </button>
        <button
          type="button"
          class="gender-prompt__option"
          :class="{ 'gender-prompt__option--on': choice === 'male' }"
          role="radio"
          :aria-checked="choice === 'male'"
          @click="choice = 'male'"
        >
          Man
        </button>
      </div>

      <p class="gender-prompt__note">
        This is set once and can't be changed afterwards — it's what keeps
        women-only events private.
      </p>

      <p v-if="error" class="gender-prompt__error">{{ error }}</p>

      <div class="gender-prompt__actions">
        <button type="button" class="btn-ghost" :disabled="busy" @click="emit('close')">
          Not now
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="busy || !choice"
          @click="save"
        >
          {{ busy ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 62;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 8, 15, 0.6);
  backdrop-filter: blur(4px);
  padding: 16px;
}

.gender-prompt {
  width: min(400px, 100%);
  padding: 26px;
}

.gender-prompt__title {
  font-size: 20px;
  font-weight: 700;
  text-align: center;
}

.gender-prompt__body {
  margin: 12px 0 18px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-secondary);
  text-align: center;
}

.gender-prompt__options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.gender-prompt__option {
  padding: 14px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
  transition: border-color 0.15s ease, background 0.15s ease;
}

/* Pointer devices only, and never over the chosen one — a tap leaves the
   hover stuck, and :hover outscores the --on modifier */
@media (hover: hover) {
  .gender-prompt__option:not(.gender-prompt__option--on):hover {
    background: rgba(255, 255, 255, 0.08);
  }
}

.gender-prompt__option--on {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 100%);
  border-color: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.gender-prompt__note {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
  text-align: center;
}

.gender-prompt__error {
  margin-top: 10px;
  font-size: 13px;
  color: var(--danger);
  text-align: center;
}

.gender-prompt__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
