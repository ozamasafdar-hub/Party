<script setup>
/**
 * EventCard — bottom sheet that opens when a pin is tapped.
 * Shows event details, the live guestlist, and the Join / RSVP action.
 * RSVPs auto-close (button disabled) once max capacity is reached.
 */
import { computed, ref } from 'vue'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { categoryOf } from '@/config/categories'
import { formatWhen, formatDuration, isLive } from '@/utils/datetime'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'

const props = defineProps({
  event: { type: Object, required: true }
})

const emit = defineEmits(['close', 'edit', 'login-required'])

const eventStore = useEventStore()
const authStore = useAuthStore()
const busy = ref(false)
const error = ref('')
const confirmingCancel = ref(false)

const category = computed(() => categoryOf(props.event.category))
const live = computed(() => isLive(props.event))
const full = computed(() => eventStore.isFull(props.event))
const spotsLeft = computed(() => eventStore.spotsLeft(props.event))

const isHost = computed(() => props.event.hostId === authStore.currentUser?.id)
const isAttending = computed(() =>
  props.event.attendeeIds.includes(authStore.currentUser?.id)
)

const host = computed(
  () =>
    eventStore.memberById(props.event.hostId) || {
      name: 'Member',
      initials: 'M',
      avatarColor: '#94a3b8'
    }
)

const guests = computed(() =>
  props.event.attendeeIds
    .map(
      (id) =>
        eventStore.memberById(id) ||
        (id === authStore.currentUser?.id ? authStore.currentUser : null)
    )
    .filter(Boolean)
)

const capacityPct = computed(() =>
  Math.min(100, (props.event.attendeeIds.length / props.event.maxCapacity) * 100)
)

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
    if (isAttending.value) {
      await eventStore.cancelRsvp(props.event.id, authStore.currentUser.id)
    } else {
      await eventStore.rsvp(props.event.id, authStore.currentUser.id)
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
</script>

<template>
  <article class="event-card glass-panel">
    <button class="event-card__close" aria-label="Close" @click="emit('close')">✕</button>

    <header class="event-card__header">
      <span class="event-card__badge" :style="{ background: category.color }">
        {{ category.label }}
      </span>
      <span v-if="live" class="event-card__live">● LIVE NOW</span>
      <h2 class="event-card__title">{{ event.title }}</h2>
      <p class="event-card__meta">
        📍 {{ event.locationName }} &nbsp;·&nbsp; 🕐 {{ formatWhen(event.startsAt) }}
        &nbsp;·&nbsp; ⏳ {{ formatDuration(event.durationMinutes) }}
      </p>
    </header>

    <p class="event-card__description">{{ event.description }}</p>

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
          {{ full ? 'RSVPs closed — full' : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left` }}
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

    <p v-if="error" class="event-card__error">{{ error }}</p>

    <footer class="event-card__actions">
      <button
        v-if="!isHost"
        class="btn-primary event-card__join"
        :disabled="busy || (full && !isAttending)"
        @click="toggleRsvp"
      >
        <template v-if="isAttending">✓ Going — tap to cancel</template>
        <template v-else-if="full">Event full</template>
        <template v-else>Join · RSVP</template>
      </button>
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
  max-height: min(72vh, 560px);
  overflow-y: auto;
  padding: 22px;
}

.event-card__close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  font-size: 13px;
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

.event-card__host {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
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
