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
import { categoryOf, pinColorOf } from '@/config/categories'
import { formatWhen, formatDay, isLive } from '@/utils/datetime'
import { distanceKm, formatDistance } from '@/utils/geo'

const emit = defineEmits(['close', 'select', 'need-location'])

const eventStore = useEventStore()
const authStore = useAuthStore()
const followStore = useFollowStore()

const sortNearest = ref(false)

const WINDOWS = [
  { key: 'all', label: 'All' },
  { key: 'now', label: '🔥 Now' },
  { key: 'tonight', label: '🌙 Tonight' },
  { key: 'tomorrow', label: '📅 Tomorrow' },
  { key: 'weekend', label: '🎉 Weekend' },
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

/** Rows grouped under day headers (flat when sorting by distance). */
const grouped = computed(() => {
  if (sortNearest.value && eventStore.userLocation) {
    return [{ label: '📏 Nearest first', events: upcoming.value }]
  }
  const groups = []
  for (const event of upcoming.value) {
    const label = formatDay(event.startsAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.events.push(event)
    else groups.push({ label, events: [event] })
  }
  return groups
})

/* Capacity ring around the guest count */
const RING_CIRC = 2 * Math.PI * 15.5

function ringDash(event) {
  const pct = Math.min(1, event.attendeeIds.length / event.maxCapacity)
  return `${RING_CIRC * pct} ${RING_CIRC}`
}

function ringColor(event) {
  return event.attendeeIds.length >= event.maxCapacity
    ? 'var(--danger)'
    : 'var(--success)'
}

function hideBrokenImage(event) {
  event.target.style.display = 'none' // category glyph shows through
}
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

    <template v-for="group in grouped" :key="group.label">
      <div class="event-list__day">{{ group.label }}</div>
      <button
        v-for="event in group.events"
        :key="event.id"
        class="event-list__row"
        @click="emit('select', event.id)"
      >
        <span
          class="event-list__thumb"
          :style="{ background: `${pinColorOf(event)}22` }"
        >
          <svg viewBox="0 0 24 24" class="event-list__thumb-glyph" aria-hidden="true">
            <path :d="categoryOf(event.category).glyph" :fill="pinColorOf(event)" />
          </svg>
          <img
            v-if="event.coverUrl"
            :src="event.coverUrl"
            alt=""
            class="event-list__thumb-img"
            loading="lazy"
            @error="hideBrokenImage"
          />
          <span
            v-if="isLive(event)"
            class="event-list__thumb-live"
            title="Happening now"
          />
        </span>
        <span class="event-list__body">
          <span class="event-list__row-title">
            <template v-if="followStore.isFriendEvent(event)">⭐ </template>{{ event.title }}
          </span>
          <span
            v-if="isLive(event) || event.featuredPin || Number(event.pricePerSpot) > 0 || event.ladiesOnly || event.approvalMode"
            class="event-list__badges"
          >
            <span v-if="isLive(event)" class="event-list__badge event-list__badge--live">● LIVE</span>
            <span v-if="event.featuredPin" class="event-list__badge event-list__badge--gold">✨ Featured</span>
            <span v-if="Number(event.pricePerSpot) > 0" class="event-list__badge event-list__badge--gold">
              QAR {{ Number(event.pricePerSpot).toFixed(0) }}
            </span>
            <span v-if="event.ladiesOnly" class="event-list__badge event-list__badge--ladies">🚺</span>
            <span v-if="event.approvalMode" class="event-list__badge">✋ approval</span>
          </span>
          <span class="event-list__meta">
            {{ event.locationName }} · {{ formatWhen(event.startsAt)
            }}<template v-if="distanceTo(event) !== null">
              · {{ formatDistance(distanceTo(event)) }}</template>
          </span>
        </span>
        <svg class="event-list__ring" viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r="15.5" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="3.4" />
          <circle
            cx="20"
            cy="20"
            r="15.5"
            fill="none"
            :stroke="ringColor(event)"
            stroke-width="3.4"
            stroke-linecap="round"
            :stroke-dasharray="ringDash(event)"
            transform="rotate(-90 20 20)"
          />
          <text x="20" y="23.4" text-anchor="middle" class="event-list__ring-text">
            {{ event.attendeeIds.length }}/{{ event.maxCapacity }}
          </text>
        </svg>
      </button>
    </template>
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

.event-list__day {
  margin: 12px 2px 6px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.event-list__day:first-of-type {
  margin-top: 4px;
}

.event-list__row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 8px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}

.event-list__row:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--border-subtle);
  transform: translateX(3px);
}

.event-list__thumb {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 13px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.09);
}

.event-list__thumb-glyph {
  width: 22px;
  height: 22px;
}

.event-list__thumb-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.event-list__thumb-live {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--success);
  border: 2px solid rgba(11, 15, 25, 0.9);
  animation: live-blink 1.6s ease-in-out infinite;
}

.event-list__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.event-list__row-title {
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-list__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.event-list__badge {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.04em;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  white-space: nowrap;
}

.event-list__badge--live {
  background: rgba(45, 212, 160, 0.14);
  border-color: rgba(45, 212, 160, 0.45);
  color: var(--success);
}

.event-list__badge--gold {
  background: rgba(212, 175, 106, 0.13);
  border-color: rgba(212, 175, 106, 0.42);
  color: var(--gold);
}

.event-list__badge--ladies {
  background: rgba(244, 114, 182, 0.13);
  border-color: rgba(244, 114, 182, 0.45);
  color: #f9a8d4;
}

.event-list__meta {
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-list__ring {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.event-list__ring-text {
  font-size: 9.5px;
  font-weight: 700;
  fill: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

@keyframes live-blink {
  50% {
    opacity: 0.45;
  }
}
</style>
