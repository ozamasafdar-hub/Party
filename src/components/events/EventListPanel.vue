<script setup>
/**
 * EventListPanel — browsable feed of upcoming events alongside the map.
 * Filters: time window (All/Now/Today/Week), "Mine" (my plans), and a
 * "Nearest" sort once the member shares their location. Friends' events
 * get a ⭐. Tapping a row selects the event (the map flies to its pin).
 */
import { computed, ref } from 'vue'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { useFollowStore } from '@/stores/followStore'
import { categoryOf } from '@/config/categories'
import { formatWhen, isLive } from '@/utils/datetime'
import { distanceKm, formatDistance } from '@/utils/geo'

const emit = defineEmits(['close', 'select', 'need-location'])

const eventStore = useEventStore()
const authStore = useAuthStore()
const followStore = useFollowStore()

const sortNearest = ref(false)

const WINDOWS = [
  { key: 'all', label: 'All' },
  { key: 'now', label: 'Now' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' }
]

function toggleNearest() {
  sortNearest.value = !sortNearest.value
  if (sortNearest.value && !eventStore.userLocation) emit('need-location')
}

function distanceTo(event) {
  const here = eventStore.userLocation
  if (!here) return null
  return distanceKm(here, event)
}

const upcoming = computed(() => {
  const events = [...eventStore.visibleEvents]
  if (sortNearest.value && eventStore.userLocation) {
    return events.sort((a, b) => distanceTo(a) - distanceTo(b))
  }
  return events.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
})
</script>

<template>
  <aside class="event-list glass-panel">
    <header class="event-list__head">
      <h2 class="event-list__title">What's on</h2>
      <button class="event-list__close" aria-label="Close" @click="emit('close')">✕</button>
    </header>

    <div class="event-list__windows">
      <button
        v-for="win in WINDOWS"
        :key="win.key"
        class="event-list__window"
        :class="{ 'event-list__window--active': eventStore.timeWindow === win.key }"
        @click="eventStore.setTimeWindow(win.key)"
      >
        {{ win.label }}
      </button>
    </div>

    <div class="event-list__windows">
      <button
        v-if="authStore.isAuthenticated"
        class="event-list__window"
        :class="{ 'event-list__window--gold': eventStore.onlyMine }"
        @click="eventStore.setOnlyMine(!eventStore.onlyMine)"
      >
        ⭐ Mine
      </button>
      <button
        class="event-list__window"
        :class="{ 'event-list__window--gold': sortNearest }"
        @click="toggleNearest"
      >
        📏 Nearest
      </button>
    </div>

    <p v-if="!upcoming.length" class="event-list__empty">
      Nothing here right now — try another filter, or be the first to create an event!
    </p>

    <button
      v-for="event in upcoming"
      :key="event.id"
      class="event-list__row"
      @click="emit('select', event.id)"
    >
      <span class="event-list__dot" :style="{ background: categoryOf(event.category).color }" />
      <span class="event-list__body">
        <span class="event-list__row-title">
          <template v-if="followStore.isFriendEvent(event)">⭐ </template>{{ event.title }}
          <span v-if="isLive(event)" class="event-list__live">LIVE</span>
        </span>
        <span class="event-list__meta">
          {{ event.locationName }} · {{ formatWhen(event.startsAt)
          }}<template v-if="distanceTo(event) !== null">
            · {{ formatDistance(distanceTo(event)) }}</template>
        </span>
      </span>
      <span class="event-list__count">
        {{ event.attendeeIds.length }}/{{ event.maxCapacity }}
      </span>
    </button>
  </aside>
</template>

<style scoped>
.event-list {
  width: min(360px, calc(100vw - 24px));
  max-height: min(64vh, 520px);
  overflow-y: auto;
  padding: 16px;
}

.event-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.event-list__title {
  font-size: 16px;
  font-weight: 700;
}

.event-list__close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  font-size: 12px;
}

.event-list__windows {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.event-list__window {
  flex: 1;
  padding: 7px 0;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  transition: all 0.15s ease;
  white-space: nowrap;
}

.event-list__window--active {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 100%);
  color: #fff;
  border-color: transparent;
}

.event-list__window--gold {
  background: rgba(212, 175, 106, 0.22);
  color: var(--gold);
  border-color: rgba(212, 175, 106, 0.5);
}

.event-list__empty {
  font-size: 13.5px;
  color: var(--text-secondary);
  padding: 8px 2px 4px;
  line-height: 1.5;
}

.event-list__row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 11px 10px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.event-list__row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.event-list__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.event-list__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.event-list__row-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-list__live {
  margin-left: 6px;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--success);
}

.event-list__meta {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-list__count {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-secondary);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
</style>
