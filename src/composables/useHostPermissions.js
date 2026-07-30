import { computed } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useEventStore } from '@/stores/eventStore'
import { hasEnded } from '@/utils/datetime'

/**
 * useHostPermissions — the single place that answers "what can this member
 * do as a host?" based on their subscription tier. The same rules are
 * enforced server-side (enforce_host_tier trigger) and in the demo
 * backend; this composable exists so the UI can gate and explain BEFORE
 * a request is ever made.
 */

export const FREE_LIMITS = {
  maxCapacity: 5, // guests per free event
  maxLivePins: 1, // simultaneous active events on the map
  maxPerMonth: 2 // events created per calendar month
}

export const PRO_PRICE_QAR = 99
export const PRO_MAX_CAPACITY = 100

export const PRO_PERKS = [
  { icon: '📌', text: 'Unlimited events & live pins on the map' },
  { icon: '👥', text: `Host up to ${PRO_MAX_CAPACITY} guests per event` },
  { icon: '💳', text: 'Charge per spot in QAR — escrow protected' },
  { icon: '✨', text: 'Featured glowing pin that stands out on the map' },
  { icon: '📣', text: '1-click WhatsApp blasts to your confirmed guests' },
  { icon: '⭐', text: 'Reliability lock — only members who show up' }
]

export function useHostPermissions() {
  const authStore = useAuthStore()
  const eventStore = useEventStore()

  const isPro = computed(
    () => authStore.currentUser?.subscriptionTier === 'host_pro'
  )

  const myActivePins = computed(() => {
    const meId = authStore.currentUser?.id
    if (!meId) return 0
    return eventStore.events.filter((e) => e.hostId === meId && !hasEnded(e)).length
  })

  const eventsThisMonth = computed(() => {
    const meId = authStore.currentUser?.id
    if (!meId) return 0
    const now = new Date()
    return eventStore.events.filter((e) => {
      if (e.hostId !== meId) return false
      const created = new Date(e.createdAt || e.startsAt)
      return (
        created.getFullYear() === now.getFullYear() &&
        created.getMonth() === now.getMonth()
      )
    }).length
  })

  /** Empty string = allowed; otherwise the reason to show in the paywall. */
  const createBlockReason = computed(() => {
    if (!authStore.isAuthenticated || isPro.value) return ''
    if (myActivePins.value >= FREE_LIMITS.maxLivePins) {
      return `Free hosts keep ${FREE_LIMITS.maxLivePins} live pin on the map at a time — yours is still up.`
    }
    if (eventsThisMonth.value >= FREE_LIMITS.maxPerMonth) {
      return `Free hosts can create ${FREE_LIMITS.maxPerMonth} events per month — you've used both.`
    }
    return ''
  })

  const maxCapacity = computed(() =>
    isPro.value ? PRO_MAX_CAPACITY : FREE_LIMITS.maxCapacity
  )

  return {
    isPro,
    maxCapacity,
    canCharge: isPro,
    canFeaturePin: isPro,
    canReliabilityLock: isPro,
    canBroadcast: isPro,
    myActivePins,
    eventsThisMonth,
    createBlockReason
  }
}
