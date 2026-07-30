<script setup>
/**
 * CheckoutModal — simulated escrow checkout for paid events. Confirms the
 * price in QAR, then records the payment and joins (or requests to join).
 * Clearly labeled as a simulation until a real payment gateway is wired.
 */
import { computed, ref } from 'vue'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'

const props = defineProps({
  event: { type: Object, required: true }
})

const emit = defineEmits(['close', 'paid'])

const eventStore = useEventStore()
const authStore = useAuthStore()
const busy = ref(false)
const error = ref('')

const amount = computed(() => Number(props.event.pricePerSpot).toFixed(0))

async function pay() {
  busy.value = true
  error.value = ''
  try {
    await eventStore.payAndJoin(props.event.id, authStore.currentUser.id, Number(amount.value))
    emit('paid')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="checkout glass-panel">
      <h2 class="checkout__title">Reserve your spot</h2>
      <p class="checkout__event">{{ event.title }}</p>

      <div class="checkout__summary">
        <div class="checkout__row">
          <span>Spot price</span>
          <span>QAR {{ amount }}</span>
        </div>
        <div class="checkout__row">
          <span>WYN fee</span>
          <span>QAR 0</span>
        </div>
        <div class="checkout__row checkout__row--total">
          <span>Total</span>
          <span>QAR {{ amount }}</span>
        </div>
      </div>

      <p class="checkout__escrow">
        🔒 Held in escrow — the host receives it after the event.
        <template v-if="event.approvalMode">
          Charged only if the host approves your request.
        </template>
      </p>

      <p v-if="error" class="checkout__error">{{ error }}</p>

      <div class="checkout__actions">
        <button class="btn-ghost" :disabled="busy" @click="emit('close')">Cancel</button>
        <button class="btn-primary" :disabled="busy" @click="pay">
          {{ busy ? 'Processing…' : event.approvalMode ? `Request & authorize QAR ${amount}` : `Pay QAR ${amount}` }}
        </button>
      </div>

      <p class="checkout__note">Simulated payment — no real money moves yet.</p>
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

.checkout {
  width: min(380px, 100%);
  padding: 26px;
}

.checkout__title {
  font-size: 19px;
  font-weight: 700;
}

.checkout__event {
  margin-top: 4px;
  font-size: 13.5px;
  color: var(--text-secondary);
}

.checkout__summary {
  margin-top: 18px;
  padding: 14px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.045);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkout__row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.checkout__row--total {
  border-top: 1px solid var(--border-subtle);
  padding-top: 8px;
  color: var(--text-primary);
  font-weight: 700;
  font-size: 15px;
}

.checkout__escrow {
  margin-top: 14px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--gold);
}

.checkout__error {
  margin-top: 12px;
  font-size: 13px;
  color: var(--danger);
}

.checkout__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.checkout__note {
  margin-top: 14px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-secondary);
}
</style>
