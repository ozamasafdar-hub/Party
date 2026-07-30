<script setup>
/**
 * HostProModal — the upgrade paywall. Shown when a free host taps a
 * pro-only control or hits a free-tier limit. The upgrade itself is
 * SIMULATED (flips the tier instantly) until real billing is wired.
 */
import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useNotifStore } from '@/stores/notifStore'
import { PRO_PERKS, PRO_PRICE_QAR } from '@/composables/useHostPermissions'

defineProps({
  reason: { type: String, default: '' } // why the paywall appeared
})

const emit = defineEmits(['close', 'upgraded'])

const authStore = useAuthStore()
const notifStore = useNotifStore()
const busy = ref(false)
const error = ref('')

async function upgrade() {
  busy.value = true
  error.value = ''
  try {
    await authStore.setSubscription('host_pro')
    notifStore.flash('👑 Welcome to Host Pro — all limits lifted!')
    emit('upgraded')
    emit('close')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="pro glass-panel">
      <button class="pro__close" aria-label="Close" @click="emit('close')">✕</button>

      <div class="pro__crown">👑</div>
      <h2 class="pro__title">Host Pro</h2>
      <p class="pro__tag">For hosts who bring the city together.</p>

      <p v-if="reason" class="pro__reason">{{ reason }}</p>

      <ul class="pro__perks">
        <li v-for="perk in PRO_PERKS" :key="perk.text" class="pro__perk">
          <span class="pro__perk-icon">{{ perk.icon }}</span>
          <span>{{ perk.text }}</span>
        </li>
      </ul>

      <div class="pro__price">
        <strong>QAR {{ PRO_PRICE_QAR }}</strong><span> / month · cancel anytime</span>
      </div>

      <p v-if="error" class="pro__error">{{ error }}</p>

      <button class="btn-primary pro__cta" :disabled="busy" @click="upgrade">
        {{ busy ? 'Upgrading…' : '👑 Upgrade to Host Pro' }}
      </button>
      <button class="pro__later" :disabled="busy" @click="emit('close')">Maybe later</button>

      <p class="pro__note">Simulated subscription — no real billing yet.</p>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 8, 15, 0.68);
  backdrop-filter: blur(5px);
  padding: 16px;
}

.pro {
  position: relative;
  width: min(400px, 100%);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 28px 26px 22px;
  text-align: center;
  border: 1px solid rgba(212, 175, 106, 0.35);
  box-shadow: 0 12px 48px rgba(212, 175, 106, 0.14);
}

.pro__close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  font-size: 12px;
  z-index: 1;
}

.pro__crown {
  font-size: 40px;
  filter: drop-shadow(0 4px 14px rgba(212, 175, 106, 0.55));
  pointer-events: none;
}

.pro__title {
  margin-top: 6px;
  font-size: 24px;
  font-weight: 800;
  background: linear-gradient(120deg, #d4af6a, #f4e9c9, #d4af6a);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.pro__tag {
  margin-top: 2px;
  font-size: 13px;
  color: var(--text-secondary);
}

.pro__reason {
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: rgba(212, 175, 106, 0.1);
  border: 1px solid rgba(212, 175, 106, 0.3);
  color: var(--gold);
  font-size: 13px;
  line-height: 1.45;
}

.pro__perks {
  margin-top: 16px;
  list-style: none;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.pro__perk {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
  line-height: 1.35;
}

.pro__perk-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(212, 175, 106, 0.12);
  font-size: 14px;
}

.pro__price {
  margin-top: 18px;
  font-size: 14px;
  color: var(--text-secondary);
}

.pro__price strong {
  font-size: 22px;
  color: var(--text-primary);
  font-weight: 800;
}

.pro__error {
  margin-top: 10px;
  font-size: 13px;
  color: var(--danger);
}

.pro__cta {
  width: 100%;
  margin-top: 14px;
  padding: 13px;
  font-size: 15px;
}

.pro__later {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.pro__later:hover {
  color: var(--text-primary);
}

.pro__note {
  margin-top: 12px;
  font-size: 11.5px;
  color: var(--text-secondary);
}
</style>
