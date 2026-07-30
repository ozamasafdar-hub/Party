<script setup>
/**
 * HostRequestsPanel — the host reviews pending join requests: profile,
 * bio, reliability record, and Approve / Decline actions.
 */
import { computed, ref } from 'vue'
import { useEventStore } from '@/stores/eventStore'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'

const props = defineProps({
  event: { type: Object, required: true }
})

const emit = defineEmits(['close'])

const eventStore = useEventStore()
const busyId = ref(null)
const error = ref('')

const requests = computed(() =>
  (props.event.requestedIds || []).map(
    (id) =>
      eventStore.memberById(id) || {
        id,
        name: 'Member',
        initials: 'M',
        avatarColor: '#94a3b8',
        reliability: 100,
        attended: 0,
        bio: ''
      }
  )
)

async function act(memberId, approve) {
  busyId.value = memberId
  error.value = ''
  try {
    if (approve) await eventStore.approve(props.event.id, memberId)
    else await eventStore.decline(props.event.id, memberId)
  } catch (e) {
    error.value = e.message
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="requests glass-panel">
      <header class="requests__head">
        <h2 class="requests__title">Join requests</h2>
        <button class="requests__close" aria-label="Close" @click="emit('close')">✕</button>
      </header>

      <p v-if="!requests.length" class="requests__empty">
        No pending requests — new ones appear here for you to approve.
      </p>

      <div v-for="member in requests" :key="member.id" class="requests__row">
        <MemberAvatar :member="member" :size="42" />
        <div class="requests__body">
          <div class="requests__name">{{ member.name }}</div>
          <div class="requests__stats">
            ⭐ {{ member.reliability }}% reliable · {{ member.attended }} attended
          </div>
          <div v-if="member.bio" class="requests__bio">{{ member.bio }}</div>
        </div>
        <div class="requests__actions">
          <button
            class="btn-primary requests__approve"
            :disabled="busyId === member.id"
            @click="act(member.id, true)"
          >
            Approve
          </button>
          <button
            class="btn-ghost requests__decline"
            :disabled="busyId === member.id"
            @click="act(member.id, false)"
          >
            Decline
          </button>
        </div>
      </div>

      <p v-if="error" class="requests__error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 8, 15, 0.65);
  backdrop-filter: blur(4px);
  padding: 16px;
}

.requests {
  width: min(440px, 100%);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 22px;
}

.requests__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.requests__title {
  font-size: 18px;
  font-weight: 700;
}

.requests__close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  font-size: 12px;
}

.requests__empty {
  font-size: 13.5px;
  color: var(--text-secondary);
  line-height: 1.5;
  padding: 8px 0;
}

.requests__row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 10px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.04);
  margin-bottom: 10px;
}

.requests__body {
  flex: 1;
  min-width: 0;
}

.requests__name {
  font-size: 14.5px;
  font-weight: 700;
}

.requests__stats {
  margin-top: 2px;
  font-size: 12px;
  color: var(--gold);
}

.requests__bio {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.requests__actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.requests__approve {
  padding: 8px 16px;
  font-size: 13px;
}

.requests__decline {
  padding: 7px 16px;
  font-size: 12.5px;
  color: var(--danger);
}

.requests__error {
  margin-top: 8px;
  font-size: 13px;
  color: var(--danger);
}
</style>
