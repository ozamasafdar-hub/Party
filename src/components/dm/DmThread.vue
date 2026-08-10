<script setup>
/**
 * DmThread — one 1:1 conversation.
 *
 * Unlike the event group chat (a flat avatar + name list, because a dozen
 * people talk in it), a DM only ever has two voices, so messages are
 * bubbles aligned to their side. That alone tells you who said what, and
 * leaves room for longer text.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useDmStore } from '@/stores/dmStore'
import { useAuthStore } from '@/stores/authStore'
import { formatTime, formatDay } from '@/utils/datetime'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'

const props = defineProps({
  peer: { type: Object, required: true }
})

const emit = defineEmits(['back'])

const dmStore = useDmStore()
const authStore = useAuthStore()

const draft = ref('')
const error = ref('')
const sending = ref(false)
const showMenu = ref(false)
const body = ref(null)

const meId = computed(() => authStore.currentUser?.id || null)
const blocked = computed(() => dmStore.isBlocked(props.peer.id))

/** Day separators, so a thread picked up next week reads correctly. */
const days = computed(() => {
  const groups = []
  for (const message of dmStore.messages) {
    const label = formatDay(message.at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.messages.push(message)
    else groups.push({ label, messages: [message] })
  }
  return groups
})

async function scrollToEnd() {
  await nextTick()
  if (body.value) body.value.scrollTop = body.value.scrollHeight
}

onMounted(scrollToEnd)
watch(() => dmStore.messages.length, scrollToEnd)

async function send() {
  const text = draft.value.trim()
  if (!text || sending.value) return
  sending.value = true
  error.value = ''
  try {
    await dmStore.send(authStore.currentUser, text)
    draft.value = ''
  } catch (e) {
    error.value = e.message
  } finally {
    sending.value = false
  }
}

async function toggleBlock() {
  showMenu.value = false
  error.value = ''
  try {
    await dmStore.setBlocked(meId.value, props.peer.id, !blocked.value)
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <div class="dm-thread">
    <header class="dm-thread__head">
      <button class="dm-thread__back" aria-label="Back to messages" @click="emit('back')">‹</button>
      <RouterLink
        class="dm-thread__who"
        :to="{ name: 'profile', params: { id: peer.id } }"
        :title="`View ${peer.name}'s profile`"
      >
        <MemberAvatar :member="peer" :size="30" />
        <span class="dm-thread__name">{{ peer.name }}</span>
      </RouterLink>
      <div class="dm-thread__menu-wrap">
        <button class="dm-thread__menu-btn" aria-label="Conversation options" @click="showMenu = !showMenu">
          ⋯
        </button>
        <div v-if="showMenu" class="dm-thread__menu glass-panel">
          <button class="dm-thread__menu-item" @click="toggleBlock">
            {{ blocked ? 'Unblock' : 'Block' }} {{ peer.name }}
          </button>
        </div>
      </div>
    </header>

    <div ref="body" class="dm-thread__body scroll-quiet">
      <p v-if="dmStore.loading" class="dm-thread__empty">Loading…</p>
      <p v-else-if="!dmStore.messages.length" class="dm-thread__empty">
        No messages yet — say salam! 👋
      </p>
      <template v-for="day in days" :key="day.label">
        <p class="dm-thread__day">{{ day.label }}</p>
        <div
          v-for="message in day.messages"
          :key="message.id"
          class="dm-thread__msg"
          :class="message.senderId === meId ? 'dm-thread__msg--mine' : 'dm-thread__msg--theirs'"
        >
          <span class="dm-thread__bubble">{{ message.text }}</span>
          <span class="dm-thread__time">{{ formatTime(message.at) }}</span>
        </div>
      </template>
    </div>

    <p v-if="error" class="dm-thread__error">{{ error }}</p>

    <form v-if="!blocked" class="dm-thread__form" @submit.prevent="send">
      <input
        v-model="draft"
        class="field-input dm-thread__input"
        type="text"
        maxlength="2000"
        :placeholder="`Message ${peer.name}…`"
      />
      <button type="submit" class="btn-primary btn-send dm-thread__send" :disabled="!draft.trim() || sending">
        ➤
      </button>
    </form>
    <p v-else class="dm-thread__blocked">
      You blocked {{ peer.name }}. Neither of you can send messages here.
    </p>
  </div>
</template>

<style scoped>
.dm-thread {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.dm-thread__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
}

.dm-thread__back {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 20px;
  line-height: 1;
  color: var(--text-secondary);
}

.dm-thread__back:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.dm-thread__who {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.dm-thread__name {
  font-size: 14.5px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dm-thread__menu-wrap {
  position: relative;
  flex-shrink: 0;
}

.dm-thread__menu-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--text-secondary);
  font-size: 13px;
}

.dm-thread__menu-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.dm-thread__menu {
  position: absolute;
  top: 32px;
  right: 0;
  z-index: 5;
  padding: 5px;
  white-space: nowrap;
}

.dm-thread__menu-item {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  color: var(--danger);
  width: 100%;
  text-align: left;
}

.dm-thread__menu-item:hover {
  background: rgba(255, 255, 255, 0.07);
}

.dm-thread__body {
  flex: 1;
  min-height: 200px;
  max-height: min(52vh, 460px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 2px;
}

.dm-thread__empty {
  margin: auto;
  font-size: 13px;
  color: var(--text-secondary);
}

.dm-thread__day {
  align-self: center;
  margin: 6px 0 2px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.dm-thread__msg {
  display: flex;
  flex-direction: column;
  max-width: 78%;
}

.dm-thread__msg--mine {
  align-self: flex-end;
  align-items: flex-end;
}

.dm-thread__msg--theirs {
  align-self: flex-start;
  align-items: flex-start;
}

.dm-thread__bubble {
  padding: 8px 12px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.dm-thread__msg--mine .dm-thread__bubble {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 100%);
  color: #fff;
  border-bottom-right-radius: 5px;
}

.dm-thread__msg--theirs .dm-thread__bubble {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-subtle);
  border-bottom-left-radius: 5px;
}

.dm-thread__time {
  margin: 2px 4px 0;
  font-size: 10.5px;
  color: var(--text-secondary);
}

.dm-thread__error {
  padding: 6px 2px;
  font-size: 12.5px;
  color: var(--danger);
}

.dm-thread__form {
  display: flex;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
}

.dm-thread__input {
  flex: 1;
  min-width: 0;
}

.dm-thread__send {
  padding: 10px 16px;
  flex-shrink: 0;
}

.dm-thread__blocked {
  padding: 12px 2px 2px;
  border-top: 1px solid var(--border-subtle);
  font-size: 12.5px;
  color: var(--text-secondary);
}
</style>
