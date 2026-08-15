<script setup>
/**
 * DeleteAccountModal — leaving WYN.
 *
 * States plainly what goes and what stays, because "delete everything" is
 * not what happens and pretending otherwise would be a lie in both
 * directions: their name and messages really are erased, and the evening
 * twelve other people remember really does survive.
 *
 * Typing your own name is the confirmation. A second "are you sure?" is
 * easy to tap through; writing something is not.
 */
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'

const emit = defineEmits(['close', 'deleted'])

const authStore = useAuthStore()

const typed = ref('')
const error = ref('')
const busy = ref(false)

const myName = computed(() => authStore.currentUser?.name || '')
const matches = computed(
  () => typed.value.trim().toLowerCase() === myName.value.trim().toLowerCase()
)

async function confirm() {
  if (!matches.value || busy.value) return
  error.value = ''
  busy.value = true
  try {
    await authStore.deleteAccount()
    emit('deleted')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="del glass-panel">
      <h2 class="del__title">Delete your account</h2>

      <p class="del__lead">
        This can't be undone. You won't be able to sign back in.
      </p>

      <div class="del__cols">
        <div class="del__col">
          <h3 class="del__col-title">Erased</h3>
          <ul class="del__list">
            <li>Your name, photo and bio</li>
            <li>Your sign-in</li>
            <li>All your direct messages, both sides</li>
            <li>Who you follow, and your followers</li>
          </ul>
        </div>
        <div class="del__col">
          <h3 class="del__col-title">Kept</h3>
          <ul class="del__list">
            <li>Events you already hosted, as “Former member”</li>
            <li>Your messages in event chats</li>
            <li>Photos you added to shared recaps</li>
          </ul>
          <p class="del__note">Other people's record of their own evenings.</p>
        </div>
      </div>

      <p class="del__warn">
        Anything you're hosting that hasn't happened yet will be
        <strong>cancelled</strong>, and its guests told.
      </p>

      <label class="field-label" for="del-name">
        Type <strong>{{ myName }}</strong> to confirm
      </label>
      <input
        id="del-name"
        v-model="typed"
        class="field-input"
        type="text"
        autocomplete="off"
        :placeholder="myName"
      />

      <p v-if="error" class="del__error">{{ error }}</p>

      <div class="del__actions">
        <button type="button" class="btn-ghost" :disabled="busy" @click="emit('close')">
          Keep my account
        </button>
        <button
          type="button"
          class="btn-primary del__go"
          :disabled="!matches || busy"
          @click="confirm"
        >
          {{ busy ? 'Deleting…' : 'Delete for good' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 64;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 8, 15, 0.68);
  backdrop-filter: blur(4px);
  padding: 16px;
}

.del {
  width: min(460px, 100%);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 24px;
}

.del__title {
  font-size: 20px;
  font-weight: 700;
  color: var(--danger);
}

.del__lead {
  margin: 8px 0 16px;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.del__cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}

@media (max-width: 460px) {
  .del__cols {
    grid-template-columns: 1fr;
  }
}

.del__col-title {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.del__list {
  margin: 0;
  padding-left: 16px;
  font-size: 12.5px;
  line-height: 1.6;
}

.del__note {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--text-secondary);
  font-style: italic;
}

.del__warn {
  margin: 0 0 16px;
  padding: 11px 13px;
  border-radius: var(--radius-md);
  background: rgba(244, 88, 122, 0.1);
  border: 1px solid rgba(244, 88, 122, 0.3);
  font-size: 12.5px;
  line-height: 1.5;
}

.del__error {
  margin-top: 10px;
  font-size: 13px;
  color: var(--danger);
}

.del__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.del__go {
  background: linear-gradient(135deg, #a3243f 0%, var(--danger) 100%);
  box-shadow: 0 6px 20px rgba(244, 88, 122, 0.32);
}

.del__go:disabled {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-secondary);
  opacity: 1;
  box-shadow: none;
}
</style>
