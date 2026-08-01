<script setup>
/**
 * TimePills — floating time filters over the map ("when is it happening?").
 * Mirrors eventStore.timeWindow, so the list panel chips stay in sync.
 */
import { useEventStore } from '@/stores/eventStore'

const eventStore = useEventStore()

const PILLS = [
  { key: 'all', label: 'All' },
  { key: 'now', label: '🔥 Now' },
  { key: 'tonight', label: '🌙 Tonight' },
  { key: 'tomorrow', label: '📅 Tomorrow' },
  { key: 'weekend', label: '🎉 Weekend' }
]
</script>

<template>
  <div class="time-pills">
    <template v-if="eventStore.mapMode === 'live'">
      <button
        v-for="pill in PILLS"
        :key="pill.key"
        class="time-pills__pill"
        :class="{ 'time-pills__pill--active': eventStore.timeWindow === pill.key }"
        @click="eventStore.setTimeWindow(pill.key)"
      >
        {{ pill.label }}
      </button>
    </template>
    <button
      v-else
      class="time-pills__pill"
      @click="eventStore.setMapMode('live')"
    >
      📍 Live events
    </button>
    <button
      class="time-pills__pill time-pills__pill--memory"
      :class="{ 'time-pills__pill--memory-active': eventStore.mapMode === 'memories' }"
      @click="eventStore.setMapMode(eventStore.mapMode === 'memories' ? 'live' : 'memories')"
    >
      📸 Past 24h recaps
    </button>
  </div>
</template>

<style scoped>
.time-pills {
  display: flex;
  gap: 8px;
  max-width: calc(100vw - 24px);
  overflow-x: auto;
  padding: 4px;
  scrollbar-width: none;
}

.time-pills::-webkit-scrollbar {
  display: none;
}

.time-pills__pill {
  flex-shrink: 0;
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  background: rgba(13, 18, 30, 0.82);
  border: 1px solid var(--border-subtle);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  transition: all 0.15s ease;
}

.time-pills__pill:hover {
  background: rgba(255, 255, 255, 0.12);
}

.time-pills__pill--active {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 100%);
  border-color: rgba(255, 255, 255, 0.25);
  box-shadow: 0 4px 18px rgba(139, 21, 56, 0.5);
}

.time-pills__pill--memory {
  border-color: rgba(167, 139, 250, 0.45);
}

.time-pills__pill--memory-active {
  background: linear-gradient(135deg, #7c5cd6 0%, #a78bfa 60%, #d4af6a 130%);
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 4px 18px rgba(167, 139, 250, 0.5);
}
</style>
