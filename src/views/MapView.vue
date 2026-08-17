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
import MapSearchBar from '@/components/map/MapSearchBar.vue'
import MapSearchPanel from '@/components/map/MapSearchPanel.vue'
import TimePills from '@/components/map/TimePills.vue'
import HostProModal from '@/components/pro/HostProModal.vue'
import StoryViewer from '@/components/memories/StoryViewer.vue'
import GenderPrompt from '@/components/profile/GenderPrompt.vue'
import MemoryUploadSheet from '@/components/memories/MemoryUploadSheet.vue'
import { useHostPermissions } from '@/composables/useHostPermissions'
import { inMemoryWindow } from '@/utils/datetime'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { useNotifStore } from '@/stores/notifStore'
import { useFollowStore } from '@/stores/followStore'
import { useDmStore } from '@/stores/dmStore'
import { usePrefsStore } from '@/stores/prefsStore'
import { SITE_URL } from '@/config/site'

const route = useRoute()
const router = useRouter()
const eventStore = useEventStore()
const authStore = useAuthStore()
const notifStore = useNotifStore()
const followStore = useFollowStore()
const dmStore = useDmStore()
const prefsStore = usePrefsStore()

const liveMap = ref(null)
const pickMode = ref(false)
const pickingLocation = ref(false) // form hidden while the member taps the spot
const pickedCoords = ref(null)
const pickedPlaceName = ref('') // from search — suggested into the form
const showCreateModal = ref(false)
const editingEvent = ref(null)
const showList = ref(false)
const showSearch = ref(false)

/**
 * Map style and heat are chosen in Settings now, so they live in a store
 * rather than here — the map has to follow a change made on another screen.
 */
const mapStyle = computed(() => prefsStore.mapStyle)
const showHeat = computed(() => prefsStore.showHeat)

const fallbackNotice = ref(false)
let noticeTimer = null


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
  prefsStore.setMapStyle('soft')
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

/**
 * A tap on empty map dismisses whatever is open — the card, the list, the
 * search panel — the way tapping outside a sheet does everywhere else.
 * Modals with their own backdrop (create, login, story) can't be reached
 * by a map tap in the first place, so they are left alone.
 */
function onMapTap() {
  if (pickMode.value) return
  eventStore.clearSelection()
  showList.value = false
  showSearch.value = false
}

/**
 * Closing a card that was opened from another page walks back to that page
 * rather than leaving you on a map you never chose. The entry is a real one
 * — the profile pushed it on the way here — so this is an ordinary back,
 * not a synthesized history hop.
 */
function closeCard() {
  const returning = !!eventStore.cardReturnTo
  eventStore.clearSelection()
  if (returning) router.back()
}

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
  eventStore.clearSelection() // the story takes over from the card
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

/**
 * Members who joined before sign-up asked hold gender null, so women-only
 * events are hidden from them whether they are women or not. Ask once.
 * "Not now" is honoured for this session and the question returns on the
 * next one — the same treatment the recap prompt gets.
 */
const genderAsked = ref(
  (() => {
    try {
      return sessionStorage.getItem('wyn:gender-asked') === '1'
    } catch {
      return false
    }
  })()
)

const needsGender = computed(
  () => authStore.isAuthenticated && !authStore.currentUser?.gender && !genderAsked.value
)

function dismissGenderPrompt() {
  genderAsked.value = true
  try {
    sessionStorage.setItem('wyn:gender-asked', '1')
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
    eventStore.clearSelection()
  }
}

/* --- search ---------------------------------------------------------------
 * One box over the whole map: events and people come from the store,
 * places from the geocoder. Each result type has its own landing spot.
 */

function toggleSearch() {
  showSearch.value = !showSearch.value
  if (showSearch.value) showList.value = false
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

function startDms() {
  const me = authStore.currentUser
  if (!me) return
  dmStore.loadInbox(me.id)
  dmStore.watchInbox(me.id, (message) => {
    const name = eventStore.memberById(message.senderId)?.name || 'Someone'
    notifStore.announceDm(message, name)
  })
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
      @tap="onMapTap"
      @fallback="onTileFallback"
    />

    <TopBar
      @signin="openLogin('')"
      @home="goHome"
      @filter-changed="onFilterChanged"
    />

    <!-- Floating map controls -->
    <div class="map-view__controls">
      <button
        class="map-view__ctrl chip-surface"
        :class="{ 'map-view__ctrl--active': showSearch }"
        title="Search"
        @click="toggleSearch"
      >
        🔍
      </button>
      <button class="map-view__ctrl chip-surface" title="My location" @click="liveMap?.locateMe()">📍</button>
      <button
        class="map-view__ctrl chip-surface"
        :class="{ 'map-view__ctrl--active': showList }"
        title="What's on"
        @click="toggleList"
      >
        📋
      </button>
    </div>

    <!-- Action confirmations (joined, waitlisted, left) -->
    <Transition name="fade">
      <div v-if="notifStore.toast" class="map-view__notice map-view__notice--toast glass-panel">
        {{ notifStore.toast }}
      </div>
    </Transition>

    <!--
      Back from the link in a confirmation email. A member who clicks that
      link and lands on a map with no acknowledgement has no way to tell a
      working sign-up from a broken one — least of all when the link has
      simply expired.
    -->
    <Transition name="fade">
      <button
        v-if="authStore.callbackNotice"
        class="map-view__notice map-view__notice--auth glass-panel"
        :class="{ 'map-view__notice--auth-bad': !authStore.callbackNotice.ok }"
        @click="authStore.dismissCallback()"
      >
        {{ authStore.callbackNotice.ok ? '✅' : '⚠️' }}
        {{ authStore.callbackNotice.message }}
      </button>
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

    <!-- One-time question for members who joined before sign-up asked -->
    <GenderPrompt
      v-if="needsGender && !showLogin && !showCreateModal && !storyEvent"
      @close="dismissGenderPrompt"
      @answered="dismissGenderPrompt"
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

    <!-- Event bottom sheet -->
    <Transition name="slide-up">
      <div v-if="selectedEvent" class="map-view__sheet">
        <EventCard
          :event="selectedEvent"
          :can-go-back="!!eventStore.cardReturnTo"
          @close="closeCard"
          @edit="onEdit"
          @login-required="onJoinLoginRequired"
          @recap="openRecap($event.id)"
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

.map-view__notice {
  position: absolute;
  z-index: 46;
  /* Sits under whatever the top bar currently occupies. TopBar measures
     itself into --wyn-topbar-bottom, because the category row unfolds
     absolutely and so changes the bar's real height without changing its
     box — a fixed offset here got printed straight across that open row.
     Click-through: a toast must never block the next tap. */
  top: calc(var(--wyn-topbar-bottom, 118px) + 14px);
  left: 50%;
  transform: translateX(-50%);
  padding: 11px 18px;
  font-size: 13.5px;
  color: var(--text-secondary);
  /* Wraps rather than clipping — "try another filter" was losing its end
     of sentence on a 360px phone. max-content keeps it to one line where
     there is room; `break-word` rather than `anywhere` so the box does not
     shrink to its narrowest word and stack up three lines instead. */
  width: max-content;
  max-width: min(420px, calc(100vw - 24px));
  text-align: center;
  line-height: 1.4;
  overflow-wrap: break-word;
}

/* Louder than the tile-fallback notice it shares a box with: this one is
   the answer to "did my sign-up work?", and it is tappable to dismiss */
.map-view__notice--auth {
  color: var(--text-primary);
  font-weight: 600;
  border-color: rgba(45, 212, 160, 0.45);
  box-shadow: var(--shadow-card), 0 0 0 1px rgba(45, 212, 160, 0.18);
  cursor: pointer;
}

.map-view__notice--auth-bad {
  border-color: rgba(244, 88, 122, 0.5);
  box-shadow: var(--shadow-card), 0 0 0 1px rgba(244, 88, 122, 0.2);
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
  }

  /* Padding lives on the card's scroller now, so clear the home bar there */
  .map-view__sheet :deep(.event-card__scroll) {
    padding-bottom: max(22px, env(safe-area-inset-bottom));
  }

  .map-view__list :deep(.event-list) {
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
