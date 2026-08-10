<script setup>
/**
 * MapSearchPanel — one search box for the whole map.
 *
 * Three kinds of answer in one ranked list, so nobody has to pick a
 * search mode first:
 *   🎉 Events  — matched in memory against what's already loaded
 *   👤 People  — organizers and members, also in memory
 *   📍 Places  — geocoded, and only asked for once the local matches
 *                have had their say (they are instant and free)
 *
 * Arrow keys walk the flattened list, Enter opens, Escape closes.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useEventStore } from '@/stores/eventStore'
import { categoryOf, pinColorOf } from '@/config/categories'
import { formatWhen } from '@/utils/datetime'
import { searchPlaces } from '@/utils/geocode'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'

const emit = defineEmits(['close', 'select-event', 'select-person', 'select-place'])

const eventStore = useEventStore()

const query = ref('')
const places = ref([])
const searchingPlaces = ref(false)
const placesFailed = ref(false)
const active = ref(0)
const inputEl = ref(null)
let timer = null
let requestId = 0

onMounted(() => inputEl.value?.focus())

const term = computed(() => query.value.trim().toLowerCase())

/**
 * Ranks matches so a title that *starts* with what you typed beats one
 * that merely contains it — "pad" should surface "Padel doubles" first.
 */
function score(haystack) {
  const text = (haystack || '').toLowerCase()
  const at = text.indexOf(term.value)
  if (at === -1) return -1
  return at === 0 ? 2 : 1
}

function best(...fields) {
  return Math.max(...fields.map(score))
}

const eventHits = computed(() => {
  if (term.value.length < 2) return []
  return eventStore.visibleEvents
    .map((event) => ({
      event,
      rank: best(event.title, event.locationName, categoryOf(event.category).label)
    }))
    .filter((hit) => hit.rank > 0)
    .sort((a, b) => b.rank - a.rank || new Date(a.event.startsAt) - new Date(b.event.startsAt))
    .slice(0, 5)
    .map((hit) => hit.event)
})

const peopleHits = computed(() => {
  if (term.value.length < 2) return []
  return eventStore.members
    .map((member) => ({ member, rank: score(member.name) }))
    .filter((hit) => hit.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 4)
    .map((hit) => hit.member)
})

/** How many events each person is hosting — the reason to tap them. */
function hostingCount(memberId) {
  return eventStore.visibleEvents.filter((e) => e.hostId === memberId).length
}

/* Flattened for keyboard navigation, in the order they are rendered. */
const flat = computed(() => [
  ...eventHits.value.map((event) => ({ kind: 'event', event })),
  ...peopleHits.value.map((member) => ({ kind: 'person', member })),
  ...places.value.map((place) => ({ kind: 'place', place }))
])

const empty = computed(
  () =>
    term.value.length >= 2 &&
    !flat.value.length &&
    !searchingPlaces.value &&
    !placesFailed.value
)

watch(term, (value) => {
  active.value = 0
  clearTimeout(timer)
  placesFailed.value = false
  if (value.length < 2) {
    places.value = []
    searchingPlaces.value = false
    return
  }
  timer = setTimeout(() => lookupPlaces(value), 350)
})

async function lookupPlaces(value) {
  const id = ++requestId
  searchingPlaces.value = true
  try {
    const found = await searchPlaces(value, 4)
    if (id !== requestId) return // a newer keystroke already won
    places.value = found
  } catch {
    if (id !== requestId) return
    places.value = []
    placesFailed.value = true
  } finally {
    if (id === requestId) searchingPlaces.value = false
  }
}

function move(step) {
  if (!flat.value.length) return
  active.value = (active.value + step + flat.value.length) % flat.value.length
  nextTick(() => {
    document
      .querySelector('.map-search-panel__result--active')
      ?.scrollIntoView({ block: 'nearest' })
  })
}

function choose(item) {
  if (!item) return
  if (item.kind === 'event') emit('select-event', item.event.id)
  else if (item.kind === 'person') emit('select-person', item.member.id)
  else emit('select-place', item.place)
}

function onEnter() {
  choose(flat.value[active.value])
}

/** Index of an entry within the flat list, for the active highlight. */
function indexOf(kind, i) {
  if (kind === 'event') return i
  if (kind === 'person') return eventHits.value.length + i
  return eventHits.value.length + peopleHits.value.length + i
}
</script>

<template>
  <div class="map-search-panel glass-panel">
    <div class="map-search-panel__row">
      <span class="map-search-panel__icon">🔍</span>
      <input
        ref="inputEl"
        v-model="query"
        class="map-search-panel__input"
        type="text"
        placeholder="Search events, organizers or places…"
        autocomplete="off"
        aria-label="Search events, organizers or places"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="onEnter"
        @keydown.esc.prevent="emit('close')"
      />
      <button class="map-search-panel__close" aria-label="Close search" @click="emit('close')">
        ✕
      </button>
    </div>

    <div v-if="term.length >= 2" class="map-search-panel__results scroll-quiet">
      <template v-if="eventHits.length">
        <p class="map-search-panel__group">Events</p>
        <button
          v-for="(event, i) in eventHits"
          :key="event.id"
          type="button"
          class="map-search-panel__result"
          :class="{ 'map-search-panel__result--active': active === indexOf('event', i) }"
          @click="emit('select-event', event.id)"
          @mouseenter="active = indexOf('event', i)"
        >
          <span class="map-search-panel__glyph" :style="{ background: `${pinColorOf(event)}22` }">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path :d="categoryOf(event.category).glyph" :fill="pinColorOf(event)" />
            </svg>
          </span>
          <span class="map-search-panel__text">
            <span class="map-search-panel__name">{{ event.title }}</span>
            <span class="map-search-panel__detail">
              {{ event.locationName }} · {{ formatWhen(event.startsAt) }}
            </span>
          </span>
        </button>
      </template>

      <template v-if="peopleHits.length">
        <p class="map-search-panel__group">People</p>
        <button
          v-for="(member, i) in peopleHits"
          :key="member.id"
          type="button"
          class="map-search-panel__result"
          :class="{ 'map-search-panel__result--active': active === indexOf('person', i) }"
          @click="emit('select-person', member.id)"
          @mouseenter="active = indexOf('person', i)"
        >
          <MemberAvatar :member="member" :size="30" />
          <span class="map-search-panel__text">
            <span class="map-search-panel__name">{{ member.name }}</span>
            <span class="map-search-panel__detail">
              {{
                hostingCount(member.id)
                  ? `Hosting ${hostingCount(member.id)} event${hostingCount(member.id) > 1 ? 's' : ''}`
                  : 'View profile'
              }}
            </span>
          </span>
        </button>
      </template>

      <template v-if="places.length">
        <p class="map-search-panel__group">Places</p>
        <button
          v-for="(place, i) in places"
          :key="`${place.lat},${place.lng},${i}`"
          type="button"
          class="map-search-panel__result"
          :class="{ 'map-search-panel__result--active': active === indexOf('place', i) }"
          @click="emit('select-place', place)"
          @mouseenter="active = indexOf('place', i)"
        >
          <span class="map-search-panel__glyph map-search-panel__glyph--place">📍</span>
          <span class="map-search-panel__text">
            <span class="map-search-panel__name">{{ place.name }}</span>
            <span v-if="place.detail" class="map-search-panel__detail">{{ place.detail }}</span>
          </span>
        </button>
      </template>

      <p v-if="searchingPlaces" class="map-search-panel__note">Looking up places…</p>
      <p v-else-if="empty" class="map-search-panel__note">
        Nothing matched “{{ query.trim() }}”.
      </p>
      <p v-else-if="placesFailed && !flat.length" class="map-search-panel__note">
        Place search is unavailable right now — events and people still work.
      </p>
    </div>

    <p v-else class="map-search-panel__note">
      Find a plan, an organizer, or anywhere in Qatar.
    </p>
  </div>
</template>

<style scoped>
.map-search-panel {
  width: min(440px, calc(100vw - 24px));
  padding: 6px;
  pointer-events: auto;
}

.map-search-panel__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
}

.map-search-panel__icon {
  font-size: 15px;
  flex-shrink: 0;
}

.map-search-panel__input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  color: var(--text-primary);
  /* 16px keeps iOS Safari from zooming the whole map on focus */
  font-size: 16px;
  padding: 10px 0;
}

.map-search-panel__input::placeholder {
  color: rgba(154, 165, 184, 0.6);
}

.map-search-panel__close {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: var(--text-secondary);
  font-size: 13px;
}

.map-search-panel__close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.map-search-panel__results {
  border-top: 1px solid var(--border-subtle);
  margin-top: 4px;
  padding-top: 4px;
  max-height: min(60vh, 380px);
  overflow-y: auto;
}

.map-search-panel__group {
  padding: 6px 10px 3px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.map-search-panel__result {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
}

.map-search-panel__result--active {
  background: rgba(255, 255, 255, 0.09);
}

.map-search-panel__glyph {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
}

.map-search-panel__glyph svg {
  width: 17px;
  height: 17px;
}

.map-search-panel__glyph--place {
  background: rgba(255, 255, 255, 0.07);
}

.map-search-panel__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.map-search-panel__name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-search-panel__detail {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-search-panel__note {
  padding: 10px;
  font-size: 12.5px;
  color: var(--text-secondary);
}
</style>
