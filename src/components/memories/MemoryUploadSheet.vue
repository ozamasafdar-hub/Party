<script setup>
/**
 * MemoryUploadSheet — attendee upload flow for a 24h recap: pick a photo
 * (.jpg/.png) or short clip (.mp4, ≤10s), preview it, add an optional
 * caption, share to the Memory Map.
 */
import { ref } from 'vue'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { resizeMemoryFile, readVideoFile } from '@/utils/image'

const props = defineProps({
  event: { type: Object, required: true }
})

const emit = defineEmits(['close', 'shared'])

const eventStore = useEventStore()
const authStore = useAuthStore()

const fileInput = ref(null)
const mediaDataUrl = ref(null)
const mediaType = ref('image')
const caption = ref('')
const busy = ref(false)
const error = ref('')

async function onFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  error.value = ''
  try {
    if (file.type.startsWith('video/')) {
      mediaDataUrl.value = await readVideoFile(file, 10)
      mediaType.value = 'video'
    } else {
      mediaDataUrl.value = await resizeMemoryFile(file)
      mediaType.value = 'image'
    }
  } catch (e) {
    error.value = e.message
  }
}

async function share() {
  if (!mediaDataUrl.value) {
    error.value = 'Pick a photo or a short clip first.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await eventStore.addMemory(props.event.id, authStore.currentUser, {
      mediaDataUrl: mediaDataUrl.value,
      mediaType: mediaType.value,
      caption: caption.value
    })
    emit('shared')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="memory-upload glass-panel">
      <h2 class="memory-upload__title">Share to the Memory Map</h2>
      <p class="memory-upload__sub">
        How was “{{ event.title }}”? Your photo or clip stays up for 24 hours.
      </p>

      <div class="memory-upload__preview-wrap">
        <video
          v-if="mediaDataUrl && mediaType === 'video'"
          :src="mediaDataUrl"
          class="memory-upload__preview"
          autoplay
          muted
          loop
          playsinline
        />
        <img
          v-else-if="mediaDataUrl"
          :src="mediaDataUrl"
          class="memory-upload__preview"
          alt=""
        />
        <button
          type="button"
          class="btn-ghost memory-upload__pick"
          @click="fileInput.click()"
        >
          📸 {{ mediaDataUrl ? 'Change' : 'Add a photo or clip' }}
        </button>
        <input
          ref="fileInput"
          class="memory-upload__file"
          type="file"
          accept="image/jpeg,image/png,video/mp4"
          @change="onFileChange"
        />
      </div>
      <p class="memory-upload__hint">JPG / PNG photos · MP4 clips up to 10 seconds</p>

      <input
        v-model="caption"
        class="field-input memory-upload__caption"
        type="text"
        maxlength="100"
        placeholder="Caption (optional)"
      />

      <p v-if="error" class="memory-upload__error">{{ error }}</p>

      <div class="memory-upload__actions">
        <button class="btn-ghost" :disabled="busy" @click="emit('close')">Cancel</button>
        <button class="btn-primary" :disabled="busy || !mediaDataUrl" @click="share">
          {{ busy ? 'Sharing…' : '📸 Share to recap' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 8, 15, 0.7);
  backdrop-filter: blur(5px);
  padding: 16px;
}

.memory-upload {
  width: min(400px, 100%);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 24px;
}

.memory-upload__title {
  font-size: 18px;
  font-weight: 700;
}

.memory-upload__sub {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.memory-upload__preview-wrap {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.memory-upload__preview {
  width: 100%;
  max-height: 320px;
  object-fit: contain;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: rgba(0, 0, 0, 0.4);
}

.memory-upload__pick {
  padding: 10px 18px;
  font-size: 13.5px;
}

.memory-upload__file {
  display: none;
}

.memory-upload__hint {
  margin-top: 8px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.memory-upload__caption {
  margin-top: 12px;
}

.memory-upload__error {
  margin-top: 10px;
  font-size: 13px;
  color: var(--danger);
}

.memory-upload__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
</style>
