<script setup>
/**
 * EventListPanel — browsable feed of upcoming events alongside the map.
 * Tapping a row selects the event (the map flies to its pin).
 */
import { computed } from 'vue'
import { useEventStore } from '@/stores/eventStore'
import { categoryOf } from '@/config/categories'
import { formatWhen, isLive } from '@/utils/datetime'

const emit = defineEmits(['close', 'select'])

const eventStore = useEventStore()

const upcoming = computed(() =>
  [...eventStore.visibleEvents].sort(
    (a, b) => new Date(a.startsAt) - new Date(b.startsAt)
  )
)
</script>

<template>
  <aside class="event-list glass-panel">
    <header class="event-list__head">
      <h2 class="event-list__title">What's on</h2>
      <button class="event-list__close" aria-label="Close" @click="emit('close')">✕</button>
    </header>

    <div class="event-list__windows">
      <button
        v-for="win in [
          { key: 'all', label: 'All' },
          { key: 'now', label: 'Now' },
          { key: 'today', label: 'Today' },
          { key: 'week', label: 'Week' }
        ]"
        :key="win.key"
        class="event-list__window"
        :class="{ 'event-list__window--active': eventStore.timeWindow === win.key }"
        @click="eventStore.setTimeWindow(win.key)"
      >
        {{ win.label }}
      </button>
    </div>

    <p v-if="!upcoming.length" class="event-list__empty">
      Nothing on the map right now — be the first to drop an event!
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
          {{ event.title }}
          <span v-if="isLive(event)" class="event-list__live">LIVE</span>
        </span>
        <span class="event-list__meta">
          {{ event.locationName }} · {{ formatWhen(event.startsAt) }}
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
  max-height: min(60vh, 480px);
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
  margin-bottom: 10px;
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
}

.event-list__window--active {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 100%);
  color: #fff;
  border-color: transparent;
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
