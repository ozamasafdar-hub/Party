<script setup>
/**
 * InboxView — messages and alerts on their own page, reached from the ✉️
 * and 🔔 in the top bar.
 *
 * They used to be panels floating over the map, which on a phone meant a
 * conversation squeezed into a corner of the screen. Both belong to "my
 * stuff", the same place the profile lives, so they get a page of their
 * own with room to breathe.
 *
 * Route state, so links and the back gesture work:
 *   /inbox              the conversation list
 *   /inbox?tab=alerts   notifications
 *   /inbox?to=<id>      that conversation, opened
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDmStore } from '@/stores/dmStore'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { useNotifStore } from '@/stores/notifStore'
import { timeAgo } from '@/utils/datetime'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import DmThread from '@/components/dm/DmThread.vue'

const route = useRoute()
const router = useRouter()
const dmStore = useDmStore()
const eventStore = useEventStore()
const authStore = useAuthStore()
const notifStore = useNotifStore()

const error = ref('')
const busy = ref(false)

const meId = computed(() => authStore.currentUser?.id || null)
const tab = computed(() => (route.query.tab === 'alerts' ? 'alerts' : 'messages'))

/** Same 3-tier fallback the event card and profile use. */
function resolveMember(id) {
  return (
    eventStore.memberById(id) ||
    (id === meId.value ? authStore.currentUser : null) || {
      id,
      name: 'Member',
      initials: 'M',
      avatarColor: '#94a3b8'
    }
  )
}

function setTab(next) {
  router.replace({ name: 'inbox', query: next === 'alerts' ? { tab: 'alerts' } : {} })
}

/* --- conversations -------------------------------------------------------- */

async function openThread(thread) {
  error.value = ''
  try {
    await dmStore.open(thread.id, meId.value, thread.peerId)
  } catch (e) {
    error.value = e.message
  }
}

async function startWith(peerId) {
  if (!peerId || peerId === meId.value) return
  busy.value = true
  error.value = ''
  try {
    await dmStore.openWith(meId.value, peerId)
    await dmStore.loadInbox(meId.value)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

function backToList() {
  dmStore.close()
  // Drop ?to= so the list doesn't reopen the thread on a refresh
  if (route.query.to) router.replace({ name: 'inbox' })
}

/* --- alerts --------------------------------------------------------------- */

/** Leading emoji doubles as the row icon, same convention as elsewhere. */
function alertEmoji(text) {
  const match = String(text).match(/^\p{Extended_Pictographic}/u)
  return match ? match[0] : '🔔'
}

function alertBody(text) {
  return String(text).replace(/^\p{Extended_Pictographic}️?\s*/u, '')
}

function openAlert(notif) {
  if (notif.dm?.peerId) {
    router.replace({ name: 'inbox', query: { to: notif.dm.peerId } })
    startWith(notif.dm.peerId)
  } else if (notif.eventId) {
    eventStore.select(notif.eventId)
    router.push({ name: 'map' })
  }
}

/* --- lifecycle ------------------------------------------------------------ */

onMounted(async () => {
  if (!eventStore.events.length) eventStore.load()
  await dmStore.loadInbox(meId.value)
  if (route.query.to) await startWith(route.query.to)
  if (tab.value === 'alerts') notifStore.markAllRead()
})

watch(
  () => route.query.to,
  (peerId) => {
    if (peerId) startWith(peerId)
  }
)

watch(tab, (value) => {
  if (value === 'alerts') notifStore.markAllRead()
  else dmStore.loadInbox(meId.value)
})
</script>

<template>
  <div class="inbox">
    <div class="inbox__inner">
      <button class="btn-ghost inbox__back" @click="router.push({ name: 'map' })">
        ← Back to map
      </button>

      <h1 class="inbox__title">Inbox</h1>

      <nav class="inbox__tabs">
        <button
          class="inbox__tab"
          :class="{ 'inbox__tab--on': tab === 'messages' }"
          @click="setTab('messages')"
        >
          💬 Messages
          <span v-if="dmStore.unreadTotal" class="inbox__tab-badge">{{ dmStore.unreadTotal }}</span>
        </button>
        <button
          class="inbox__tab"
          :class="{ 'inbox__tab--on': tab === 'alerts' }"
          @click="setTab('alerts')"
        >
          🔔 Alerts
          <span v-if="notifStore.unreadCount" class="inbox__tab-badge">
            {{ notifStore.unreadCount }}
          </span>
        </button>
      </nav>

      <p v-if="error" class="inbox__error glass-panel">{{ error }}</p>

      <!-- Messages -->
      <template v-if="tab === 'messages'">
        <section v-if="dmStore.openThreadId" class="inbox__thread glass-panel">
          <DmThread :peer="resolveMember(dmStore.peerId)" @back="backToList" />
        </section>

        <template v-else>
          <p v-if="busy" class="inbox__empty glass-panel">Opening…</p>
          <p v-else-if="!dmStore.threads.length" class="inbox__empty glass-panel">
            No conversations yet. Open someone's profile — or an event's host row — and
            tap 💬 Message to start one.
          </p>
          <button
            v-for="thread in dmStore.threads"
            :key="thread.id"
            class="inbox__row glass-panel"
            :class="{ 'inbox__row--unread': thread.unread > 0 }"
            @click="openThread(thread)"
          >
            <MemberAvatar :member="resolveMember(thread.peerId)" :size="44" />
            <span class="inbox__row-body">
              <span class="inbox__row-head">
                <strong class="inbox__row-name">{{ resolveMember(thread.peerId).name }}</strong>
                <span v-if="thread.lastAt" class="inbox__row-time">{{ timeAgo(thread.lastAt) }}</span>
              </span>
              <span class="inbox__row-preview">{{ thread.lastBody || 'Say salam 👋' }}</span>
            </span>
            <span v-if="thread.unread" class="inbox__row-badge">{{ thread.unread }}</span>
          </button>
        </template>
      </template>

      <!-- Alerts -->
      <template v-else>
        <div v-if="notifStore.items.length" class="inbox__alerts-head">
          <button class="inbox__clear" @click="notifStore.clearAll()">Clear all</button>
        </div>
        <p v-if="!notifStore.items.length" class="inbox__empty glass-panel">
          Nothing yet — joins, updates, and reminders for your events show here.
        </p>
        <button
          v-for="notif in notifStore.items"
          :key="notif.id"
          class="inbox__row glass-panel"
          @click="openAlert(notif)"
        >
          <span class="inbox__bubble">{{ alertEmoji(notif.text) }}</span>
          <span class="inbox__row-body">
            <span class="inbox__row-text">{{ alertBody(notif.text) }}</span>
            <span class="inbox__row-time">{{ timeAgo(notif.at) }}</span>
          </span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.inbox {
  height: 100%;
  overflow-y: auto;
  background:
    radial-gradient(ellipse 50% 35% at 80% 0%, rgba(139, 21, 56, 0.25), transparent),
    var(--bg-900);
}

.inbox__inner {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px 60px;
}

.inbox__back {
  margin-bottom: 18px;
}

.inbox__title {
  font-size: 26px;
  font-weight: 800;
  margin-bottom: 14px;
}

.inbox__tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.inbox__tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  transition: all 0.15s ease;
}

.inbox__tab:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.1);
}

.inbox__tab--on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 100%);
  border-color: transparent;
}

.inbox__tab-badge {
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  color: #0b0f19;
  background: var(--gold);
}

.inbox__alerts-head {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.inbox__clear {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
}

.inbox__clear:hover {
  color: var(--text-primary);
}

.inbox__empty,
.inbox__error {
  padding: 18px;
  border-radius: var(--radius-md);
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.inbox__error {
  color: var(--danger);
}

.inbox__row {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  text-align: left;
  padding: 14px 16px;
  margin-bottom: 10px;
  border-radius: var(--radius-md);
  transition: transform 0.15s ease, background 0.15s ease;
}

.inbox__row:hover {
  transform: translateY(-1px);
}

.inbox__row-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.inbox__row-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.inbox__row-name {
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inbox__row-time {
  flex-shrink: 0;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.inbox__row-preview,
.inbox__row-text {
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
}

.inbox__row-preview {
  white-space: nowrap;
}

.inbox__row--unread .inbox__row-preview {
  color: var(--text-primary);
  font-weight: 600;
}

.inbox__row-badge {
  flex-shrink: 0;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 800;
  color: #fff;
  background: var(--accent-bright);
}

.inbox__bubble {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: rgba(255, 255, 255, 0.07);
}

/* The conversation itself gets the full column */
.inbox__thread {
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: var(--radius-lg);
  min-height: min(62vh, 520px);
}
</style>
