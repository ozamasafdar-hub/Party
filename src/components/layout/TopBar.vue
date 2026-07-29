<script setup>
import { RouterLink } from 'vue-router'
import { CATEGORIES } from '@/config/categories'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'

const eventStore = useEventStore()
const authStore = useAuthStore()

defineEmits(['signin'])
</script>

<template>
  <header class="top-bar">
    <div class="top-bar__brand glass-panel">
      <span class="top-bar__logo">🗺️</span>
      <div>
        <div class="top-bar__name">WYN</div>
        <div class="top-bar__tagline">{{ eventStore.visibleEvents.length }} events live in Qatar</div>
      </div>
    </div>

    <nav class="top-bar__filters" aria-label="Filter by category">
      <button
        v-for="(cat, key) in CATEGORIES"
        :key="key"
        class="top-bar__chip glass-panel"
        :class="{ 'top-bar__chip--active': eventStore.activeCategory === key }"
        :style="eventStore.activeCategory === key ? { background: cat.color, color: '#0b0f19' } : {}"
        @click="eventStore.setCategory(key)"
      >
        {{ cat.label }}
      </button>
    </nav>

    <RouterLink
      v-if="authStore.currentUser"
      class="top-bar__profile glass-panel"
      :to="{ name: 'profile' }"
      :title="authStore.currentUser.name"
    >
      <MemberAvatar :member="authStore.currentUser" :size="38" />
    </RouterLink>
    <button v-else class="top-bar__signin glass-panel" @click="$emit('signin')">
      Sign in
    </button>
  </header>
</template>

<style scoped>
.top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: max(14px, env(safe-area-inset-top)) 14px 0;
  pointer-events: none;
}

.top-bar > * {
  pointer-events: auto;
}

.top-bar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  flex-shrink: 0;
}

.top-bar__logo {
  font-size: 22px;
}

.top-bar__name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.top-bar__tagline {
  font-size: 11.5px;
  color: var(--text-secondary);
}

.top-bar__filters {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 6px;
  flex: 1;
}

.top-bar__filters::-webkit-scrollbar {
  display: none;
}

.top-bar__chip {
  padding: 10px 15px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--text-secondary);
  transition: all 0.15s ease;
}

.top-bar__chip:hover {
  color: var(--text-primary);
}

.top-bar__chip--active {
  font-weight: 700;
}

.top-bar__profile {
  padding: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.top-bar__signin {
  padding: 12px 18px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 700;
  flex-shrink: 0;
  color: var(--text-primary);
}

.top-bar__signin:hover {
  background: var(--bg-700);
}

@media (max-width: 720px) {
  .top-bar {
    flex-wrap: wrap;
  }

  .top-bar__filters {
    order: 3;
    flex-basis: 100%;
  }
}
</style>
