<script setup>
/**
 * MapView — the home screen. Fullscreen live map with:
 *   - TopBar (brand, category filters, profile)
 *   - EventCard bottom sheet when a pin is selected
 *   - EventListPanel ("What's on") feed
 *   - Pick mode + CreateEventModal for dropping new event pins
 *   - Edit mode reusing the same modal for hosts
 */
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LiveMap from '@/components/map/LiveMap.vue'
import TopBar from '@/components/layout/TopBar.vue'
import EventCard from '@/components/events/EventCard.vue'
import CreateEventModal from '@/components/events/CreateEventModal.vue'
import EventListPanel from '@/components/events/EventListPanel.vue'
import LoginPanel from '@/components/auth/LoginPanel.vue'
import MapStyleControl from '@/components/map/MapStyleControl.vue'
import MapSearchBar from '@/components/map/MapSearchBar.vue'
import MapSearchPanel from '@/components/map/MapSearchPanel.vue'
import DmPanel from '@/components/dm/DmPanel.vue'
import TimePills from '@/components/map/TimePills.vue'
import HostProModal from '@/components/pro/HostProModal.vue'
import StoryViewer from '@/components/memories/StoryViewer.vue'
import MemoryUploadSheet from '@/components/memories/MemoryUploadSheet.vue'
import { useHostPermissions } from '@/composables/useHostPermissions'
import { inMemoryWindow } from '@/utils/datetime'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { useNotifStore } from '@/stores/notifStore'
import { useFollowStore } from '@/stores/followStore'
import { useDmStore } from '@/stores/dmStore'
import { BASEMAPS, DEFAULT_BASEMAP } from '@/config/map'

const route = useRoute()
const router = useRouter()
const eventStore = useEventStore()
const authStore = useAuthStore()
const notifStore = useNotifStore()
const followStore = useFollowStore()
const dmStore = useDmStore()

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
const pickingLocation = ref(false) // form hidden while the member taps the spot
const pickedCoords = ref(null)
const pickedPlaceName = ref('') // from search — suggested into the form
const showCreateModal = ref(false)
const editingEvent = ref(null)
const showList = ref(false)
const showSearch = ref(false)

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
  mapStyle.value = 'soft'
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
  if (authStore.currentUser) {
    followStore.load(authStore.currentUser.id)
    startDms()
  }
  // Shared link: /e/<id> lands with that event's card open
  if (route.name === 'event-link' && route.params.id) {
    const exists = eventStore.events.some((e) => e.id === route.params.id)
    if (exists) eventStore.select(route.params.id)
  }
  // ?dm=<memberId> lands with that conversation open
  if (route.query.dm) openMessages(route.query.dm)
  // ?recap=<eventId> opens that event's story straight from the profile
  if (route.query.recap) openRecap(route.query.recap)
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
  showSearch.value = false
  // In recap mode a pin opens the story viewer, not the event card
  if (eventStore.mapMode === 'memories') {
    storyEvent.value = eventStore.events.find((e) => e.id === eventId) || null
    return
  }
  eventStore.select(eventId)
}

/* --- 24h memory recaps ---------------------------------------------------- */

const storyEvent = ref(null)
const uploadEvent = ref(null)

/** Opened from a profile's Hosted/Went row while the recap is still live. */
function openRecap(eventId) {
  const event = eventStore.events.find((e) => e.id === eventId)
  if (!event) return
  eventStore.setMapMode('memories')
  storyEvent.value = event
  if (route.query.recap) router.replace({ name: 'map' })
}

const readDismissed = () => {
  try {
    return new Set(JSON.parse(sessionStorage.getItem('wyn:recap-dismissed') || '[]'))
  } catch {
    return new Set()
  }
}
const dismissedRecaps = ref(readDismissed())

function dismissRecap(id) {
  dismissedRecaps.value = new Set([...dismissedRecaps.value, id])
  try {
    sessionStorage.setItem('wyn:recap-dismissed', JSON.stringify([...dismissedRecaps.value]))
  } catch {
    /* session-only convenience */
  }
}

/** An event I attended just ended and I haven't posted to its recap yet. */
const recapPrompt = computed(() => {
  const meId = authStore.currentUser?.id
  if (!meId) return null
  return (
    eventStore.events.find(
      (e) =>
        inMemoryWindow(e) &&
        e.attendeeIds.includes(meId) &&
        !dismissedRecaps.value.has(e.id) &&
        !eventStore.memories.some((m) => m.eventId === e.id && m.userId === meId)
    ) || null
  )
})

/** Brand tap: reset filters and fly back to the full Qatar view. */
function goHome() {
  eventStore.setMapMode('live')
  eventStore.setTimeWindow('all')
  if (eventStore.activeCategory) eventStore.setCategory(eventStore.activeCategory)
  eventStore.clearSelection()
  showList.value = false
  liveMap.value?.resetView()
}

/** A filter pill was tapped — fly the camera to the matching events. */
async function onFilterChanged(label) {
  await nextTick()
  const events = eventStore.mapEvents
  if (events.length) {
    liveMap.value?.fitToEvents(events)
  } else {
    notifStore.flash(`Nothing on for ${label} yet — try another filter`)
  }
}

function onMemoryShared() {
  const event = uploadEvent.value
  uploadEvent.value = null
  // Jump straight into the recap so the member sees their post live
  if (event && !storyEvent.value) {
    eventStore.setMapMode('memories')
    storyEvent.value = event
  }
}

const { createBlockReason } = useHostPermissions()
const showProModal = ref(false)

/** Form first — the location is picked from inside it. */
function openCreate() {
  if (!authStore.isAuthenticated) {
    openLogin('Sign in to host your own event on the map.', { create: true })
    return
  }
  // Free-tier limit reached → paywall instead of the form
  if (createBlockReason.value) {
    showProModal.value = true
    return
  }
  eventStore.clearSelection()
  showList.value = false
  editingEvent.value = null
  pickedCoords.value = null
  showCreateModal.value = true
}

/** "Pick on map" inside the form: hide it (state kept) and enter pick mode. */
function startPickingLocation() {
  pickingLocation.value = true
  pickMode.value = true
}

function stopPickingLocation() {
  pickingLocation.value = false
  pickMode.value = false
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
  followStore.load(authStore.currentUser.id)
  startDms()
  // Refetch with the authenticated session: the snapshot (and realtime
  // socket) from before login only saw what visitors are allowed to see.
  eventStore.stopRealtime()
  await eventStore.load()
  if (joinId) {
    // Paid events go through the checkout — land back on the card instead
    const target = eventStore.events.find((e) => e.id === joinId)
    if (target && Number(target.pricePerSpot) > 0) return
    try {
      await eventStore.smartJoin(joinId, authStore.currentUser.id)
    } catch {
      /* event filled up meanwhile — the open card shows the live state */
    }
  } else if (create) {
    openCreate()
  }
}

function onJoinLoginRequired() {
  openLogin('Sign in to join this event.', { joinId: selectedEvent.value?.id })
}

function onPick(coords) {
  pickedCoords.value = coords
  stopPickingLocation() // back to the form, pin stays visible on the map
}

/** Search result chosen: fly there, set the pin, return to the form. */
function onSearchSelect(result) {
  liveMap.value?.setDraftPin(result.lat, result.lng)
  pickedCoords.value = { lat: result.lat, lng: result.lng }
  pickedPlaceName.value = result.name
  stopPickingLocation()
}

function onModalClose() {
  showCreateModal.value = false
  editingEvent.value = null
  pickedCoords.value = null
  pickedPlaceName.value = ''
  stopPickingLocation()
  liveMap.value?.clearDraftPin()
}

function onSaved() {
  onModalClose()
}

function onEdit(event) {
  editingEvent.value = event
  showCreateModal.value = true
}

function toggleList() {
  showList.value = !showList.value
  if (showList.value) {
    showSearch.value = false
    showMessages.value = false
    eventStore.clearSelection()
  }
}

/* --- search ---------------------------------------------------------------
 * One box over the whole map: events and people come from the store,
 * places from the geocoder. Each result type has its own landing spot.
 */

function toggleSearch() {
  showSearch.value = !showSearch.value
  if (showSearch.value) {
    showList.value = false
    showMessages.value = false
  }
}

function onSearchEvent(eventId) {
  showSearch.value = false
  // Recap pins keep their own viewer, so reuse the normal pin behaviour
  onSelect(eventId)
}

function onSearchPerson(memberId) {
  showSearch.value = false
  // Profiles are members-only. Prompt in place rather than letting the
  // route guard bounce a visitor to a full-page login.
  if (!authStore.isAuthenticated) {
    openLogin('Sign in to see member profiles.')
    return
  }
  router.push(`/profile/${memberId}`)
}

/* --- direct messages ------------------------------------------------------
 * The inbox watch runs for the whole signed-in session so unread counts
 * stay live wherever you are; the panel itself is just another sibling in
 * the map stack, mutually exclusive with search and the list.
 */

const showMessages = ref(false)
const dmWith = ref('')

function startDms() {
  const me = authStore.currentUser
  if (!me) return
  dmStore.loadInbox(me.id)
  dmStore.watchInbox(me.id, (message) => {
    const name = eventStore.memberById(message.senderId)?.name || 'Someone'
    notifStore.announceDm(message, name)
  })
}

function openMessages(peerId = '') {
  if (!authStore.isAuthenticated) {
    openLogin('Sign in to send a message.')
    return
  }
  dmWith.value = typeof peerId === 'string' ? peerId : ''
  showSearch.value = false
  showList.value = false
  eventStore.clearSelection()
  showMessages.value = true
}

function closeMessages() {
  showMessages.value = false
  dmWith.value = ''
  dmStore.close()
  // Drop ?dm= so a refresh doesn't reopen the conversation
  if (route.query.dm) router.replace({ name: 'map' })
}

/** A place isn't a pin — just fly the camera there. */
function onSearchPlace(place) {
  showSearch.value = false
  eventStore.clearSelection()
  liveMap.value?.flyTo(place.lat, place.lng)
  notifStore.flash(`📍 ${place.name}`)
}
</script>

<template>
  <div class="map-view">
    <LiveMap
      ref="liveMap"
      :events="eventStore.mapEvents"
      :selected-id="eventStore.selectedEventId"
      :pick-mode="pickMode"
      :style-key="mapStyle"
      :show-heat="showHeat"
      :memory-mode="eventStore.mapMode === 'memories'"
      @select="onSelect"
      @pick="onPick"
      @fallback="onTileFallback"
    />

    <TopBar
      @signin="openLogin('')"
      @home="goHome"
      @filter-changed="onFilterChanged"
      @messages="openMessages"
    />

    <!-- Floating map controls -->
    <div class="map-view__controls">
      <button
        class="map-view__ctrl glass-panel"
        :class="{ 'map-view__ctrl--active': showSearch }"
        title="Search"
        @click="toggleSearch"
      >
        🔍
      </button>
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

    <!-- Action confirmations (joined, waitlisted, left) -->
    <Transition name="fade">
      <div v-if="notifStore.toast" class="map-view__notice map-view__notice--toast glass-panel">
        {{ notifStore.toast }}
      </div>
    </Transition>

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

    <!-- Location search while picking -->
    <Transition name="fade">
      <div v-if="pickingLocation" class="map-view__search">
        <MapSearchBar @select="onSearchSelect" />
      </div>
    </Transition>

    <!-- Global search: events, organizers, places -->
    <Transition name="fade">
      <div v-if="showSearch && !pickingLocation" class="map-view__search">
        <MapSearchPanel
          @close="showSearch = false"
          @select-event="onSearchEvent"
          @select-person="onSearchPerson"
          @select-place="onSearchPlace"
        />
      </div>
    </Transition>

    <!-- Quick-post -->
    <div class="map-view__fab-area">
      <Transition name="fade">
        <div v-if="pickingLocation" class="map-view__hint glass-panel">
          Search above or tap the map to set the spot
          <button class="map-view__hint-cancel" @click="stopPickingLocation">Back to form</button>
        </div>
      </Transition>
      <!-- "Share to the recap" banner after an event I attended ends -->
      <Transition name="fade">
        <div
          v-if="recapPrompt && !storyEvent && !uploadEvent && !pickMode && !selectedEvent && !showCreateModal"
          class="map-view__recap glass-panel"
        >
          <span class="map-view__recap-text">
            How was “{{ recapPrompt.title }}”? Share a quick photo or clip to the WYN Memory Map!
          </span>
          <button class="btn-primary map-view__recap-share" @click="uploadEvent = recapPrompt">
            📸 Share
          </button>
          <button
            class="map-view__recap-dismiss"
            aria-label="Dismiss"
            @click="dismissRecap(recapPrompt.id)"
          >
            ✕
          </button>
        </div>
      </Transition>
      <TimePills
        v-if="!pickMode && !pickingLocation && !selectedEvent && !showList"
        @changed="onFilterChanged"
      />
      <button
        v-if="!pickMode && !showCreateModal"
        class="btn-primary map-view__fab"
        :class="{ 'map-view__fab--limited': createBlockReason }"
        :title="createBlockReason || 'Create an event'"
        @click="openCreate"
      >
        {{ createBlockReason ? '🔒 Create an event' : '＋ Create an event' }}
      </button>
    </div>

    <!-- Host Pro paywall (free-tier limit reached) -->
    <Transition name="fade">
      <HostProModal
        v-if="showProModal"
        :reason="createBlockReason"
        @close="showProModal = false"
        @upgraded="showProModal = false"
      />
    </Transition>

    <!-- Story recap viewer (memory pins) -->
    <StoryViewer
      v-if="storyEvent"
      :event="storyEvent"
      :frozen="showLogin || !!uploadEvent"
      @close="storyEvent = null"
      @add="uploadEvent = storyEvent"
      @login-required="openLogin('Sign in to react and follow hosts.')"
    />

    <!-- Recap upload sheet -->
    <MemoryUploadSheet
      v-if="uploadEvent"
      :event="uploadEvent"
      @close="uploadEvent = null"
      @shared="onMemoryShared"
    />

    <!-- What's on feed -->
    <Transition name="slide-up">
      <div v-if="showList" class="map-view__list">
        <EventListPanel
          @close="showList = false"
          @select="onSelect"
          @need-location="liveMap?.locateMe()"
        />
      </div>
    </Transition>

    <!-- Direct messages -->
    <Transition name="slide-up">
      <div v-if="showMessages" class="map-view__list">
        <DmPanel :open-with="dmWith" @close="closeMessages" />
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

    <!-- Quick-post / edit form (hidden, state intact, while picking the spot) -->
    <Transition name="fade">
      <CreateEventModal
        v-if="showCreateModal"
        v-show="!pickingLocation"
        :coords="pickedCoords"
        :event="editingEvent"
        :place-name="pickedPlaceName"
        @close="onModalClose"
        @created="onSaved"
        @pick-location="startPickingLocation"
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
  /* stay clear of the right-side map controls + zoom buttons */
  width: min(560px, calc(100vw - 136px));
}

.map-view__fab--limited {
  filter: saturate(0.55);
  opacity: 0.85;
}

.map-view__recap {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(167, 139, 250, 0.4);
}

.map-view__recap-text {
  flex: 1;
  font-size: 12.5px;
  line-height: 1.4;
}

.map-view__recap-share {
  flex-shrink: 0;
  padding: 8px 14px;
  font-size: 12.5px;
}

.map-view__recap-dismiss {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  font-size: 11px;
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
  /* Below the whole top bar (brand + chips, even when wrapped on mobile),
     and click-through — a toast must never block the next tap */
  top: max(132px, calc(env(safe-area-inset-top) + 118px));
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

.map-view__search {
  position: absolute;
  z-index: 48;
  top: max(84px, calc(env(safe-area-inset-top) + 70px));
  left: 50%;
  transform: translateX(-50%);
}

@media (max-width: 720px) {
  .map-view__search {
    top: max(140px, calc(env(safe-area-inset-top) + 126px));
  }
}

.map-view__notice--toast {
  z-index: 47;
  color: var(--text-primary);
  font-weight: 600;
  border-color: rgba(45, 212, 160, 0.4);
  box-shadow: 0 12px 36px rgba(45, 212, 160, 0.15), var(--shadow-card);
  /* pure feedback — taps go straight through to whatever is beneath */
  pointer-events: none;
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
