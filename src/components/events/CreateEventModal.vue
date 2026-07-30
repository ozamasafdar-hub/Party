<script setup>
/**
 * CreateEventModal — the quick-post flow, and edit mode for hosts.
 * The form opens first; the location is set from inside it via the
 * "Pick on map" button (which temporarily hides the form, keeps its
 * state, and returns once the member taps the spot). Editing: same form
 * prefilled from the existing event, location re-pickable.
 */
import { computed, reactive, ref, watch } from 'vue'
import { CATEGORIES } from '@/config/categories'
import { nextHalfHourISO, toLocalInputValue } from '@/utils/datetime'
import { resizeCoverFile } from '@/utils/image'
import { blurCoords } from '@/utils/geo'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'

const props = defineProps({
  coords: { type: Object, default: null }, // { lat, lng } — freshly picked
  event: { type: Object, default: null }, // existing event — edit mode
  placeName: { type: String, default: '' } // from the map search
})

const emit = defineEmits(['close', 'created', 'pick-location'])

const eventStore = useEventStore()
const authStore = useAuthStore()

const isEditing = computed(() => !!props.event)
// A fresh pick wins; otherwise fall back to the event's current spot
const pin = computed(
  () =>
    props.coords ??
    (props.event ? { lat: props.event.lat, lng: props.event.lng } : null)
)

const form = reactive({
  title: props.event?.title ?? '',
  description: props.event?.description ?? '',
  category: props.event?.category ?? 'dining',
  locationName: props.event?.locationName ?? '',
  startsAtLocal: toLocalInputValue(props.event?.startsAt ?? nextHalfHourISO()),
  durationMinutes: props.event?.durationMinutes ?? 120,
  maxCapacity: props.event?.maxCapacity ?? 6,
  approvalMode: props.event?.approvalMode ?? false,
  minReliabilityOn: !!props.event?.minReliability,
  minReliability: props.event?.minReliability ?? 80,
  pricePerSpot: props.event?.pricePerSpot || '',
  ladiesOnly: props.event?.ladiesOnly ?? false,
  locationBlurred: props.event?.locationBlurred ?? false
})

const busy = ref(false)
const error = ref('')

// A searched place suggests the name — but never overwrites what the
// member already typed
watch(
  () => props.placeName,
  (name) => {
    if (name && !form.locationName.trim()) form.locationName = name
  },
  { immediate: true }
)

const coverPreview = ref(props.event?.coverUrl ?? null)
const newCover = ref(null)
const coverInput = ref(null)

async function onCoverChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  error.value = ''
  try {
    const dataUrl = await resizeCoverFile(file)
    newCover.value = dataUrl
    coverPreview.value = dataUrl
  } catch (e) {
    error.value = e.message
  }
}

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
  if (!pin.value) return (error.value = 'Set the location — tap "Pick on map".')
  const startsAt = new Date(form.startsAtLocal)
  if (Number.isNaN(startsAt.getTime())) return (error.value = 'Pick a valid date and time.')

  // Blurred events publish offset coordinates; the exact pin is kept
  // privately and revealed only to the host and confirmed guests.
  const blur = !isEditing.value && form.locationBlurred
  const publicPin = blur
    ? blurCoords(pin.value.lat, pin.value.lng, form.title.trim() || 'wyn')
    : pin.value

  const payload = {
    title: form.title,
    description: form.description,
    category: form.category,
    locationName: form.locationName,
    lat: publicPin.lat,
    lng: publicPin.lng,
    startsAt: startsAt.toISOString(),
    durationMinutes: Number(form.durationMinutes),
    maxCapacity: Math.max(2, Number(form.maxCapacity)),
    coverDataUrl: newCover.value,
    approvalMode: form.approvalMode,
    minReliability: form.minReliabilityOn ? Number(form.minReliability) : null,
    pricePerSpot: Math.max(0, Number(form.pricePerSpot) || 0),
    ladiesOnly: form.ladiesOnly,
    locationBlurred: blur || (isEditing.value && !!props.event?.locationBlurred),
    exactLat: blur ? pin.value.lat : null,
    exactLng: blur ? pin.value.lng : null
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
      <h2 class="create-modal__title">{{ isEditing ? 'Edit event' : 'Create an event' }}</h2>

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

      <label class="field-label">Cover photo <span class="create-modal__optional">(optional)</span></label>
      <div class="create-modal__cover-row">
        <img v-if="coverPreview" :src="coverPreview" class="create-modal__cover-preview" alt="" />
        <button type="button" class="btn-ghost create-modal__cover-btn" @click="coverInput.click()">
          📷 {{ coverPreview ? 'Change photo' : 'Add a photo' }}
        </button>
        <input
          ref="coverInput"
          class="create-modal__cover-file"
          type="file"
          accept="image/*"
          @change="onCoverChange"
        />
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

      <label class="field-label">Location on the map</label>
      <div class="create-modal__pin-row">
        <span v-if="pin" class="create-modal__coords">
          📍 {{ pin.lat.toFixed(4) }}, {{ pin.lng.toFixed(4) }}
        </span>
        <span v-else class="create-modal__coords create-modal__coords--empty">
          📍 Not set yet
        </span>
        <button type="button" class="btn-ghost create-modal__pin-btn" @click="emit('pick-location')">
          {{ pin ? '🗺️ Change on map' : '🗺️ Pick on map' }}
        </button>
      </div>

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

      <label class="field-label">Host controls</label>
      <div class="create-modal__extras">
        <label class="create-modal__toggle">
          <input v-model="form.approvalMode" type="checkbox" />
          <span>
            <strong>✋ Host approval required</strong>
            <em>Guests request a spot — you review and approve each one.</em>
          </span>
        </label>

        <label class="create-modal__toggle">
          <input v-model="form.minReliabilityOn" type="checkbox" />
          <span>
            <strong>⭐ Minimum reliability</strong>
            <em>Only members with a good show-up record can join.</em>
          </span>
        </label>
        <div v-if="form.minReliabilityOn" class="create-modal__slider-row">
          <input
            v-model.number="form.minReliability"
            type="range"
            min="50"
            max="100"
            step="5"
            class="create-modal__slider"
          />
          <span class="create-modal__slider-value">{{ form.minReliability }}%+</span>
        </div>

        <label class="create-modal__toggle">
          <span class="create-modal__price-label">
            <strong>💳 Cost per person (QAR)</strong>
            <em>Guests pay upfront into escrow — no more no-shows. 0 = free.</em>
          </span>
          <input
            v-model="form.pricePerSpot"
            type="number"
            min="0"
            max="9999"
            step="5"
            placeholder="0"
            class="field-input create-modal__price-input"
          />
        </label>

        <label class="create-modal__toggle">
          <input v-model="form.ladiesOnly" type="checkbox" />
          <span>
            <strong>🚺 Ladies only</strong>
            <em>Visible only to female members (and you, the host).</em>
          </span>
        </label>

        <label v-if="!isEditing" class="create-modal__toggle">
          <input v-model="form.locationBlurred" type="checkbox" />
          <span>
            <strong>🔒 Blur exact location</strong>
            <em>The map shows an approximate area — the exact spot is revealed only to confirmed guests.</em>
          </span>
        </label>
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
  font-size: 13px;
  color: var(--gold);
}

.create-modal__coords--empty {
  color: var(--text-secondary);
}

.create-modal__pin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.create-modal__pin-btn {
  padding: 9px 16px;
  font-size: 13px;
  flex-shrink: 0;
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

.create-modal__optional {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
  color: rgba(154, 165, 184, 0.7);
}

.create-modal__cover-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.create-modal__cover-preview {
  width: 120px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
}

.create-modal__cover-btn {
  padding: 9px 16px;
  font-size: 13px;
}

.create-modal__cover-file {
  display: none;
}

.create-modal__row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 0.8fr;
  gap: 10px;
}

.create-modal__row .field-label {
  margin-top: 14px;
}

.create-modal__extras {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
}

.create-modal__toggle {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}

.create-modal__toggle input[type='checkbox'] {
  margin-top: 3px;
  width: 16px;
  height: 16px;
  accent-color: var(--gold);
  flex-shrink: 0;
}

.create-modal__toggle strong {
  display: block;
  font-size: 13.5px;
  font-weight: 700;
}

.create-modal__toggle em {
  display: block;
  margin-top: 1px;
  font-style: normal;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.create-modal__slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 26px;
}

.create-modal__slider {
  flex: 1;
  accent-color: var(--gold);
}

.create-modal__slider-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--gold);
  min-width: 44px;
  text-align: right;
}

.create-modal__price-label {
  flex: 1;
}

.create-modal__price-input {
  width: 90px;
  flex-shrink: 0;
  padding: 8px 10px;
  text-align: right;
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
