<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { CATEGORIES } from '@/config/categories'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { useNotifStore } from '@/stores/notifStore'
import { useDmStore } from '@/stores/dmStore'
import { isDemoForced } from '@/services/supabaseClient'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import WynLogo from '@/components/ui/WynLogo.vue'

const eventStore = useEventStore()
const authStore = useAuthStore()
const notifStore = useNotifStore()
const dmStore = useDmStore()

const emit = defineEmits(['signin', 'home', 'filter-changed'])

/**
 * The eight category chips used to sit permanently across the top, hiding
 * a strip of the map. They now live behind one chip that names the current
 * filter, and the row unfolds beneath it.
 *
 * Picking a category deliberately leaves the row open, so switching
 * between them is one tap each rather than reopening every time.
 */
const showCats = ref(false)
const filterWrap = ref(null)

const activeCat = computed(() =>
  eventStore.activeCategory ? CATEGORIES[eventStore.activeCategory] : null
)

function pickCategory(key, label) {
  eventStore.setCategory(key)
  emit('filter-changed', eventStore.activeCategory ? label : 'All')
}

/** Anything tapped outside the filter — including the map — folds it away. */
function onDocumentPointerDown(event) {
  if (!showCats.value) return
  if (!filterWrap.value?.contains(event.target)) showCats.value = false
}

onMounted(() => window.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onDocumentPointerDown))

const ringing = ref(false)

// A fresh notification makes the bell physically ring
watch(
  () => notifStore.unreadCount,
  (count, prev) => {
    if (count > (prev || 0)) {
      ringing.value = true
      setTimeout(() => (ringing.value = false), 900)
    }
  }
)

</script>

<template>
  <header class="top-bar">
    <div class="top-bar__row">
      <button
        class="top-bar__brand"
        title="Back to the full Qatar view"
        @click="$emit('home')"
      >
        <span class="top-bar__logo"><WynLogo :size="42" /></span>
        <div class="top-bar__brand-text">
          <div class="top-bar__name">
            WYN <span v-if="isDemoForced" class="top-bar__demo-badge">DEMO</span>
          </div>
          <div class="top-bar__tagline">
            <span class="top-bar__live-dot" />
            {{ eventStore.visibleEvents.length }} live · Qatar
          </div>
        </div>
      </button>

      <RouterLink
        v-if="authStore.currentUser"
        class="top-bar__mail"
        :to="{ name: 'inbox' }"
        :title="`Messages${dmStore.unreadTotal ? ` (${dmStore.unreadTotal} new)` : ''}`"
      >
        <svg viewBox="0 0 24 24" class="top-bar__mail-icon" aria-hidden="true">
          <rect x="2.5" y="5" width="19" height="14" rx="3.2" fill="url(#wyn-mail)" />
          <path
            d="M4 8.2 12 13l8-4.8"
            fill="none"
            stroke="#0b0f19"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            opacity="0.75"
          />
          <defs>
            <linearGradient id="wyn-mail" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#f4e9c9" />
              <stop offset="1" stop-color="#d4af6a" />
            </linearGradient>
          </defs>
        </svg>
        <span v-if="dmStore.unreadTotal" :key="dmStore.unreadTotal" class="top-bar__bell-badge">
          {{ dmStore.unreadTotal }}
        </span>
      </RouterLink>

      <RouterLink
        v-if="authStore.currentUser"
        class="top-bar__bell"
        :class="{ 'top-bar__bell--ring': ringing }"
        :to="{ name: 'inbox', query: { tab: 'alerts' } }"
        :title="`Notifications${notifStore.unreadCount ? ` (${notifStore.unreadCount} new)` : ''}`"
      >
        <svg viewBox="0 0 24 24" class="top-bar__bell-icon" aria-hidden="true">
          <defs>
            <linearGradient id="wyn-bell" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#f4e9c9" />
              <stop offset="1" stop-color="#d4af6a" />
            </linearGradient>
          </defs>
          <path
            d="M12 2.5a1.4 1.4 0 0 1 1.4 1.4v.5A6.1 6.1 0 0 1 18.1 10.3v3.1l1.6 2.8a1 1 0 0 1-.87 1.5H5.17a1 1 0 0 1-.87-1.5l1.6-2.8v-3.1a6.1 6.1 0 0 1 4.7-5.94v-.46A1.4 1.4 0 0 1 12 2.5Z"
            fill="url(#wyn-bell)"
          />
          <path
            d="M9.9 19.4a2.2 2.2 0 0 0 4.2 0"
            fill="none"
            stroke="url(#wyn-bell)"
            stroke-width="1.7"
            stroke-linecap="round"
          />
        </svg>
        <span v-if="notifStore.unreadCount" :key="notifStore.unreadCount" class="top-bar__bell-badge">
          {{ notifStore.unreadCount }}
        </span>
      </RouterLink>

      <RouterLink
        v-if="authStore.currentUser"
        class="top-bar__profile chip-surface"
        :to="{ name: 'profile' }"
        :title="authStore.currentUser.name"
      >
        <MemberAvatar :member="authStore.currentUser" :size="38" />
      </RouterLink>
      <button v-else class="top-bar__signin chip-surface" @click="$emit('signin')">
        Sign in
      </button>
    </div>

    <!-- One labelled chip on its own line; the row unfolds beneath it -->
    <div ref="filterWrap" class="top-bar__filter-wrap">
      <button
        class="top-bar__filter chip-surface"
        :class="{ 'top-bar__filter--on': !!activeCat }"
        :style="activeCat ? { borderColor: activeCat.color } : {}"
        :aria-expanded="showCats"
        @click="showCats = !showCats"
      >
        <svg v-if="activeCat" viewBox="0 0 24 24" class="top-bar__filter-glyph" aria-hidden="true">
          <path :d="activeCat.glyph" :fill="activeCat.color" />
        </svg>
        <svg v-else viewBox="0 0 24 24" class="top-bar__filter-glyph" aria-hidden="true">
          <path
            d="M4 5h16a1 1 0 0 1 .78 1.63L14.5 14v5.4a1 1 0 0 1-1.45.9l-3-1.5a1 1 0 0 1-.55-.9V14L3.22 6.63A1 1 0 0 1 4 5Z"
            fill="currentColor"
          />
        </svg>
        <span class="top-bar__filter-text">{{ activeCat ? activeCat.label : 'All events' }}</span>
        <span class="top-bar__filter-caret" :class="{ 'top-bar__filter-caret--up': showCats }">▾</span>
      </button>

      <Transition name="fade">
        <nav v-if="showCats" class="top-bar__filters" aria-label="Filter by category">
          <button
            v-for="(cat, key) in CATEGORIES"
            :key="key"
            class="top-bar__cat"
            :class="{ 'top-bar__cat--active': eventStore.activeCategory === key }"
            :style="eventStore.activeCategory === key ? { background: cat.color, borderColor: cat.color } : {}"
            :title="cat.label"
            @click="pickCategory(key, cat.label)"
          >
            <svg viewBox="0 0 24 24" class="top-bar__cat-glyph" aria-hidden="true">
              <path :d="cat.glyph" :fill="eventStore.activeCategory === key ? '#0b0f19' : cat.color" />
            </svg>
            <span v-if="eventStore.activeCategory === key" class="top-bar__cat-label">
              {{ cat.label }}
            </span>
          </button>
        </nav>
      </Transition>
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: max(14px, env(safe-area-inset-top)) 14px 0;
  pointer-events: none;
}

/* Brand and the icon cluster share one line; nothing wraps out of it and
   under the filter, which is what used to bury the avatar. */
.top-bar__row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  flex-wrap: nowrap;
}

.top-bar > * {
  pointer-events: auto;
}

/* Floating lockup — the mark sits straight on the map, no box */
.top-bar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px;
  flex-shrink: 0;
  text-align: left;
  background: none;
  border: none;
  transition: transform 0.15s ease;
  cursor: pointer;
}

.top-bar__brand:hover {
  transform: translateY(-1px) scale(1.02);
}

.top-bar__brand:active {
  transform: scale(0.98);
}

.top-bar__logo {
  display: block;
  flex-shrink: 0;
  filter: drop-shadow(0 5px 12px rgba(0, 0, 0, 0.55)) drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4));
}

.top-bar__brand-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.top-bar__name {
  font-size: 21px;
  font-weight: 900;
  letter-spacing: 0.13em;
  line-height: 1;
  color: #ffffff;
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.85),
    0 3px 14px rgba(0, 0, 0, 0.55);
}

.top-bar__tagline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 8px;
  border-radius: 999px;
  background: rgba(11, 15, 25, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #e6eaf2;
  white-space: nowrap;
}

.top-bar__live-dot {
  position: relative;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success);
  flex-shrink: 0;
}

.top-bar__live-dot::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1px solid var(--success);
  animation: live-ping 1.8s ease-out infinite;
}

@keyframes live-ping {
  0% {
    transform: scale(0.55);
    opacity: 0.9;
  }
  100% {
    transform: scale(1.7);
    opacity: 0;
  }
}

.top-bar__demo-badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(212, 175, 106, 0.25);
  color: var(--gold);
  vertical-align: middle;
}

/* The collapsed chip is all that sits in the bar's flow; the row floats
   under it so opening it never reflows the header. */
/* Its own line, so the chip can say what it does without crowding the
   icons — and the unfolded row has somewhere to go that overlaps nothing. */
.top-bar__filter-wrap {
  position: relative;
  align-self: flex-start;
  max-width: 100%;
  pointer-events: auto;
}

.top-bar__filter {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  height: 40px;
  padding: 0 13px 0 11px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

/* A live filter names itself and tints the chip in its category's colour */
.top-bar__filter--on {
  border-width: 2px;
}

.top-bar__filter-text {
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-bar__filter-glyph {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
}

.top-bar__filter-caret {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-secondary);
  transition: transform 0.18s ease;
}

.top-bar__filter-caret--up {
  transform: rotate(180deg);
}

/* Hangs below the chip and runs to the right edge of the screen; it stays
   a DOM child of the wrapper so the tap-outside check still sees it. */
.top-bar__filters {
  position: absolute;
  top: 48px;
  left: 0;
  width: calc(100vw - 28px);
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 2px 2px 8px;
}

.top-bar__filters::-webkit-scrollbar {
  display: none;
}

.top-bar__filters::-webkit-scrollbar {
  display: none;
}

/* Compact icon chips — same glyphs and colors as the map pins */
.top-bar__cat {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 40px;
  min-width: 40px;
  padding: 0 9px;
  border-radius: 999px;
  background: rgba(15, 20, 32, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.13);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
  transition: all 0.18s ease;
}

.top-bar__cat:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.32);
}

.top-bar__cat--active {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.top-bar__cat-glyph {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.top-bar__cat-label {
  font-size: 12px;
  font-weight: 800;
  color: #0b0f19;
  white-space: nowrap;
  padding-right: 3px;
}

.top-bar__profile {
  padding: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.top-bar__signin {
  padding: 12px 18px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 700;
  flex-shrink: 0;
  color: var(--text-primary);
}

.top-bar__signin:hover {
  background: var(--bg-700);
}


.top-bar__signin {
  margin-left: auto;
}

.top-bar__bell,
.top-bar__mail {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 20, 32, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.13);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.18s ease;
}

/* The mail link takes over pinning the cluster to the right */
.top-bar__mail {
  flex-shrink: 0;
  margin-left: auto;
}

.top-bar__bell {
  flex-shrink: 0;
}

.top-bar__mail:hover {
  border-color: rgba(212, 175, 106, 0.55);
}

.top-bar__mail-icon {
  width: 21px;
  height: 21px;
}

.top-bar__bell:hover {
  transform: translateY(-1px);
  border-color: rgba(212, 175, 106, 0.5);
}

.top-bar__bell-icon {
  width: 21px;
  height: 21px;
  transform-origin: 50% 15%;
}

.top-bar__bell--ring .top-bar__bell-icon {
  animation: bell-swing 0.9s ease-in-out;
}

@keyframes bell-swing {
  0% { transform: rotate(0); }
  15% { transform: rotate(22deg); }
  35% { transform: rotate(-18deg); }
  55% { transform: rotate(12deg); }
  75% { transform: rotate(-7deg); }
  100% { transform: rotate(0); }
}

.top-bar__bell-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--accent-bright), var(--accent));
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--bg-900);
  animation: badge-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes badge-pop {
  0% { transform: scale(0.4); }
  70% { transform: scale(1.2); }
  100% { transform: scale(1); }
}













</style>
