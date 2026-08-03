<script setup>
/**
 * EventCard — bottom sheet that opens when a pin is tapped.
 * Details, cover photo, countdown, share/directions, the live guestlist
 * with waitlist, the Join / RSVP action, and the event chat thread.
 */
import { computed, ref, watch, onBeforeUnmount, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useFollowStore } from '@/stores/followStore'
import { categoryOf } from '@/config/categories'
import { formatWhen, formatDuration, formatCountdown, formatTime, isLive, hasEnded } from '@/utils/datetime'
import { googleCalendarUrl, icsDataUrl } from '@/utils/calendar'
import { distanceKm, formatDistance } from '@/utils/geo'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import CheckoutModal from '@/components/events/CheckoutModal.vue'
import HostRequestsPanel from '@/components/events/HostRequestsPanel.vue'
import HostProModal from '@/components/pro/HostProModal.vue'
import { useHostPermissions } from '@/composables/useHostPermissions'

const props = defineProps({
  event: { type: Object, required: true }
})

const emit = defineEmits(['close', 'edit', 'login-required'])

const eventStore = useEventStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const followStore = useFollowStore()

const busy = ref(false)
const error = ref('')
const confirmingCancel = ref(false)
const shareLabel = ref('Share')
const showCalendar = ref(false)
const chatOpen = ref(false)
const chatDraft = ref('')
const chatBody = ref(null)
const { canBroadcast, isPro } = useHostPermissions()
const showProModal = ref(false)
const proModalReason = ref('')
const followBusy = ref(false)
const showCheckout = ref(false)
const showRequests = ref(false)
const showAttendance = ref(false)
const showedUp = ref([]) // guest ids ticked as present in the attendance panel
const exactCoords = ref(null) // unlocked coords for blurred-location events
const photoIndex = ref(0) // which gallery photo is shown big

const photos = computed(() =>
  props.event.photoUrls?.length
    ? props.event.photoUrls
    : props.event.coverUrl
      ? [props.event.coverUrl]
      : []
)

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
const isRequested = computed(() => eventStore.isRequested(props.event, meId.value))
const canChat = computed(() => isHost.value || isAttending.value || isWaitlisted.value)

const ended = computed(() => hasEnded(props.event))
const isPaid = computed(() => Number(props.event.pricePerSpot) > 0)
const priceAmount = computed(() => Number(props.event.pricePerSpot).toFixed(0))
const requestCount = computed(() => (props.event.requestedIds || []).length)

const myPayment = computed(() =>
  meId.value ? eventStore.paymentFor(props.event, meId.value) : null
)
const spotGuaranteed = computed(
  () =>
    !!myPayment.value &&
    ['held_in_escrow', 'released'].includes(myPayment.value.status)
)

function guestPaid(id) {
  const p = eventStore.paymentFor(props.event, id)
  return !!p && ['held_in_escrow', 'released'].includes(p.status)
}

/**
 * Pro-only events: free members can look, but not join. Visitors get the
 * normal sign-in gate first — they might already be Host Pro.
 */
const proBlocked = computed(
  () =>
    props.event.proOnly &&
    !isHost.value &&
    authStore.isAuthenticated &&
    !isPro.value
)

const followingHost = computed(() => followStore.isFollowing(props.event.hostId))

async function toggleFollowHost() {
  if (!authStore.isAuthenticated) {
    emit('login-required')
    return
  }
  followBusy.value = true
  try {
    await followStore.toggle(meId.value, props.event.hostId)
  } finally {
    followBusy.value = false
  }
}

const joinLabel = computed(() => {
  if (props.event.approvalMode) {
    return isPaid.value ? `🙋 Request to join · QAR ${priceAmount.value}` : '🙋 Request to join'
  }
  if (full.value) return 'Join waitlist'
  return isPaid.value ? `Reserve spot · QAR ${priceAmount.value}` : 'Join · RSVP'
})

/* --- blurred location ----------------------------------------------------- */

const entitledToExact = computed(() => isHost.value || isAttending.value)
const showDirections = computed(
  () => !props.event.locationBlurred || (entitledToExact.value && !!exactCoords.value)
)

watch(
  [() => props.event.id, entitledToExact],
  async ([id, entitled]) => {
    exactCoords.value = null
    if (entitled && props.event.locationBlurred) {
      try {
        exactCoords.value = await eventStore.fetchExactLocation(id)
      } catch {
        /* keep approximate coords */
      }
    }
  },
  { immediate: true }
)

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

const directionsUrl = computed(() => {
  const to = exactCoords.value || { lat: props.event.lat, lng: props.event.lng }
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`
})

// Rich WhatsApp share card — bold title, when, host, urgency, deep link.
const whatsappUrl = computed(() => {
  const lines = [
    `🇶🇦 *${props.event.title}* @ ${props.event.locationName}`,
    `📅 ${formatWhen(props.event.startsAt)} (${formatDuration(props.event.durationMinutes)})`,
    `👤 Hosted by ${host.value.name}`,
    `🎟️ ${spotsLeft.value} spot${spotsLeft.value === 1 ? '' : 's'} remaining!`,
    '',
    `👉 Lock in your spot on WYN: ${shareUrl.value}`
  ]
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`
})

const googleUrl = computed(() => googleCalendarUrl(props.event, shareUrl.value))
const icsUrl = computed(() => icsDataUrl(props.event, shareUrl.value))

// Host Pro perk: 1-click WhatsApp update ready to forward to the group
const broadcastUrl = computed(() => {
  const lines = [
    `📣 *Update from your host — ${props.event.title}*`,
    `📍 ${props.event.locationName} · 📅 ${formatWhen(props.event.startsAt)}`,
    '',
    `🎟 Details & guestlist: ${shareUrl.value}`
  ]
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`
})

const distanceText = computed(() => {
  const here = eventStore.userLocation
  if (!here) return ''
  return `${formatDistance(distanceKm(here, props.event))} away`
})

const friendsGoing = computed(() =>
  followStore.friendsIn(props.event).filter((id) => id !== meId.value)
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
    if (isAttending.value || isWaitlisted.value || isRequested.value) {
      await eventStore.cancelRsvp(props.event.id, meId.value)
    } else if (isPaid.value) {
      // Paid events go through the (simulated) escrow checkout first
      showCheckout.value = true
    } else {
      await eventStore.smartJoin(props.event.id, meId.value)
    }
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

/* --- attendance (host, after the event ends) ------------------------------ */

function toggleAttendance() {
  if (!showAttendance.value) {
    // Everyone starts ticked as "showed up" — untick the flakes.
    showedUp.value = props.event.attendeeIds.filter((id) => id !== meId.value)
  }
  showAttendance.value = !showAttendance.value
}

async function saveAttendance() {
  busy.value = true
  error.value = ''
  try {
    const noShows = props.event.attendeeIds.filter(
      (id) => id !== meId.value && !showedUp.value.includes(id)
    )
    await eventStore.markAttendance(props.event.id, meId.value, noShows)
    showAttendance.value = false
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
    photoIndex.value = 0
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
    <img
      v-if="photos.length"
      :src="photos[Math.min(photoIndex, photos.length - 1)]"
      class="event-card__cover"
      alt=""
    />
    <div v-if="photos.length > 1" class="event-card__gallery">
      <button
        v-for="(photo, i) in photos"
        :key="i"
        class="event-card__thumb"
        :class="{ 'event-card__thumb--active': i === photoIndex }"
        :aria-label="`Photo ${i + 1}`"
        @click="photoIndex = i"
      >
        <img :src="photo" alt="" />
      </button>
    </div>

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
        &nbsp;·&nbsp; ⏳ {{ formatDuration(event.durationMinutes)
        }}<template v-if="distanceText"> &nbsp;·&nbsp; 📏 {{ distanceText }}</template>
      </p>
      <div
        v-if="isPaid || event.ladiesOnly || event.approvalMode || event.minReliability || event.featuredPin || event.isProEvent || event.proOnly"
        class="event-card__chips"
      >
        <span v-if="event.proOnly" class="event-card__chip event-card__chip--gold">
          👑 Host Pro only
        </span>
        <span v-if="event.featuredPin" class="event-card__chip event-card__chip--gold">
          ✨ Featured
        </span>
        <span v-else-if="event.isProEvent" class="event-card__chip event-card__chip--gold">
          👑 Pro host
        </span>
        <span v-if="isPaid" class="event-card__chip event-card__chip--gold">
          🎟 QAR {{ priceAmount }} / spot
        </span>
        <span v-if="event.ladiesOnly" class="event-card__chip event-card__chip--ladies">
          🚺 Ladies only
        </span>
        <span v-if="event.approvalMode" class="event-card__chip">✋ Host approval</span>
        <span v-if="event.minReliability" class="event-card__chip">
          ⭐ {{ event.minReliability }}%+ reliability
        </span>
      </div>
    </header>

    <p class="event-card__description">{{ event.description }}</p>

    <p v-if="event.locationBlurred && !entitledToExact" class="event-card__blur-note">
      📍 Approximate area shown — the exact spot unlocks once you're on the guestlist.
    </p>
    <p
      v-else-if="event.locationBlurred && entitledToExact"
      class="event-card__blur-note event-card__blur-note--ok"
    >
      📍 Exact location unlocked for you.
    </p>

    <div class="event-card__share-row">
      <button class="event-card__mini" @click="share">🔗 {{ shareLabel }}</button>
      <a class="event-card__mini" :href="whatsappUrl" target="_blank" rel="noopener">💬 WhatsApp</a>
      <a
        v-if="showDirections"
        class="event-card__mini"
        :href="directionsUrl"
        target="_blank"
        rel="noopener"
      >🧭 Directions</a>
      <span
        v-else
        class="event-card__mini event-card__mini--locked"
        title="Exact location unlocks once you're on the guestlist"
      >🔒 Directions</span>
      <button class="event-card__mini" @click="showCalendar = !showCalendar">📅 Calendar</button>
    </div>

    <div v-if="showCalendar" class="event-card__calendar">
      <a class="event-card__mini" :href="googleUrl" target="_blank" rel="noopener">
        Google Calendar
      </a>
      <a class="event-card__mini" :href="icsUrl" download="wyn-event.ics">
        Download .ics (Apple / Outlook)
      </a>
    </div>

    <div class="event-card__host-row">
      <RouterLink
        class="event-card__host"
        :to="{ name: 'profile', params: { id: event.hostId } }"
        title="View host profile"
      >
        <MemberAvatar :member="host" :size="34" />
        <div>
          <div class="event-card__host-name">{{ host.name }}</div>
          <div class="event-card__host-role">Host · view profile →</div>
        </div>
      </RouterLink>
      <button
        v-if="!isHost"
        class="event-card__follow"
        :class="{ 'event-card__follow--on': followingHost }"
        :disabled="followBusy"
        :title="followingHost ? 'Unfollow' : 'Get notified when they post a new event'"
        @click="toggleFollowHost"
      >
        {{ followingHost ? '✓ Following' : '⭐ Follow' }}
      </button>
    </div>

    <p v-if="friendsGoing.length" class="event-card__friends">
      ⭐ {{ friendsGoing.length }} friend{{ friendsGoing.length === 1 ? '' : 's' }} going —
      {{ friendsGoing.map((id) => resolveMember(id).name.split(' ')[0]).join(', ') }}
    </p>

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
        <RouterLink
          v-for="guest in guests"
          :key="guest.id"
          class="event-card__avatar-wrap"
          :to="{ name: 'profile', params: { id: guest.id } }"
          :title="guestPaid(guest.id) ? `${guest.name} · 💳 Spot guaranteed` : guest.name"
        >
          <MemberAvatar :member="guest" :size="30" />
          <span v-if="guestPaid(guest.id)" class="event-card__paid-dot">💳</span>
        </RouterLink>
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
        <p v-if="isAttending && spotGuaranteed" class="event-card__guaranteed">
          💳 Spot guaranteed — payment held in escrow
        </p>
        <button
          v-if="isAttending"
          class="btn-primary event-card__join"
          :disabled="busy"
          @click="toggleRsvp"
        >
          ✓ Going — tap to cancel
        </button>
        <button
          v-else-if="isRequested"
          class="btn-ghost event-card__join event-card__join--pending"
          :disabled="busy"
          @click="toggleRsvp"
        >
          📨 Request pending — tap to withdraw
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
          v-else-if="proBlocked"
          class="btn-primary event-card__join"
          @click="proModalReason = 'This host opened the event to Host Pro members only.'; showProModal = true"
        >
          👑 Host Pro members only — upgrade to join
        </button>
        <button
          v-else-if="isPaid && full && !event.approvalMode"
          class="btn-ghost event-card__join"
          disabled
        >
          Event full
        </button>
        <button
          v-else
          class="btn-primary event-card__join"
          :disabled="busy"
          @click="toggleRsvp"
        >
          {{ joinLabel }}
        </button>
      </template>
      <template v-else>
        <div class="event-card__hosting">You're hosting this event 🎉</div>
        <button
          v-if="event.approvalMode && !ended"
          class="btn-primary event-card__requests-btn"
          @click="showRequests = true"
        >
          🙋 Join requests ({{ requestCount }})
        </button>
        <a
          v-if="!ended && canBroadcast"
          class="btn-ghost event-card__broadcast"
          :href="broadcastUrl"
          target="_blank"
          rel="noopener"
        >
          📣 WhatsApp blast to guests
        </a>
        <button
          v-else-if="!ended"
          class="btn-ghost event-card__broadcast"
          @click="proModalReason = 'WhatsApp blasts to your guests are a Host Pro perk.'; showProModal = true"
        >
          📣 WhatsApp blast 🔒
        </button>
        <div v-if="ended && event.attendeeIds.length > 1" class="event-card__attendance">
          <p v-if="event.attendanceRecorded" class="event-card__attendance-done">
            ✅ Attendance recorded — reliability scores updated
          </p>
          <template v-else>
            <button class="btn-ghost event-card__attendance-toggle" @click="toggleAttendance">
              ✅ Mark attendance {{ showAttendance ? '▾' : '▸' }}
            </button>
            <div v-if="showAttendance" class="event-card__attendance-list">
              <p class="event-card__attendance-hint">
                Untick anyone who didn't show up — this updates their reliability score.
              </p>
              <label
                v-for="guest in guests.filter((g) => g.id !== meId)"
                :key="guest.id"
                class="event-card__attendance-row"
              >
                <input v-model="showedUp" type="checkbox" :value="guest.id" />
                <MemberAvatar :member="guest" :size="26" />
                <span>{{ guest.name }}</span>
              </label>
              <button
                class="btn-primary event-card__attendance-save"
                :disabled="busy"
                @click="saveAttendance"
              >
                Save attendance
              </button>
            </div>
          </template>
        </div>
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

  <CheckoutModal
    v-if="showCheckout"
    :event="event"
    @close="showCheckout = false"
    @paid="showCheckout = false"
  />
  <HostRequestsPanel v-if="showRequests" :event="event" @close="showRequests = false" />
  <HostProModal
    v-if="showProModal"
    :reason="proModalReason"
    @close="showProModal = false"
  />
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

.event-card__gallery {
  display: flex;
  gap: 6px;
  margin: -8px 0 14px;
  overflow-x: auto;
  scrollbar-width: none;
}

.event-card__gallery::-webkit-scrollbar {
  display: none;
}

.event-card__thumb {
  flex-shrink: 0;
  width: 58px;
  aspect-ratio: 16 / 9;
  padding: 0;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid transparent;
  opacity: 0.65;
  transition: all 0.15s ease;
}

.event-card__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.event-card__thumb--active {
  border-color: var(--gold);
  opacity: 1;
}

.event-card__thumb:hover {
  opacity: 1;
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

.event-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.event-card__chip {
  padding: 4px 11px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.event-card__chip--gold {
  background: rgba(212, 175, 106, 0.14);
  border-color: rgba(212, 175, 106, 0.4);
  color: var(--gold);
}

.event-card__chip--ladies {
  background: rgba(244, 114, 182, 0.14);
  border-color: rgba(244, 114, 182, 0.45);
  color: #f9a8d4;
}

.event-card__blur-note {
  margin-top: 12px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  background: rgba(56, 189, 248, 0.1);
  border: 1px dashed rgba(56, 189, 248, 0.4);
  color: #7dd3fc;
  font-size: 12.5px;
  line-height: 1.45;
}

.event-card__blur-note--ok {
  background: rgba(45, 212, 160, 0.1);
  border-color: rgba(45, 212, 160, 0.4);
  color: var(--success);
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
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.event-card__share-row > .event-card__mini {
  flex: 1 1 45%;
}

.event-card__calendar {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.event-card__calendar > .event-card__mini {
  flex: 1;
}

.event-card__friends {
  margin-top: 12px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  background: rgba(212, 175, 106, 0.1);
  color: var(--gold);
  font-size: 13px;
  font-weight: 600;
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

.event-card__mini--locked {
  opacity: 0.55;
  cursor: not-allowed;
}

.event-card__mini--locked:hover {
  background: rgba(255, 255, 255, 0.07);
}

.event-card__host-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

.event-card__host {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.045);
  transition: background 0.15s ease;
}

.event-card__follow {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  padding: 9px 14px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--gold);
  background: rgba(212, 175, 106, 0.12);
  border: 1px solid rgba(212, 175, 106, 0.4);
  white-space: nowrap;
  transition: all 0.15s ease;
}

.event-card__follow:hover {
  background: rgba(212, 175, 106, 0.2);
}

.event-card__follow--on {
  color: var(--success);
  background: rgba(45, 212, 160, 0.12);
  border-color: rgba(45, 212, 160, 0.4);
}

.event-card__host:hover {
  background: rgba(255, 255, 255, 0.09);
}

.event-card__host > div {
  min-width: 0;
}

.event-card__host-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.event-card__avatar-wrap {
  position: relative;
  display: inline-flex;
}

.event-card__paid-dot {
  position: absolute;
  right: -4px;
  bottom: -4px;
  font-size: 10px;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
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

.event-card__join--pending {
  color: var(--gold);
  border-color: rgba(212, 175, 106, 0.45);
  background: rgba(212, 175, 106, 0.1);
}

.event-card__guaranteed {
  margin-bottom: 10px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  background: rgba(45, 212, 160, 0.1);
  border: 1px solid rgba(45, 212, 160, 0.35);
  color: var(--success);
  font-size: 12.5px;
  font-weight: 600;
  text-align: center;
}

.event-card__requests-btn {
  width: 100%;
  margin-top: 10px;
}

.event-card__broadcast {
  display: flex;
  width: 100%;
  margin-top: 10px;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.event-card__attendance {
  margin-top: 10px;
}

.event-card__attendance-toggle {
  width: 100%;
}

.event-card__attendance-done {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: rgba(45, 212, 160, 0.1);
  color: var(--success);
  font-size: 12.5px;
  font-weight: 600;
  text-align: center;
}

.event-card__attendance-list {
  margin-top: 10px;
  padding: 12px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.045);
}

.event-card__attendance-hint {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.45;
  margin-bottom: 10px;
}

.event-card__attendance-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 0;
  font-size: 13.5px;
  cursor: pointer;
}

.event-card__attendance-row input {
  accent-color: var(--success);
  width: 16px;
  height: 16px;
}

.event-card__attendance-save {
  width: 100%;
  margin-top: 10px;
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
