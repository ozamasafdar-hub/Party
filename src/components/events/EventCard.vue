<script setup>
/**
 * EventCard — bottom sheet that opens when a pin is tapped.
 * Details, cover photo, countdown, share/directions, the live guestlist
 * with waitlist, the Join / RSVP action, and the event chat thread.
 */
import { computed, ref, watch, onBeforeUnmount, nextTick } from 'vue'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { categoryOf } from '@/config/categories'
import { formatWhen, formatDuration, formatCountdown, formatTime, isLive } from '@/utils/datetime'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'

const props = defineProps({
  event: { type: Object, required: true }
})

const emit = defineEmits(['close', 'edit', 'login-required'])

const eventStore = useEventStore()
const authStore = useAuthStore()
const chatStore = useChatStore()

const busy = ref(false)
const error = ref('')
const confirmingCancel = ref(false)
const shareLabel = ref('Share')
const chatOpen = ref(false)
const chatDraft = ref('')
const chatBody = ref(null)

const category = computed(() => categoryOf(props.event.category))
const live = computed(() => isLive(props.event))
const countdown = computed(() => (live.value ? '' : formatCountdown(props.event.startsAt)))
const full = computed(() => eventStore.isFull(props.event))
const spotsLeft = computed(() => eventStore.spotsLeft(props.event))

const meId = computed(() => authStore.currentUser?.id)
const isHost = computed(() => props.event.hostId === meId.value)
const isAttending = computed(() => props.event.attendeeIds.includes(meId.value))
const isWaitlisted = computed(() => eventStore.isWaitlisted(props.event, meId.value))
const waitlistPos = computed(() => eventStore.waitlistPosition(props.event, meId.value))
const canChat = computed(() => isHost.value || isAttending.value || isWaitlisted.value)

const host = computed(
  () =>
    eventStore.memberById(props.event.hostId) ||
    (props.event.hostId === meId.value ? authStore.currentUser : null) || {
      name: 'Member',
      initials: 'M',
      avatarColor: '#94a3b8'
    }
)

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

const guests = computed(() => props.event.attendeeIds.map(resolveMember))

const capacityPct = computed(() =>
  Math.min(100, (props.event.attendeeIds.length / props.event.maxCapacity) * 100)
)

const shareUrl = computed(
  () => `${location.origin}${location.pathname}#/e/${props.event.id}`
)

const directionsUrl = computed(
  () =>
    `https://www.google.com/maps/dir/?api=1&destination=${props.event.lat},${props.event.lng}`
)

const whatsappUrl = computed(
  () =>
    `https://wa.me/?text=${encodeURIComponent(`${props.event.title} — ${formatWhen(props.event.startsAt)} 📍 ${props.event.locationName}\n${shareUrl.value}`)}`
)

/* --- join / waitlist ------------------------------------------------------ */

async function toggleRsvp() {
  if (busy.value) return
  // Visitors can browse freely — joining is the members-only moment
  if (!authStore.isAuthenticated) {
    emit('login-required')
    return
  }
  busy.value = true
  error.value = ''
  try {
    if (isAttending.value || isWaitlisted.value) {
      await eventStore.cancelRsvp(props.event.id, meId.value)
    } else {
      await eventStore.smartJoin(props.event.id, meId.value)
    }
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function cancelEvent() {
  if (!confirmingCancel.value) {
    confirmingCancel.value = true
    return
  }
  busy.value = true
  error.value = ''
  try {
    await eventStore.cancel(props.event.id)
    emit('close')
  } catch (e) {
    error.value = e.message
    confirmingCancel.value = false
  } finally {
    busy.value = false
  }
}

/* --- share ---------------------------------------------------------------- */

async function share() {
  const payload = {
    title: props.event.title,
    text: `${props.event.title} — ${formatWhen(props.event.startsAt)} at ${props.event.locationName}`,
    url: shareUrl.value
  }
  try {
    if (navigator.share) {
      await navigator.share(payload)
      return
    }
  } catch {
    return // user dismissed the share sheet
  }
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    shareLabel.value = 'Link copied!'
  } catch {
    shareLabel.value = shareUrl.value // last resort: show it
  }
  setTimeout(() => (shareLabel.value = 'Share'), 2500)
}

/* --- chat ----------------------------------------------------------------- */

async function toggleChat() {
  chatOpen.value = !chatOpen.value
  if (chatOpen.value) {
    await chatStore.open(props.event.id)
    scrollChat()
  } else {
    chatStore.close()
  }
}

async function sendChat() {
  if (!chatDraft.value.trim()) return
  try {
    await chatStore.send(authStore.currentUser, chatDraft.value)
    chatDraft.value = ''
    scrollChat()
  } catch (e) {
    error.value = e.message
  }
}

async function scrollChat() {
  await nextTick()
  if (chatBody.value) chatBody.value.scrollTop = chatBody.value.scrollHeight
}

watch(
  () => props.event.id,
  async (id) => {
    confirmingCancel.value = false
    error.value = ''
    if (chatOpen.value) {
      await chatStore.open(id)
      scrollChat()
    }
  }
)

watch(
  () => chatStore.messages.length,
  () => {
    if (chatOpen.value) scrollChat()
  }
)

onBeforeUnmount(() => chatStore.close())
</script>

<template>
  <article class="event-card glass-panel">
    <img v-if="event.coverUrl" :src="event.coverUrl" class="event-card__cover" alt="" />

    <button class="event-card__close" aria-label="Close" @click="emit('close')">✕</button>

    <header class="event-card__header">
      <span class="event-card__badge" :style="{ background: category.color }">
        {{ category.label }}
      </span>
      <span v-if="live" class="event-card__live">● LIVE NOW</span>
      <span v-else-if="countdown" class="event-card__countdown">⏱ {{ countdown }}</span>
      <h2 class="event-card__title">{{ event.title }}</h2>
      <p class="event-card__meta">
        📍 {{ event.locationName }} &nbsp;·&nbsp; 🕐 {{ formatWhen(event.startsAt) }}
        &nbsp;·&nbsp; ⏳ {{ formatDuration(event.durationMinutes) }}
      </p>
    </header>

    <p class="event-card__description">{{ event.description }}</p>

    <div class="event-card__share-row">
      <button class="event-card__mini" @click="share">🔗 {{ shareLabel }}</button>
      <a class="event-card__mini" :href="whatsappUrl" target="_blank" rel="noopener">💬 WhatsApp</a>
      <a class="event-card__mini" :href="directionsUrl" target="_blank" rel="noopener">🧭 Directions</a>
    </div>

    <div class="event-card__host">
      <MemberAvatar :member="host" :size="34" />
      <div>
        <div class="event-card__host-name">{{ host.name }}</div>
        <div class="event-card__host-role">Host</div>
      </div>
    </div>

    <section class="event-card__guestlist">
      <div class="event-card__guestlist-head">
        <span>Guestlist · {{ event.attendeeIds.length }}/{{ event.maxCapacity }}</span>
        <span :class="['event-card__spots', { 'event-card__spots--full': full }]">
          <template v-if="full">
            Full{{ event.waitlistIds?.length ? ` · ${event.waitlistIds.length} waiting` : '' }}
          </template>
          <template v-else>{{ spotsLeft }} spot{{ spotsLeft === 1 ? '' : 's' }} left</template>
        </span>
      </div>
      <div class="event-card__capacity">
        <div
          class="event-card__capacity-fill"
          :style="{ width: `${capacityPct}%`, background: full ? 'var(--danger)' : 'var(--success)' }"
        />
      </div>
      <div class="event-card__avatars">
        <MemberAvatar
          v-for="guest in guests"
          :key="guest.id"
          :member="guest"
          :size="30"
          :title="guest.name"
        />
      </div>
    </section>

    <!-- Chat -->
    <section class="event-card__chat">
      <button class="event-card__chat-toggle" @click="toggleChat">
        💬 Event chat
        <span v-if="chatStore.eventId === event.id" class="event-card__chat-count">
          {{ chatStore.messages.length }}
        </span>
        <span class="event-card__chat-caret">{{ chatOpen ? '▾' : '▸' }}</span>
      </button>
      <div v-if="chatOpen" class="event-card__chat-body-wrap">
        <div ref="chatBody" class="event-card__chat-body">
          <p v-if="chatStore.loading" class="event-card__chat-empty">Loading…</p>
          <p v-else-if="!chatStore.messages.length" class="event-card__chat-empty">
            No messages yet — say salam! 👋
          </p>
          <div v-for="message in chatStore.messages" :key="message.id" class="event-card__msg">
            <MemberAvatar :member="resolveMember(message.userId)" :size="26" />
            <div class="event-card__msg-body">
              <span class="event-card__msg-head">
                <strong>{{ resolveMember(message.userId).name }}</strong>
                <span class="event-card__msg-time">{{ formatTime(message.at) }}</span>
              </span>
              <span class="event-card__msg-text">{{ message.text }}</span>
            </div>
          </div>
        </div>
        <form v-if="canChat" class="event-card__chat-form" @submit.prevent="sendChat">
          <input
            v-model="chatDraft"
            class="field-input event-card__chat-input"
            type="text"
            maxlength="500"
            placeholder="Message the group…"
          />
          <button type="submit" class="btn-primary event-card__chat-send" :disabled="!chatDraft.trim()">
            ➤
          </button>
        </form>
        <p v-else class="event-card__chat-hint">Join the event to chat with the group.</p>
      </div>
    </section>

    <p v-if="error" class="event-card__error">{{ error }}</p>

    <footer class="event-card__actions">
      <template v-if="!isHost">
        <button
          v-if="isAttending"
          class="btn-primary event-card__join"
          :disabled="busy"
          @click="toggleRsvp"
        >
          ✓ Going — tap to cancel
        </button>
        <button
          v-else-if="isWaitlisted"
          class="btn-ghost event-card__join"
          :disabled="busy"
          @click="toggleRsvp"
        >
          ⏳ On waitlist · #{{ waitlistPos }} — tap to leave
        </button>
        <button
          v-else
          class="btn-primary event-card__join"
          :disabled="busy"
          @click="toggleRsvp"
        >
          {{ full ? 'Join waitlist' : 'Join · RSVP' }}
        </button>
      </template>
      <template v-else>
        <div class="event-card__hosting">You're hosting this event 🎉</div>
        <div class="event-card__host-actions">
          <button class="btn-ghost" :disabled="busy" @click="emit('edit', event)">
            ✏️ Edit details
          </button>
          <button
            class="btn-ghost event-card__cancel"
            :class="{ 'event-card__cancel--confirm': confirmingCancel }"
            :disabled="busy"
            @click="cancelEvent"
          >
            {{ confirmingCancel ? 'Tap again to confirm' : 'Cancel event' }}
          </button>
        </div>
      </template>
    </footer>
  </article>
</template>

<style scoped>
.event-card {
  position: relative;
  width: min(420px, calc(100vw - 24px));
  max-height: min(78vh, 640px);
  overflow-y: auto;
  padding: 22px;
}

.event-card__cover {
  display: block;
  width: calc(100% + 44px);
  margin: -22px -22px 16px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.event-card__close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(17, 24, 39, 0.6);
  color: var(--text-secondary);
  font-size: 13px;
  z-index: 1;
}

.event-card__close:hover {
  background: rgba(255, 255, 255, 0.16);
  color: var(--text-primary);
}

.event-card__badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #0b0f19;
}

.event-card__live {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--success);
  animation: live-blink 1.6s ease-in-out infinite;
}

@keyframes live-blink {
  50% {
    opacity: 0.45;
  }
}

.event-card__countdown {
  margin-left: 8px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--gold);
}

.event-card__title {
  margin-top: 12px;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.25;
  padding-right: 28px;
}

.event-card__meta {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.event-card__description {
  margin-top: 14px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-primary);
  opacity: 0.9;
}

.event-card__share-row {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.event-card__mini {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 9px 8px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid var(--border-subtle);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-card__mini:hover {
  background: rgba(255, 255, 255, 0.13);
}

.event-card__host {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.045);
}

.event-card__host-name {
  font-size: 14px;
  font-weight: 600;
}

.event-card__host-role {
  font-size: 12px;
  color: var(--gold);
}

.event-card__guestlist {
  margin-top: 16px;
}

.event-card__guestlist-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  font-weight: 600;
}

.event-card__spots {
  font-size: 12px;
  color: var(--success);
}

.event-card__spots--full {
  color: var(--danger);
}

.event-card__capacity {
  margin-top: 8px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.event-card__capacity-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.4s ease;
}

.event-card__avatars {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

/* Chat --------------------------------------------------------------------- */

.event-card__chat {
  margin-top: 16px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.event-card__chat-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 11px 14px;
  font-size: 13.5px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.04);
}

.event-card__chat-count {
  font-size: 11.5px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(198, 45, 85, 0.3);
  color: var(--text-primary);
}

.event-card__chat-caret {
  margin-left: auto;
  color: var(--text-secondary);
}

.event-card__chat-body {
  max-height: 180px;
  overflow-y: auto;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.event-card__chat-empty {
  font-size: 13px;
  color: var(--text-secondary);
  padding: 4px 0;
}

.event-card__msg {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.event-card__msg-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.event-card__msg-head {
  font-size: 12px;
}

.event-card__msg-head strong {
  font-weight: 700;
}

.event-card__msg-time {
  margin-left: 6px;
  font-size: 10.5px;
  color: var(--text-secondary);
}

.event-card__msg-text {
  font-size: 13.5px;
  line-height: 1.4;
  word-break: break-word;
}

.event-card__chat-form {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--border-subtle);
}

.event-card__chat-input {
  flex: 1;
  padding: 9px 12px;
}

.event-card__chat-send {
  padding: 9px 16px;
  font-size: 15px;
}

.event-card__chat-hint {
  padding: 10px 14px;
  border-top: 1px solid var(--border-subtle);
  font-size: 12.5px;
  color: var(--text-secondary);
}

/* Actions ------------------------------------------------------------------ */

.event-card__error {
  margin-top: 12px;
  font-size: 13px;
  color: var(--danger);
}

.event-card__actions {
  margin-top: 18px;
}

.event-card__join {
  width: 100%;
}

.event-card__hosting {
  text-align: center;
  padding: 12px;
  border-radius: var(--radius-md);
  background: rgba(212, 175, 106, 0.12);
  color: var(--gold);
  font-size: 14px;
  font-weight: 600;
}

.event-card__host-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.event-card__host-actions > * {
  flex: 1;
}

.event-card__cancel {
  color: var(--danger);
}

.event-card__cancel--confirm {
  background: rgba(244, 88, 122, 0.16);
  border-color: rgba(244, 88, 122, 0.4);
}
</style>
