<script setup>
/**
 * EditProfileModal — change name, bio, and profile photo. Photos are
 * center-cropped and resized in the browser before saving/uploading.
 */
import { reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { resizeImageFile } from '@/utils/image'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'

const emit = defineEmits(['close', 'saved'])

const authStore = useAuthStore()

const form = reactive({
  name: authStore.currentUser.name,
  bio: authStore.currentUser.bio || ''
})
const avatarPreview = ref(authStore.currentUser.avatarUrl || null)
const newAvatar = ref(null)
const fileInput = ref(null)
const error = ref('')
const busy = ref(false)

async function onFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  error.value = ''
  try {
    const dataUrl = await resizeImageFile(file)
    newAvatar.value = dataUrl
    avatarPreview.value = dataUrl
  } catch (e) {
    error.value = e.message
  }
}

async function save() {
  error.value = ''
  busy.value = true
  try {
    await authStore.updateProfile({
      name: form.name,
      bio: form.bio,
      avatarDataUrl: newAvatar.value
    })
    emit('saved')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <form class="edit-profile glass-panel" @submit.prevent="save">
      <h2 class="edit-profile__title">Edit profile</h2>

      <div class="edit-profile__avatar-wrap">
        <MemberAvatar
          :member="{ ...authStore.currentUser, avatarUrl: avatarPreview }"
          :size="96"
        />
        <button
          type="button"
          class="edit-profile__upload"
          @click="fileInput.click()"
        >
          📷 {{ avatarPreview ? 'Change photo' : 'Upload photo' }}
        </button>
        <input
          ref="fileInput"
          class="edit-profile__file"
          type="file"
          accept="image/*"
          @change="onFileChange"
        />
      </div>

      <label class="field-label" for="ep-name">Your name</label>
      <input id="ep-name" v-model="form.name" class="field-input" type="text" maxlength="60" />

      <label class="field-label" for="ep-bio">Bio</label>
      <textarea
        id="ep-bio"
        v-model="form.bio"
        class="field-input edit-profile__bio"
        rows="2"
        maxlength="160"
        placeholder="A line about you — favorite plans, neighborhoods, sports…"
      />

      <p v-if="error" class="edit-profile__error">{{ error }}</p>

      <div class="edit-profile__actions">
        <button type="button" class="btn-ghost" :disabled="busy" @click="emit('close')">
          Cancel
        </button>
        <button type="submit" class="btn-primary" :disabled="busy">
          {{ busy ? 'Saving…' : 'Save profile' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 8, 15, 0.6);
  backdrop-filter: blur(4px);
  padding: 16px;
}

.edit-profile {
  width: min(420px, 100%);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 26px;
}

.edit-profile__title {
  font-size: 20px;
  font-weight: 700;
  text-align: center;
}

.edit-profile__avatar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: 18px 0 6px;
}

.edit-profile__upload {
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.edit-profile__upload:hover {
  background: rgba(255, 255, 255, 0.13);
}

.edit-profile__file {
  display: none;
}

.edit-profile .field-label {
  margin-top: 14px;
}

.edit-profile__bio {
  resize: vertical;
  min-height: 56px;
}

.edit-profile__error {
  margin-top: 12px;
  font-size: 13px;
  color: var(--danger);
}

.edit-profile__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}
</style>
