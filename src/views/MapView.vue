<script setup>
/**
 * MapView — the home screen. Fullscreen live map with:
 *   - TopBar (brand, category filters, profile)
 *   - EventCard bottom sheet when a pin is selected
 *   - Pick mode + CreateEventModal for dropping new event pins
 */
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import LiveMap from '@/components/map/LiveMap.vue'
import TopBar from '@/components/layout/TopBar.vue'
import EventCard from '@/components/events/EventCard.vue'
import CreateEventModal from '@/components/events/CreateEventModal.vue'
import { useEventStore } from '@/stores/eventStore'

const eventStore = useEventStore()

const liveMap = ref(null)
const pickMode = ref(false)
const pickedCoords = ref(null)
const showCreateModal = ref(false)

const selectedEvent = computed(() => eventStore.selectedEvent)

onMounted(() => {
  eventStore.load()
})

onBeforeUnmount(() => {
  eventStore.stopRealtime()
})

function onSelect(eventId) {
  if (pickMode.value) return
  eventStore.select(eventId)
}

function startPicking() {
  eventStore.clearSelection()
  pickMode.value = true
  pickedCoords.value = null
}

function cancelPicking() {
  pickMode.value = false
  pickedCoords.value = null
}

function onPick(coords) {
  pickedCoords.value = coords
  showCreateModal.value = true
}

function onModalClose() {
  showCreateModal.value = false
  // Keep pick mode active so the member can adjust the pin position
}

function onCreated() {
  showCreateModal.value = false
  pickMode.value = false
  liveMap.value?.clearDraftPin()
}
</script>

<template>
  <div class="map-view">
    <LiveMap
      ref="liveMap"
      :events="eventStore.visibleEvents"
      :selected-id="eventStore.selectedEventId"
      :pick-mode="pickMode"
      @select="onSelect"
      @pick="onPick"
    />

    <TopBar />

    <!-- Floating map controls -->
    <div class="map-view__controls">
      <button class="map-view__ctrl glass-panel" title="Reset view" @click="liveMap?.resetView()">🇶🇦</button>
      <button class="map-view__ctrl glass-panel" title="My location" @click="liveMap?.locateMe()">📍</button>
    </div>

    <!-- Quick-post -->
    <div class="map-view__fab-area">
      <Transition name="fade">
        <div v-if="pickMode && !showCreateModal" class="map-view__hint glass-panel">
          Tap anywhere on the map to drop your event pin
          <button class="map-view__hint-cancel" @click="cancelPicking">Cancel</button>
        </div>
      </Transition>
      <button v-if="!pickMode" class="btn-primary map-view__fab" @click="startPicking">
        ＋ Drop an event
      </button>
    </div>

    <!-- Event bottom sheet -->
    <Transition name="slide-up">
      <div v-if="selectedEvent" class="map-view__sheet">
        <EventCard :event="selectedEvent" @close="eventStore.clearSelection()" />
      </div>
    </Transition>

    <!-- Quick-post form -->
    <Transition name="fade">
      <CreateEventModal
        v-if="showCreateModal && pickedCoords"
        :coords="pickedCoords"
        @close="onModalClose"
        @created="onCreated"
      />
    </Transition>
  </div>
</template>

<style scoped>
.map-view {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.map-view__controls {
  position: absolute;
  right: 14px;
  bottom: 132px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.map-view__ctrl {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  font-size: 19px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.map-view__fab-area {
  position: absolute;
  bottom: max(22px, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.map-view__fab {
  padding: 15px 30px;
  font-size: 16px;
}

.map-view__hint {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 18px;
  font-size: 14px;
  white-space: nowrap;
}

.map-view__hint-cancel {
  color: var(--accent-bright);
  font-weight: 700;
  font-size: 13px;
}

.map-view__sheet {
  position: absolute;
  z-index: 50;
  left: 50%;
  bottom: max(18px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
}
</style>
