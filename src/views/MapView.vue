<script setup>
/**
 * MapView — the home screen. Fullscreen live map with:
 *   - TopBar (brand, category filters, profile)
 *   - EventCard bottom sheet when a pin is selected
 *   - EventListPanel ("What's on") feed
 *   - Pick mode + CreateEventModal for dropping new event pins
 *   - Edit mode reusing the same modal for hosts
 */
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import LiveMap from '@/components/map/LiveMap.vue'
import TopBar from '@/components/layout/TopBar.vue'
import EventCard from '@/components/events/EventCard.vue'
import CreateEventModal from '@/components/events/CreateEventModal.vue'
import EventListPanel from '@/components/events/EventListPanel.vue'
import LoginPanel from '@/components/auth/LoginPanel.vue'
import MapStyleControl from '@/components/map/MapStyleControl.vue'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { useNotifStore } from '@/stores/notifStore'
import { BASEMAPS, DEFAULT_BASEMAP } from '@/config/map'

const route = useRoute()
const eventStore = useEventStore()
const authStore = useAuthStore()
const notifStore = useNotifStore()

const STYLE_KEY = 'wyn:map-style'
const HEAT_KEY = 'wyn:map-heat'

const readPref = (key) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const writePref = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* sandboxed iframe — preference just won't persist */
  }
}

const liveMap = ref(null)
const pickMode = ref(false)
const pickedCoords = ref(null)
const showCreateModal = ref(false)
const editingEvent = ref(null)
const showList = ref(false)

// Map style + heatmap, remembered between visits
const storedStyle = readPref(STYLE_KEY)
const mapStyle = ref(BASEMAPS[storedStyle] ? storedStyle : DEFAULT_BASEMAP)
const showHeat = ref(readPref(HEAT_KEY) === '1')
const showStylePanel = ref(false)

function setMapStyle(key) {
  mapStyle.value = key
  writePref(STYLE_KEY, key)
}

function setHeat(on) {
  showHeat.value = on
  writePref(HEAT_KEY, on ? '1' : '0')
}

const fallbackNotice = ref(false)
let noticeTimer = null

const SITE_URL = 'https://ozamasafdar-hub.github.io/Party/'

// Embedded previews (e.g. the claude.ai demo frame) can never reach tile
// servers — point people at the full site instead of a dead-end message
const isEmbeddedPreview = (() => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
})()

function onTileFallback() {
  // Raster tiles unreachable — the map switched itself to the chart
  mapStyle.value = 'chart'
  fallbackNotice.value = true
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (fallbackNotice.value = false), isEmbeddedPreview ? 12000 : 5000)
}

// Sign-in modal — opened at the moment a visitor tries a members-only
// action; the pending action resumes automatically after login
const showLogin = ref(false)
const loginPrompt = ref('')
const pendingJoinId = ref(null)
const pendingCreate = ref(false)

const selectedEvent = computed(() => eventStore.selectedEvent)

let soonTimer = null

onMounted(async () => {
  await eventStore.load()
  // Shared link: /e/<id> lands with that event's card open
  if (route.name === 'event-link' && route.params.id) {
    const exists = eventStore.events.some((e) => e.id === route.params.id)
    if (exists) eventStore.select(route.params.id)
  }
  // Starting-soon reminders for events I've joined
  soonTimer = setInterval(() => {
    notifStore.checkStartingSoon(eventStore.events, authStore.currentUser?.id)
  }, 60000)
  notifStore.checkStartingSoon(eventStore.events, authStore.currentUser?.id)
})

onBeforeUnmount(() => {
  clearInterval(soonTimer)
  eventStore.stopRealtime()
})

function onSelect(eventId) {
  if (pickMode.value) return
  showList.value = false
  eventStore.select(eventId)
}

function startPicking() {
  if (!authStore.isAuthenticated) {
    openLogin('Sign in to host your own event on the map.', { create: true })
    return
  }
  eventStore.clearSelection()
  showList.value = false
  pickMode.value = true
  pickedCoords.value = null
}

function openLogin(prompt, { joinId = null, create = false } = {}) {
  loginPrompt.value = prompt
  pendingJoinId.value = joinId
  pendingCreate.value = create
  showLogin.value = true
}

function closeLogin() {
  showLogin.value = false
  pendingJoinId.value = null
  pendingCreate.value = false
}

async function onLoginSuccess() {
  const joinId = pendingJoinId.value
  const create = pendingCreate.value
  closeLogin()
  if (joinId) {
    try {
      await eventStore.smartJoin(joinId, authStore.currentUser.id)
    } catch {
      /* event filled up meanwhile — the open card shows the live state */
    }
  } else if (create) {
    startPicking()
  }
}

function onJoinLoginRequired() {
  openLogin('Sign in to join this event.', { joinId: selectedEvent.value?.id })
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
  editingEvent.value = null
  // Keep pick mode active so the member can adjust the pin position
}

function onSaved() {
  showCreateModal.value = false
  editingEvent.value = null
  pickMode.value = false
  liveMap.value?.clearDraftPin()
}

function onEdit(event) {
  editingEvent.value = event
  showCreateModal.value = true
}

function toggleList() {
  showList.value = !showList.value
  if (showList.value) eventStore.clearSelection()
}
</script>

<template>
  <div class="map-view">
    <LiveMap
      ref="liveMap"
      :events="eventStore.visibleEvents"
      :selected-id="eventStore.selectedEventId"
      :pick-mode="pickMode"
      :style-key="mapStyle"
      :show-heat="showHeat"
      @select="onSelect"
      @pick="onPick"
      @fallback="onTileFallback"
    />

    <TopBar @signin="openLogin('')" />

    <!-- Floating map controls -->
    <div class="map-view__controls">
      <button class="map-view__ctrl glass-panel" title="Reset view" @click="liveMap?.resetView()">🇶🇦</button>
      <button class="map-view__ctrl glass-panel" title="My location" @click="liveMap?.locateMe()">📍</button>
      <button
        class="map-view__ctrl glass-panel"
        :class="{ 'map-view__ctrl--active': showList }"
        title="What's on"
        @click="toggleList"
      >
        📋
      </button>
      <button
        class="map-view__ctrl glass-panel"
        :class="{ 'map-view__ctrl--active': showStylePanel }"
        title="Map style"
        @click="showStylePanel = !showStylePanel"
      >
        🌍
      </button>
    </div>

    <!-- Tile-fallback notice -->
    <Transition name="fade">
      <div v-if="fallbackNotice" class="map-view__notice glass-panel">
        <template v-if="isEmbeddedPreview">
          This preview can't load street tiles — open the
          <a class="map-view__notice-link" :href="SITE_URL" target="_blank" rel="noopener">full app</a>
          for Satellite, Day &amp; Night.
        </template>
        <template v-else>
          Couldn't reach the map tile server — showing the offline chart instead.
        </template>
      </div>
    </Transition>

    <!-- Map style picker -->
    <Transition name="fade">
      <div v-if="showStylePanel" class="map-view__style">
        <MapStyleControl
          :style-key="mapStyle"
          :show-heat="showHeat"
          @update:style="setMapStyle"
          @update:heat="setHeat"
          @close="showStylePanel = false"
        />
      </div>
    </Transition>

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

    <!-- What's on feed -->
    <Transition name="slide-up">
      <div v-if="showList" class="map-view__list">
        <EventListPanel @close="showList = false" @select="onSelect" />
      </div>
    </Transition>

    <!-- Event bottom sheet -->
    <Transition name="slide-up">
      <div v-if="selectedEvent" class="map-view__sheet">
        <EventCard
          :event="selectedEvent"
          @close="eventStore.clearSelection()"
          @edit="onEdit"
          @login-required="onJoinLoginRequired"
        />
      </div>
    </Transition>

    <!-- Sign-in modal (members-only actions) -->
    <Transition name="fade">
      <div v-if="showLogin" class="map-view__login-backdrop" @click.self="closeLogin">
        <div class="map-view__login glass-panel">
          <button class="map-view__login-close" aria-label="Close" @click="closeLogin">✕</button>
          <LoginPanel :prompt="loginPrompt" @success="onLoginSuccess" />
        </div>
      </div>
    </Transition>

    <!-- Quick-post / edit form -->
    <Transition name="fade">
      <CreateEventModal
        v-if="showCreateModal && (pickedCoords || editingEvent)"
        :coords="pickedCoords"
        :event="editingEvent"
        @close="onModalClose"
        @created="onSaved"
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
  bottom: 190px;
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

.map-view__ctrl--active {
  background: rgba(198, 45, 85, 0.35);
  border-color: rgba(198, 45, 85, 0.6);
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

.map-view__sheet,
.map-view__list {
  position: absolute;
  z-index: 50;
  left: 50%;
  bottom: max(18px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
}

.map-view__style {
  position: absolute;
  z-index: 45;
  right: 72px;
  bottom: 190px;
}

.map-view__notice {
  position: absolute;
  z-index: 46;
  top: max(84px, calc(env(safe-area-inset-top) + 70px));
  left: 50%;
  transform: translateX(-50%);
  padding: 11px 18px;
  font-size: 13.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  max-width: calc(100vw - 24px);
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-view__notice-link {
  color: var(--gold);
  font-weight: 700;
  text-decoration: underline;
}

@media (max-width: 520px) {
  .map-view__style {
    right: 60px;
    bottom: 108px;
  }
}

.map-view__login-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 8, 15, 0.6);
  backdrop-filter: blur(4px);
  padding: 16px;
}

.map-view__login {
  position: relative;
  width: min(400px, 100%);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 32px 30px;
}

.map-view__login-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  font-size: 13px;
  z-index: 1;
}

/* Keep horizontal centering while the slide-up transition animates */
.map-view__sheet.slide-up-enter-from,
.map-view__sheet.slide-up-leave-to,
.map-view__list.slide-up-enter-from,
.map-view__list.slide-up-leave-to {
  transform: translate(-50%, 24px);
}

/* Phones: cards become true full-width bottom sheets */
@media (max-width: 520px) {
  .map-view__sheet,
  .map-view__list {
    left: 0;
    right: 0;
    bottom: 0;
    transform: none;
  }

  .map-view__sheet.slide-up-enter-from,
  .map-view__sheet.slide-up-leave-to,
  .map-view__list.slide-up-enter-from,
  .map-view__list.slide-up-leave-to {
    transform: translateY(24px);
  }

  .map-view__sheet :deep(.event-card),
  .map-view__list :deep(.event-list) {
    width: 100%;
    max-height: 78vh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    border-left: none;
    border-right: none;
    border-bottom: none;
    padding-bottom: max(22px, env(safe-area-inset-bottom));
  }

  .map-view__controls {
    bottom: 108px;
    right: 10px;
  }

  .map-view__ctrl {
    width: 42px;
    height: 42px;
    font-size: 17px;
  }

  .map-view__fab {
    padding: 13px 26px;
    font-size: 15px;
  }
}
</style>
