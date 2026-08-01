<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { CATEGORIES } from '@/config/categories'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { useNotifStore } from '@/stores/notifStore'
import { formatTime } from '@/utils/datetime'
import { isDemoForced } from '@/services/supabaseClient'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import WynLogo from '@/components/ui/WynLogo.vue'

const eventStore = useEventStore()
const authStore = useAuthStore()
const notifStore = useNotifStore()

defineEmits(['signin', 'home'])

const showNotifs = ref(false)

function toggleNotifs() {
  showNotifs.value = !showNotifs.value
  if (showNotifs.value) notifStore.markAllRead()
}

function openNotif(notif) {
  showNotifs.value = false
  if (notif.eventId) eventStore.select(notif.eventId)
}
</script>

<template>
  <header class="top-bar">
    <button
      class="top-bar__brand glass-panel"
      title="Back to the full Qatar view"
      @click="$emit('home')"
    >
      <span class="top-bar__logo"><WynLogo :size="34" /></span>
      <div class="top-bar__brand-text">
        <div class="top-bar__name">
          WYN <span v-if="isDemoForced" class="top-bar__demo-badge">DEMO</span>
        </div>
        <div class="top-bar__tagline">
          <span class="top-bar__live-dot" />
          {{ eventStore.visibleEvents.length }} live now · Qatar
        </div>
      </div>
    </button>

    <nav class="top-bar__filters" aria-label="Filter by category">
      <button
        v-for="(cat, key) in CATEGORIES"
        :key="key"
        class="top-bar__chip glass-panel"
        :class="{ 'top-bar__chip--active': eventStore.activeCategory === key }"
        :style="eventStore.activeCategory === key ? { background: cat.color, color: '#0b0f19' } : {}"
        @click="eventStore.setCategory(key)"
      >
        {{ cat.label }}
      </button>
    </nav>

    <div v-if="authStore.currentUser" class="top-bar__bell-wrap">
      <button
        class="top-bar__bell glass-panel"
        :title="`Notifications${notifStore.unreadCount ? ` (${notifStore.unreadCount} new)` : ''}`"
        @click="toggleNotifs"
      >
        🔔
        <span v-if="notifStore.unreadCount" class="top-bar__bell-badge">
          {{ notifStore.unreadCount }}
        </span>
      </button>
      <Transition name="fade">
        <div v-if="showNotifs" class="top-bar__notifs glass-panel">
          <p v-if="!notifStore.items.length" class="top-bar__notifs-empty">
            Nothing yet — joins, updates, and reminders for your events show here.
          </p>
          <button
            v-for="notif in notifStore.items"
            :key="notif.id"
            class="top-bar__notif"
            @click="openNotif(notif)"
          >
            <span class="top-bar__notif-text">{{ notif.text }}</span>
            <span class="top-bar__notif-time">{{ formatTime(notif.at) }}</span>
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

.top-bar__brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 16px 8px 10px;
  flex-shrink: 0;
  text-align: left;
  border: 1px solid rgba(212, 175, 106, 0.28);
  box-shadow:
    0 4px 18px rgba(139, 21, 56, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  cursor: pointer;
}

.top-bar__brand:hover {
  transform: translateY(-1px);
  box-shadow:
    0 6px 22px rgba(139, 21, 56, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.top-bar__brand:active {
  transform: translateY(0);
}

.top-bar__logo {
  display: block;
  flex-shrink: 0;
  filter: drop-shadow(0 2px 7px rgba(124, 21, 51, 0.65));
}

.top-bar__brand-text {
  min-width: 0;
}

.top-bar__name {
  font-size: 17px;
  font-weight: 900;
  letter-spacing: 0.09em;
  line-height: 1.15;
  background: linear-gradient(115deg, #ffffff 10%, #f4e9c9 45%, #d4af6a 90%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.top-bar__tagline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
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

.top-bar__chip {
  padding: 10px 15px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--text-secondary);
  transition: all 0.15s ease;
}

.top-bar__chip:hover {
  color: var(--text-primary);
}

.top-bar__chip--active {
  font-weight: 700;
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
  width: 48px;
  height: 48px;
  border-radius: 50%;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.top-bar__bell-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent-bright);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--bg-900);
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

.top-bar__notifs-empty {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  padding: 8px 6px;
}

.top-bar__notif {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  text-align: left;
  padding: 10px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.top-bar__notif:hover {
  background: rgba(255, 255, 255, 0.06);
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
