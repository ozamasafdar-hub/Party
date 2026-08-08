<script setup>
/**
 * DmPanel — the messages inbox, and the conversation once you pick one.
 * Separate from the per-event group chat: these are 1:1 threads that
 * outlive any single event.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useDmStore } from '@/stores/dmStore'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { timeAgo } from '@/utils/datetime'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import DmThread from './DmThread.vue'

const props = defineProps({
  // A member to open a conversation with straight away (?dm= deep link)
  openWith: { type: String, default: '' }
})

const emit = defineEmits(['close'])

const dmStore = useDmStore()
const eventStore = useEventStore()
const authStore = useAuthStore()

const error = ref('')
const busy = ref(false)

const meId = computed(() => authStore.currentUser?.id || null)

/** Same 3-tier fallback used by the event card and profile views. */
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

onMounted(async () => {
  await dmStore.loadInbox(meId.value)
  if (props.openWith) await startWith(props.openWith)
})

watch(
  () => props.openWith,
  (peerId) => {
    if (peerId) startWith(peerId)
  }
)
</script>

<template>
  <aside class="dm-panel glass-panel">
    <DmThread
      v-if="dmStore.openThreadId"
      :peer="resolveMember(dmStore.peerId)"
      @back="dmStore.close()"
      @close="emit('close')"
    />

    <template v-else>
      <header class="dm-panel__head">
        <h2 class="dm-panel__title">Messages</h2>
        <button class="dm-panel__close" aria-label="Close" @click="emit('close')">✕</button>
      </header>

      <p v-if="error" class="dm-panel__error">{{ error }}</p>
      <p v-else-if="busy" class="dm-panel__empty">Opening…</p>

      <p v-if="!dmStore.threads.length && !busy" class="dm-panel__empty">
        No conversations yet. Open someone's profile — or an event's host row — and
        tap 💬 Message to start one.
      </p>

      <button
        v-for="thread in dmStore.threads"
        :key="thread.id"
        class="dm-panel__row"
        :class="{ 'dm-panel__row--unread': thread.unread > 0 }"
        @click="openThread(thread)"
      >
        <MemberAvatar :member="resolveMember(thread.peerId)" :size="40" />
        <span class="dm-panel__row-body">
          <span class="dm-panel__row-head">
            <strong class="dm-panel__row-name">{{ resolveMember(thread.peerId).name }}</strong>
            <span v-if="thread.lastAt" class="dm-panel__row-time">{{ timeAgo(thread.lastAt) }}</span>
          </span>
          <span class="dm-panel__row-preview">
            {{ thread.lastBody || 'Say salam 👋' }}
          </span>
        </span>
        <span v-if="thread.unread" class="dm-panel__row-badge">{{ thread.unread }}</span>
      </button>
    </template>
  </aside>
</template>

<style scoped>
.dm-panel {
  width: min(380px, calc(100vw - 24px));
  max-height: min(64vh, 520px);
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.dm-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.dm-panel__title {
  font-size: 16px;
  font-weight: 700;
}

.dm-panel__close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  font-size: 12px;
}

.dm-panel__empty,
.dm-panel__error {
  padding: 12px 4px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.dm-panel__error {
  color: var(--danger);
}

.dm-panel__row {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  text-align: left;
  padding: 9px 8px;
  border-radius: var(--radius-md);
  transition: background 0.15s ease;
}

.dm-panel__row:hover {
  background: rgba(255, 255, 255, 0.07);
}

.dm-panel__row-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.dm-panel__row-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.dm-panel__row-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dm-panel__row-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-secondary);
}

.dm-panel__row-preview {
  font-size: 12.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dm-panel__row--unread .dm-panel__row-preview {
  color: var(--text-primary);
  font-weight: 600;
}

.dm-panel__row-badge {
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  background: var(--accent-bright);
}
</style>
