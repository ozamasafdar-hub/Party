<script setup>
/**
 * TimePills — floating time filters over the map ("when is it happening?").
 * Mirrors eventStore.timeWindow, so the list panel chips stay in sync.
 */
import { useEventStore } from '@/stores/eventStore'

const emit = defineEmits(['changed'])

const eventStore = useEventStore()

const PILLS = [
  { key: 'all', label: 'All' },
  { key: 'now', label: '🔥 Now' },
  { key: 'tonight', label: '🌙 Tonight' },
  { key: 'tomorrow', label: '📅 Tomorrow' },
  { key: 'weekend', label: '🎉 Weekend' }
]

function pickWindow(key, label) {
  eventStore.setTimeWindow(key)
  emit('changed', label)
}

function pickMode(mode, label) {
  eventStore.setMapMode(mode)
  emit('changed', label)
}
</script>

<template>
  <div class="time-pills">
    <template v-if="eventStore.mapMode === 'live'">
      <button
        v-for="pill in PILLS"
        :key="pill.key"
        class="time-pills__pill"
        :class="{ 'time-pills__pill--active': eventStore.timeWindow === pill.key }"
        @click="pickWindow(pill.key, pill.label)"
      >
        {{ pill.label }}
      </button>
    </template>
    <button
      v-else
      class="time-pills__pill"
      @click="pickMode('live', '📍 Live events')"
    >
      📍 Live events
    </button>
    <button
      class="time-pills__pill time-pills__pill--memory"
      :class="{ 'time-pills__pill--memory-active': eventStore.mapMode === 'memories' }"
      @click="
        pickMode(
          eventStore.mapMode === 'memories' ? 'live' : 'memories',
          eventStore.mapMode === 'memories' ? '📍 Live events' : '📸 Past 24h recaps'
        )
      "
    >
      📸 Past 24h recaps
    </button>
  </div>
</template>

<style scoped>
/**
 * The row is narrower than the screen — it keeps clear of the map controls
 * stacked on the right — so there is always more here than fits, and the
 * pill that straddles the edge used to be guillotined: a dead-straight
 * vertical cut through a rounded shape, which is the one genuinely square
 * edge in the whole control. The mask fades those last few pixels instead,
 * so a pill leaving the row dissolves rather than hitting a wall. The
 * padding is the lead-in the fade eats into, so the first pill sits clear
 * of it when the row has not been scrolled.
 */
.time-pills {
  display: flex;
  gap: 8px;
  align-self: stretch;
  overflow-x: auto;
  padding: 4px 16px;
  scrollbar-width: none;
  scroll-snap-type: x proximity;
  scroll-padding: 0 16px;
  -webkit-mask-image: linear-gradient(
    90deg,
    transparent 0,
    #000 16px,
    #000 calc(100% - 16px),
    transparent 100%
  );
  mask-image: linear-gradient(
    90deg,
    transparent 0,
    #000 16px,
    #000 calc(100% - 16px),
    transparent 100%
  );
}

/**
 * Below this width the FAB column is pinned by `calc(100vw - 136px)`, which
 * is symmetric — it reserves as much room on the left, where nothing sits,
 * as on the right, where the map controls do. Take the empty side back:
 * one more pill fits before anything has to scroll.
 */
@media (max-width: 695px) {
  .time-pills {
    margin-left: -54px;
  }
}

.time-pills::-webkit-scrollbar {
  display: none;
}

/**
 * These were already `border-radius: 999px`, and still read as slabs: a
 * flat fill on a shape three times wider than it is tall looks like a bar
 * with two caps stuck on the ends. What makes a dark shape read as *curved*
 * is light falling across it — the top-down highlight gradient and the
 * inset hairline — plus enough height that the caps are a real part of the
 * silhouette rather than a detail.
 */
.time-pills__pill {
  flex-shrink: 0;
  scroll-snap-align: start;
  /* Set the height rather than let padding plus font metrics land wherever
     they land — an emoji changes the line box, and the radius reads as a
     true capsule only when the height is the number we chose */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 18px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0) 55%),
    rgba(15, 20, 32, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.13);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.13),
    0 4px 14px rgba(0, 0, 0, 0.32);
  transition: all 0.15s ease;
}

/**
 * Two things make a naked :hover wrong here.
 *
 * A tap on a touch screen leaves the hover stuck on the pill you just
 * pressed, so `hover: hover` keeps this to devices with a real pointer.
 * And `:hover` outscores a `--active` modifier — one class plus a
 * pseudo-class against one class — so without the :not() it paints a
 * translucent white over whichever pill is selected, whatever the order
 * the rules are written in. Over a light basemap that is invisible.
 */
@media (hover: hover) {
  .time-pills__pill:not(.time-pills__pill--active):not(.time-pills__pill--memory-active):hover {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.03) 55%),
      rgba(28, 36, 52, 0.94);
    border-color: rgba(255, 255, 255, 0.22);
  }
}

/* Every state keeps the highlight layer on top — drop it and that state
   alone flattens back into a slab */
.time-pills__pill--active {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 60%),
    linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 100%);
  border-color: rgba(255, 255, 255, 0.28);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 4px 16px rgba(139, 21, 56, 0.45);
}

.time-pills__pill--memory {
  border-color: rgba(167, 139, 250, 0.45);
}

.time-pills__pill--memory-active {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 60%),
    linear-gradient(135deg, #7c5cd6 0%, #a78bfa 60%, #d4af6a 130%);
  border-color: rgba(255, 255, 255, 0.32);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 6px 20px rgba(167, 139, 250, 0.5);
}
</style>
