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
import { useHostPermissions, FREE_LIMITS } from '@/composables/useHostPermissions'
import HostProModal from '@/components/pro/HostProModal.vue'

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
  maxCapacity: props.event?.maxCapacity ?? 5, // free-tier friendly default
  approvalMode: props.event?.approvalMode ?? false,
  minReliabilityOn: !!props.event?.minReliability,
  minReliability: props.event?.minReliability ?? 80,
  pricePerSpot: props.event?.pricePerSpot || '',
  ladiesOnly: props.event?.ladiesOnly ?? false,
  locationBlurred: props.event?.locationBlurred ?? false,
  featuredPin: props.event?.featuredPin ?? false,
  proOnly: props.event?.proOnly ?? false
})

const busy = ref(false)
const error = ref('')

/* --- three-step wizard ---------------------------------------------------- */

const STEPS = [
  { n: 1, label: 'Details' },
  { n: 2, label: 'When & where' },
  { n: 3, label: 'Options' }
]
const step = ref(1)

/** Returns an error message for the current step, or '' when it's valid. */
function validateStep(n) {
  if (n === 1) {
    if (!form.title.trim()) return 'Give your event a title.'
  }
  if (n === 2) {
    if (!form.locationName.trim()) return 'Name the place (e.g. "B Square Mall").'
    if (!pin.value) return 'Set the location — tap "Pick on map".'
    if (Number.isNaN(new Date(form.startsAtLocal).getTime())) {
      return 'Pick a valid date and time.'
    }
  }
  return ''
}

function nextStep() {
  const problem = validateStep(step.value)
  if (problem) {
    error.value = problem
    return
  }
  error.value = ''
  step.value = Math.min(STEPS.length, step.value + 1)
}

function prevStep() {
  error.value = ''
  step.value = Math.max(1, step.value - 1)
}

/** Step chips: you can always jump back, forward only through Next. */
function goToStep(n) {
  if (n >= step.value) return
  error.value = ''
  step.value = n
}

/* --- Host Pro gates ------------------------------------------------------- */

const { isPro, maxCapacity, canCharge, canFeaturePin, canReliabilityLock } =
  useHostPermissions()
const showPaywall = ref(false)
const paywallReason = ref('')

function openPaywall(reason) {
  paywallReason.value = reason
  showPaywall.value = true
}

/* Guest-count picker: free sizes are tappable, bigger ones wear a 👑 and
 * open the paywall — so new hosts see exactly where Pro starts. */
const GUEST_COUNTS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100]
const showCapPicker = ref(false)

function pickCapacity(n) {
  if (!isPro.value && n > FREE_LIMITS.maxCapacity) {
    showCapPicker.value = false
    openPaywall(`Hosting more than ${FREE_LIMITS.maxCapacity} guests is a Host Pro feature.`)
    return
  }
  form.maxCapacity = n
  showCapPicker.value = false
}

/**
 * Intercepts a pro-only toggle for free hosts: block + show the paywall.
 * `allowed` arrives as a plain boolean (template refs auto-unwrap).
 */
function gatePro(event, allowed, reason) {
  if (allowed) return
  event.preventDefault()
  openPaywall(reason)
}

watch(
  () => form.maxCapacity,
  (v) => {
    if (!isPro.value && Number(v) > FREE_LIMITS.maxCapacity) {
      form.maxCapacity = FREE_LIMITS.maxCapacity
      openPaywall(`Free events are capped at ${FREE_LIMITS.maxCapacity} guests.`)
    }
  }
)

watch(
  () => form.pricePerSpot,
  (v) => {
    if (!canCharge.value && Number(v) > 0) {
      form.pricePerSpot = ''
      openPaywall('Charging per spot is a Host Pro feature.')
    }
  }
)

// A searched place suggests the name — but never overwrites what the
// member already typed
watch(
  () => props.placeName,
  (name) => {
    if (name && !form.locationName.trim()) form.locationName = name
  },
  { immediate: true }
)

/**
 * Photo gallery — up to MAX_PHOTOS per event; the first one is the cover.
 * Existing photos are https URLs, new picks are data: URLs (uploaded on
 * save in live mode).
 */
const MAX_PHOTOS = 6
const photos = ref(
  props.event?.photoUrls?.length
    ? [...props.event.photoUrls]
    : props.event?.coverUrl
      ? [props.event.coverUrl]
      : []
)
const coverInput = ref(null)

async function onCoverChange(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return
  error.value = ''
  try {
    for (const file of files) {
      if (photos.value.length >= MAX_PHOTOS) {
        error.value = `Up to ${MAX_PHOTOS} photos per event.`
        break
      }
      photos.value.push(await resizeCoverFile(file))
    }
  } catch (e) {
    error.value = e.message
  }
}

function removePhoto(index) {
  photos.value.splice(index, 1)
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
  // Enter inside a field shouldn't publish from an earlier step
  if (step.value < STEPS.length) {
    nextStep()
    return
  }
  error.value = ''
  for (const s of STEPS) {
    const problem = validateStep(s.n)
    if (problem) {
      step.value = s.n
      error.value = problem
      return
    }
  }
  const startsAt = new Date(form.startsAtLocal)

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
    keptPhotoUrls: photos.value.filter((u) => !u.startsWith('data:')),
    newPhotoDataUrls: photos.value.filter((u) => u.startsWith('data:')),
    approvalMode: form.approvalMode,
    minReliability: form.minReliabilityOn ? Number(form.minReliability) : null,
    pricePerSpot: Math.max(0, Number(form.pricePerSpot) || 0),
    ladiesOnly: form.ladiesOnly,
    locationBlurred: blur || (isEditing.value && !!props.event?.locationBlurred),
    exactLat: blur ? pin.value.lat : null,
    exactLng: blur ? pin.value.lng : null,
    featuredPin: form.featuredPin && isPro.value,
    proOnly: form.proOnly && isPro.value
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
      <header class="create-modal__head">
        <div class="create-modal__head-row">
          <h2 class="create-modal__title">{{ isEditing ? 'Edit event' : 'Create an event' }}</h2>
          <button
            type="button"
            class="create-modal__close"
            aria-label="Close"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
        <nav class="create-modal__steps" aria-label="Progress">
          <button
            v-for="s in STEPS"
            :key="s.n"
            type="button"
            class="create-modal__step"
            :class="{
              'create-modal__step--active': step === s.n,
              'create-modal__step--done': step > s.n
            }"
            :disabled="s.n >= step"
            @click="goToStep(s.n)"
          >
            <span class="create-modal__step-dot">{{ step > s.n ? '✓' : s.n }}</span>
            <span class="create-modal__step-label">{{ s.label }}</span>
          </button>
        </nav>
      </header>

      <div class="create-modal__body">
      <template v-if="step === 1">
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
          <svg viewBox="0 0 24 24" class="create-modal__cat-glyph" aria-hidden="true">
            <path :d="cat.glyph" :fill="form.category === key ? '#0b0f19' : cat.color" />
          </svg>
          <span class="create-modal__cat-label">{{ cat.label }}</span>
        </button>
      </div>

      <label class="field-label">
        Photos <span class="create-modal__optional">(optional, up to {{ MAX_PHOTOS }} — the first is the cover)</span>
      </label>
      <div class="create-modal__cover-row">
        <div
          v-for="(photo, i) in photos"
          :key="i"
          class="create-modal__photo"
        >
          <img :src="photo" class="create-modal__cover-preview" alt="" />
          <span v-if="i === 0" class="create-modal__photo-cover-tag">Cover</span>
          <button
            type="button"
            class="create-modal__photo-remove"
            :aria-label="`Remove photo ${i + 1}`"
            @click="removePhoto(i)"
          >
            ✕
          </button>
        </div>
        <button
          v-if="photos.length < MAX_PHOTOS"
          type="button"
          class="btn-ghost create-modal__cover-btn"
          @click="coverInput.click()"
        >
          📷 {{ photos.length ? 'Add more' : 'Add photos' }}
        </button>
        <input
          ref="coverInput"
          class="create-modal__cover-file"
          type="file"
          accept="image/*"
          multiple
          @change="onCoverChange"
        />
      </div>

      </template>

      <template v-if="step === 2">
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
          <button
            id="ev-cap"
            type="button"
            class="field-input create-modal__cap-btn"
            @click="showCapPicker = true"
          >
            👥 {{ form.maxCapacity }} <span class="create-modal__cap-caret">▾</span>
          </button>
        </div>
      </div>

      <button
        v-if="!isPro"
        type="button"
        class="create-modal__cap-badge"
        @click="openPaywall(`Free events are capped at ${FREE_LIMITS.maxCapacity} guests.`)"
      >
        🔒 Up to {{ FREE_LIMITS.maxCapacity }} guests on the free plan — upgrade to Host Pro to expand
      </button>

      </template>

      <template v-if="step === 3">
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
          <input
            v-model="form.minReliabilityOn"
            type="checkbox"
            @click="gatePro($event, canReliabilityLock, 'Reliability locks are a Host Pro feature.')"
          />
          <span>
            <strong>⭐ Minimum reliability <em v-if="!isPro" class="create-modal__pro-tag">👑 PRO</em></strong>
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
            <strong>💳 Cost per person (QAR) <em v-if="!isPro" class="create-modal__pro-tag">👑 PRO</em></strong>
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
          <input
            v-model="form.featuredPin"
            type="checkbox"
            @click="gatePro($event, canFeaturePin, 'Featured glowing pins are a Host Pro perk.')"
          />
          <span>
            <strong>✨ Featured pin <em v-if="!isPro" class="create-modal__pro-tag">👑 PRO</em></strong>
            <em>Your pin glows gold on the map so it stands out to everyone.</em>
          </span>
        </label>

        <label class="create-modal__toggle">
          <input
            v-model="form.proOnly"
            type="checkbox"
            @click="gatePro($event, isPro, 'Restricting an event to Host Pro members is a Pro perk.')"
          />
          <span>
            <strong>👑 Host Pro members only <em v-if="!isPro" class="create-modal__pro-tag">👑 PRO</em></strong>
            <em>Only Host Pro members can join or request a spot.</em>
          </span>
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

      </template>

      <p v-if="error" class="create-modal__error">{{ error }}</p>
      </div>

      <div class="create-modal__actions">
        <button
          v-if="step === 1"
          type="button"
          class="btn-ghost create-modal__back"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button v-else type="button" class="btn-ghost create-modal__back" @click="prevStep">
          ← Back
        </button>
        <button
          v-if="step < STEPS.length"
          type="button"
          class="btn-primary create-modal__next"
          @click="nextStep"
        >
          Next →
        </button>
        <button v-else type="submit" class="btn-primary create-modal__next" :disabled="busy">
          {{ busy ? 'Saving…' : isEditing ? 'Save changes' : 'Publish to map' }}
        </button>
      </div>
    </form>

    <!-- Guest-count picker: the free/pro boundary is visible up front -->
    <div
      v-if="showCapPicker"
      class="create-modal__picker-backdrop"
      @click.self="showCapPicker = false"
    >
      <div class="create-modal__picker glass-panel">
        <h3 class="create-modal__picker-title">Max guests</h3>
        <p v-if="!isPro" class="create-modal__picker-hint">
          Up to {{ FREE_LIMITS.maxCapacity }} guests on the free plan —
          👑 sizes unlock with Host Pro
        </p>
        <div class="create-modal__picker-grid">
          <button
            v-for="n in GUEST_COUNTS"
            :key="n"
            type="button"
            class="create-modal__cap-option"
            :class="{
              'create-modal__cap-option--locked': !isPro && n > FREE_LIMITS.maxCapacity,
              'create-modal__cap-option--active': form.maxCapacity === n
            }"
            @click="pickCapacity(n)"
          >
            {{ n }}<span
              v-if="!isPro && n > FREE_LIMITS.maxCapacity"
              class="create-modal__cap-crown"
            >👑</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Inside the root so the parent's v-show (pick-location flow) keeps
         working — this component must stay single-rooted. -->
    <HostProModal
      v-if="showPaywall"
      :reason="paywallReason"
      @close="showPaywall = false"
    />
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
  display: flex;
  flex-direction: column;
  width: min(480px, 100%);
  max-height: calc(100vh - 48px);
  overflow: hidden;
}

/* Header and footer stay put; only the fields scroll */
.create-modal__head {
  padding: 18px 22px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.create-modal__head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* Step chips */
.create-modal__steps {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
}

.create-modal__step {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 6px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  transition: all 0.18s ease;
  min-width: 0;
}

.create-modal__step-dot {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-secondary);
}

.create-modal__step-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.create-modal__step--active {
  flex: 2.4; /* room for the label; the other two shrink to their dots */
  color: var(--text-primary);
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 100%);
  border-color: transparent;
}

.create-modal__step--active .create-modal__step-dot {
  background: rgba(11, 15, 25, 0.35);
  color: #fff;
}

.create-modal__step--done {
  color: var(--success);
  border-color: rgba(45, 212, 160, 0.4);
  background: rgba(45, 212, 160, 0.1);
  cursor: pointer;
}

.create-modal__step--done .create-modal__step-dot {
  background: rgba(45, 212, 160, 0.25);
  color: var(--success);
}

.create-modal__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 22px 18px;
  overscroll-behavior: contain;
}

.create-modal__title {
  font-size: 19px;
  font-weight: 700;
}

.create-modal__close {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  font-size: 13px;
}

.create-modal__close:hover {
  background: rgba(255, 255, 255, 0.16);
  color: var(--text-primary);
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

/* Icon grid — same glyphs as the map pins, four per row */
.create-modal__categories {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.create-modal__cat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 5px;
  padding: 10px 4px 8px;
  border-radius: var(--radius-md);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  transition: all 0.15s ease;
}

.create-modal__cat:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.create-modal__cat-glyph {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
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
  flex-wrap: wrap;
}

.create-modal__photo {
  position: relative;
}

.create-modal__cover-preview {
  display: block;
  width: 104px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
}

.create-modal__photo-cover-tag {
  position: absolute;
  left: 4px;
  bottom: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: rgba(212, 175, 106, 0.9);
  color: #0b0f19;
}

.create-modal__photo-remove {
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

.create-modal__photo-remove:hover {
  color: var(--danger);
  border-color: var(--danger);
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

.create-modal__cap-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  text-align: left;
  cursor: pointer;
}

.create-modal__cap-caret {
  color: var(--text-secondary);
  font-size: 11px;
}

.create-modal__picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 8, 15, 0.55);
  padding: 16px;
}

.create-modal__picker {
  width: min(340px, 100%);
  padding: 20px;
}

.create-modal__picker-title {
  font-size: 16px;
  font-weight: 700;
}

.create-modal__picker-hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--gold);
}

.create-modal__picker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 14px;
}

.create-modal__cap-option {
  position: relative;
  padding: 11px 4px;
  border-radius: var(--radius-sm);
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  font-variant-numeric: tabular-nums;
}

.create-modal__cap-option:hover {
  background: rgba(255, 255, 255, 0.12);
}

.create-modal__cap-option--active {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 100%);
  border-color: rgba(255, 255, 255, 0.3);
}

.create-modal__cap-option--locked {
  color: var(--gold);
  background: rgba(212, 175, 106, 0.07);
  border: 1px dashed rgba(212, 175, 106, 0.4);
}

.create-modal__cap-crown {
  position: absolute;
  top: -7px;
  right: -4px;
  font-size: 10px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
}

.create-modal__cap-badge {
  display: block;
  width: 100%;
  text-align: left;
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: rgba(212, 175, 106, 0.1);
  border: 1px dashed rgba(212, 175, 106, 0.4);
  color: var(--gold);
  font-size: 12px;
  line-height: 1.4;
}

.create-modal__cap-badge:hover {
  background: rgba(212, 175, 106, 0.16);
}

/* Specific enough to beat `.create-modal__toggle em { display: block }` */
.create-modal__toggle .create-modal__pro-tag,
.create-modal__pro-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 9.5px;
  font-style: normal;
  font-weight: 800;
  letter-spacing: 0.05em;
  background: rgba(212, 175, 106, 0.18);
  border: 1px solid rgba(212, 175, 106, 0.45);
  color: var(--gold);
  vertical-align: 1px;
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
  padding: 14px 22px;
  border-top: 1px solid var(--border-subtle);
  background: rgba(13, 18, 30, 0.5);
}

@media (max-width: 560px) {
  /* Full-screen sheet on phones: no wasted margins, header and the
     publish button always reachable without scrolling */
  .modal-backdrop {
    padding: 0;
    align-items: stretch;
  }

  .create-modal {
    width: 100%;
    max-height: none;
    height: 100dvh;
    border-radius: 0;
    border-left: none;
    border-right: none;
  }

  .create-modal__head {
    padding: max(14px, env(safe-area-inset-top)) 16px 12px;
  }

  .create-modal__body {
    padding: 4px 16px 16px;
  }

  .create-modal__actions {
    padding: 12px 16px max(12px, env(safe-area-inset-bottom));
  }

  .create-modal__next {
    flex: 1;
  }

  .create-modal__step-label {
    display: none;
  }

  .create-modal__step--active .create-modal__step-label {
    display: inline;
  }

  .create-modal__row {
    grid-template-columns: 1fr 1fr;
  }

  .create-modal__row > div:first-child {
    grid-column: 1 / -1;
  }

  .create-modal .field-label {
    margin-top: 12px;
  }

  .create-modal__extras {
    padding: 12px;
  }
}
</style>
