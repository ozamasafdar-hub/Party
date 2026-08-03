<script setup>
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { CATEGORIES } from '@/config/categories'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { useNotifStore } from '@/stores/notifStore'
import { timeAgo } from '@/utils/datetime'
import { isDemoForced } from '@/services/supabaseClient'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import WynLogo from '@/components/ui/WynLogo.vue'

const eventStore = useEventStore()
const authStore = useAuthStore()
const notifStore = useNotifStore()

const emit = defineEmits(['signin', 'home', 'filter-changed'])

function pickCategory(key, label) {
  eventStore.setCategory(key)
  emit('filter-changed', eventStore.activeCategory ? label : 'All')
}

const showNotifs = ref(false)
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

function toggleNotifs() {
  showNotifs.value = !showNotifs.value
  if (showNotifs.value) notifStore.markAllRead()
}

function openNotif(notif) {
  showNotifs.value = false
  if (notif.eventId) eventStore.select(notif.eventId)
}

/** Leading emoji becomes the row's icon bubble; falls back to a bell. */
function notifEmoji(text) {
  const match = String(text).match(/^\p{Extended_Pictographic}/u)
  return match ? match[0] : '🔔'
}

function notifBody(text) {
  return String(text).replace(/^\p{Extended_Pictographic}️?\s*/u, '')
}
</script>

<template>
  <header class="top-bar">
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

    <nav class="top-bar__filters" aria-label="Filter by category">
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

    <div v-if="authStore.currentUser" class="top-bar__bell-wrap">
      <button
        class="top-bar__bell"
        :class="{ 'top-bar__bell--ring': ringing }"
        :title="`Notifications${notifStore.unreadCount ? ` (${notifStore.unreadCount} new)` : ''}`"
        @click="toggleNotifs"
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
        <span
          v-if="notifStore.unreadCount"
          :key="notifStore.unreadCount"
          class="top-bar__bell-badge"
        >
          {{ notifStore.unreadCount }}
        </span>
      </button>
      <Transition name="fade">
        <div v-if="showNotifs" class="top-bar__notifs glass-panel">
          <div class="top-bar__notifs-head">
            <span>Notifications</span>
            <button
              v-if="notifStore.items.length"
              class="top-bar__notifs-clear"
              @click="notifStore.clearAll()"
            >
              Clear all
            </button>
          </div>
          <p v-if="!notifStore.items.length" class="top-bar__notifs-empty">
            Nothing yet — joins, updates, and reminders for your events show here.
          </p>
          <button
            v-for="notif in notifStore.items"
            :key="notif.id"
            class="top-bar__notif"
            @click="openNotif(notif)"
          >
            <span class="top-bar__notif-bubble">{{ notifEmoji(notif.text) }}</span>
            <span class="top-bar__notif-body">
              <span class="top-bar__notif-text">{{ notifBody(notif.text) }}</span>
              <span class="top-bar__notif-time">{{ timeAgo(notif.at) }}</span>
            </span>
          </button>
        </div>
      </Transition>
    </div>

    <RouterLink
      v-if="authStore.currentUser"
      class="top-bar__profile glass-panel"
      :to="{ name: 'profile' }"
      :title="authStore.currentUser.name"
    >
      <MemberAvatar :member="authStore.currentUser" :size="38" />
    </RouterLink>
    <button v-else class="top-bar__signin glass-panel" @click="$emit('signin')">
      Sign in
    </button>
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
  align-items: flex-start;
  gap: 12px;
  padding: max(14px, env(safe-area-inset-top)) 14px 0;
  pointer-events: none;
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
  background: rgba(11, 15, 25, 0.72);
  backdrop-filter: blur(6px);
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

.top-bar__filters {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 6px;
  flex: 1;
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
  background: rgba(13, 18, 30, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(8px);
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

.top-bar__bell-wrap {
  position: relative;
  flex-shrink: 0;
  /* When the chips wrap to their own row (narrow screens) nothing fills
     the first row — this keeps the bell + avatar pinned to the right. */
  margin-left: auto;
}

.top-bar__signin {
  margin-left: auto;
}

.top-bar__bell {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 18, 30, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(8px);
  transition: all 0.18s ease;
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

.top-bar__notifs {
  position: absolute;
  top: 56px;
  right: 0;
  width: min(320px, calc(100vw - 28px));
  max-height: 340px;
  overflow-y: auto;
  padding: 10px;
  z-index: 60;
}

.top-bar__notifs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 8px;
  font-size: 13px;
  font-weight: 800;
}

.top-bar__notifs-clear {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-secondary);
  padding: 3px 8px;
  border-radius: 999px;
}

.top-bar__notifs-clear:hover {
  color: var(--danger);
  background: rgba(244, 88, 122, 0.1);
}

.top-bar__notifs-empty {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  padding: 8px 6px;
}

.top-bar__notif {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 9px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.top-bar__notif:hover {
  background: rgba(255, 255, 255, 0.06);
}

.top-bar__notif-bubble {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  background: rgba(212, 175, 106, 0.1);
  border: 1px solid rgba(212, 175, 106, 0.22);
}

.top-bar__notif-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.top-bar__notif-text {
  font-size: 13.5px;
  line-height: 1.4;
}

.top-bar__notif-time {
  font-size: 11px;
  color: var(--text-secondary);
}

@media (max-width: 720px) {
  .top-bar {
    flex-wrap: wrap;
  }

  .top-bar__filters {
    order: 3;
    flex-basis: 100%;
  }
}
</style>
