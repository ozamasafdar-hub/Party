<script setup>
/**
 * MemoryUploadSheet — attendee upload flow for a 24h recap: pick several
 * photos (.jpg/.png) and/or short clips (.mp4, ≤10s) at once, preview
 * them, optionally caption the first, share them all to the Memory Map.
 * Each item becomes its own frame in the story.
 */
import { ref } from 'vue'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { resizeMemoryFile, readVideoFile } from '@/utils/image'

const MAX_ITEMS = 5

const props = defineProps({
  event: { type: Object, required: true }
})

const emit = defineEmits(['close', 'shared'])

const eventStore = useEventStore()
const authStore = useAuthStore()

const fileInput = ref(null)
const items = ref([]) // { dataUrl, type: 'image' | 'video' }
const caption = ref('')
const busy = ref(false)
const error = ref('')

async function onFileChange(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return
  error.value = ''
  for (const file of files) {
    if (items.value.length >= MAX_ITEMS) {
      error.value = `Up to ${MAX_ITEMS} photos or clips per share.`
      break
    }
    try {
      if (file.type.startsWith('video/')) {
        items.value.push({ dataUrl: await readVideoFile(file, 10), type: 'video' })
      } else {
        items.value.push({ dataUrl: await resizeMemoryFile(file), type: 'image' })
      }
    } catch (e) {
      error.value = e.message
    }
  }
}

function removeItem(index) {
  items.value.splice(index, 1)
}

async function share() {
  if (!items.value.length) {
    error.value = 'Pick a photo or a short clip first.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    for (let i = 0; i < items.value.length; i++) {
      const item = items.value[i]
      await eventStore.addMemory(props.event.id, authStore.currentUser, {
        mediaDataUrl: item.dataUrl,
        mediaType: item.type,
        caption: i === 0 ? caption.value : ''
      })
    }
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
        How was “{{ event.title }}”? Your photos and clips stay up for 24 hours.
      </p>

      <div class="memory-upload__grid">
        <div v-for="(item, i) in items" :key="i" class="memory-upload__item">
          <video
            v-if="item.type === 'video'"
            :src="item.dataUrl"
            class="memory-upload__preview"
            muted
            loop
            autoplay
            playsinline
          />
          <img v-else :src="item.dataUrl" class="memory-upload__preview" alt="" />
          <button
            type="button"
            class="memory-upload__remove"
            :aria-label="`Remove item ${i + 1}`"
            @click="removeItem(i)"
          >
            ✕
          </button>
        </div>
        <button
          v-if="items.length < MAX_ITEMS"
          type="button"
          class="memory-upload__add"
          @click="fileInput.click()"
        >
          <span class="memory-upload__add-icon">📸</span>
          <span>{{ items.length ? 'Add more' : 'Add photos or clips' }}</span>
        </button>
        <input
          ref="fileInput"
          class="memory-upload__file"
          type="file"
          accept="image/jpeg,image/png,video/mp4"
          multiple
          @change="onFileChange"
        />
      </div>
      <p class="memory-upload__hint">
        JPG / PNG photos · MP4 clips up to 10 seconds · up to {{ MAX_ITEMS }} per share
      </p>

      <input
        v-model="caption"
        class="field-input memory-upload__caption"
        type="text"
        maxlength="100"
        placeholder="Caption (optional — shown on your first photo)"
      />

      <p v-if="error" class="memory-upload__error">{{ error }}</p>

      <div class="memory-upload__actions">
        <button class="btn-ghost" :disabled="busy" @click="emit('close')">Cancel</button>
        <button class="btn-primary" :disabled="busy || !items.length" @click="share">
          {{ busy ? 'Sharing…' : `📸 Share ${items.length > 1 ? items.length + ' to recap' : 'to recap'}` }}
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
  width: min(420px, 100%);
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

.memory-upload__grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.memory-upload__item {
  position: relative;
}

.memory-upload__preview {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: rgba(0, 0, 0, 0.4);
}

.memory-upload__remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 10px;
  line-height: 1;
  background: rgba(17, 24, 39, 0.92);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}

.memory-upload__remove:hover {
  color: var(--danger);
  border-color: var(--danger);
}

.memory-upload__add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-sm);
  border: 1px dashed rgba(167, 139, 250, 0.5);
  background: rgba(167, 139, 250, 0.06);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.3;
  padding: 6px;
  text-align: center;
}

.memory-upload__add:hover {
  background: rgba(167, 139, 250, 0.12);
  color: var(--text-primary);
}

.memory-upload__add-icon {
  font-size: 20px;
}

.memory-upload__file {
  display: none;
}

.memory-upload__hint {
  margin-top: 10px;
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
