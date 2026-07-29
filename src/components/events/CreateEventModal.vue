<script setup>
/**
 * CreateEventModal — the quick-post flow, and edit mode for hosts.
 * Creating: the member dropped a pin on the map (pick mode) and this form
 * captures Title, Description, Category, Date/Time, Duration and Max
 * Capacity. Editing: same form prefilled from the existing event.
 */
import { computed, reactive, ref } from 'vue'
import { CATEGORIES } from '@/config/categories'
import { nextHalfHourISO, toLocalInputValue } from '@/utils/datetime'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'

const props = defineProps({
  coords: { type: Object, default: null }, // { lat, lng } — create mode
  event: { type: Object, default: null } // existing event — edit mode
})

const emit = defineEmits(['close', 'created'])

const eventStore = useEventStore()
const authStore = useAuthStore()

const isEditing = computed(() => !!props.event)
const pin = computed(() =>
  props.event ? { lat: props.event.lat, lng: props.event.lng } : props.coords
)

const form = reactive({
  title: props.event?.title ?? '',
  description: props.event?.description ?? '',
  category: props.event?.category ?? 'dining',
  locationName: props.event?.locationName ?? '',
  startsAtLocal: toLocalInputValue(props.event?.startsAt ?? nextHalfHourISO()),
  durationMinutes: props.event?.durationMinutes ?? 120,
  maxCapacity: props.event?.maxCapacity ?? 6
})

const busy = ref(false)
const error = ref('')

const DURATIONS = [
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 },
  { label: '6 hours', value: 360 },
  { label: 'All day', value: 720 }
]

async function submit() {
  error.value = ''
  if (!form.title.trim()) return (error.value = 'Give your event a title.')
  if (!form.locationName.trim()) return (error.value = 'Name the place (e.g. "B Square Mall").')
  const startsAt = new Date(form.startsAtLocal)
  if (Number.isNaN(startsAt.getTime())) return (error.value = 'Pick a valid date and time.')

  const payload = {
    title: form.title,
    description: form.description,
    category: form.category,
    locationName: form.locationName,
    lat: pin.value.lat,
    lng: pin.value.lng,
    startsAt: startsAt.toISOString(),
    durationMinutes: Number(form.durationMinutes),
    maxCapacity: Math.max(2, Number(form.maxCapacity))
  }

  busy.value = true
  try {
    const event = isEditing.value
      ? await eventStore.update(props.event.id, payload)
      : await eventStore.create(payload, authStore.currentUser)
    emit('created', event)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <form class="create-modal glass-panel" @submit.prevent="submit">
      <h2 class="create-modal__title">{{ isEditing ? 'Edit event' : 'Drop an event pin' }}</h2>
      <p class="create-modal__coords">
        📍 Pinned at {{ pin.lat.toFixed(4) }}, {{ pin.lng.toFixed(4) }}
      </p>

      <label class="field-label" for="ev-title">Event title</label>
      <input
        id="ev-title"
        v-model="form.title"
        class="field-input"
        type="text"
        maxlength="80"
        placeholder='e.g. "Going bowling at B Square, 8 PM"'
      />

      <label class="field-label" for="ev-desc">Description</label>
      <textarea
        id="ev-desc"
        v-model="form.description"
        class="field-input create-modal__textarea"
        rows="3"
        maxlength="400"
        placeholder="What's the plan? Anything guests should bring or know?"
      />

      <label class="field-label">Category</label>
      <div class="create-modal__categories">
        <button
          v-for="(cat, key) in CATEGORIES"
          :key="key"
          type="button"
          class="create-modal__cat"
          :class="{ 'create-modal__cat--active': form.category === key }"
          :style="form.category === key ? { background: cat.color, borderColor: cat.color } : {}"
          @click="form.category = key"
        >
          {{ cat.label }}
        </button>
      </div>

      <label class="field-label" for="ev-place">Place name</label>
      <input
        id="ev-place"
        v-model="form.locationName"
        class="field-input"
        type="text"
        maxlength="80"
        placeholder='e.g. "Porto Arabia, The Pearl"'
      />

      <div class="create-modal__row">
        <div>
          <label class="field-label" for="ev-when">Date &amp; time</label>
          <input id="ev-when" v-model="form.startsAtLocal" class="field-input" type="datetime-local" />
        </div>
        <div>
          <label class="field-label" for="ev-duration">Duration</label>
          <select id="ev-duration" v-model="form.durationMinutes" class="field-input">
            <option v-for="d in DURATIONS" :key="d.value" :value="d.value">{{ d.label }}</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="ev-cap">Max guests</label>
          <input id="ev-cap" v-model.number="form.maxCapacity" class="field-input" type="number" min="2" max="100" />
        </div>
      </div>

      <p v-if="error" class="create-modal__error">{{ error }}</p>

      <div class="create-modal__actions">
        <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn-primary" :disabled="busy">
          {{ busy ? 'Saving…' : isEditing ? 'Save changes' : 'Publish to map' }}
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

.create-modal {
  width: min(480px, 100%);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 26px;
}

.create-modal__title {
  font-size: 20px;
  font-weight: 700;
}

.create-modal__coords {
  margin: 6px 0 18px;
  font-size: 13px;
  color: var(--gold);
}

.create-modal .field-label {
  margin-top: 14px;
}

.create-modal__textarea {
  resize: vertical;
  min-height: 72px;
}

.create-modal__categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.create-modal__cat {
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  transition: all 0.15s ease;
}

.create-modal__cat--active {
  color: #0b0f19;
}

.create-modal__row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 0.8fr;
  gap: 10px;
}

.create-modal__row .field-label {
  margin-top: 14px;
}

.create-modal__error {
  margin-top: 14px;
  font-size: 13px;
  color: var(--danger);
}

.create-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

@media (max-width: 520px) {
  .create-modal__row {
    grid-template-columns: 1fr;
  }
}
</style>
