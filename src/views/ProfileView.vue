<script setup>
/**
 * ProfileView — member profile: avatar, name, and history of
 * hosted / attended events.
 */
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useEventStore } from '@/stores/eventStore'
import { categoryOf } from '@/config/categories'
import { formatWhen } from '@/utils/datetime'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'

const router = useRouter()
const authStore = useAuthStore()
const eventStore = useEventStore()

const user = computed(() => authStore.currentUser)
const hosted = computed(() => eventStore.hostedBy(user.value.id))
const attended = computed(() => eventStore.attendedBy(user.value.id))

onMounted(() => {
  if (!eventStore.events.length) eventStore.load()
})

function openEvent(eventId) {
  eventStore.select(eventId)
  router.push({ name: 'map' })
}

function logout() {
  authStore.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="profile">
    <div class="profile__inner">
      <button class="btn-ghost profile__back" @click="router.push({ name: 'map' })">
        ← Back to map
      </button>

      <header class="profile__header glass-panel">
        <MemberAvatar :member="user" :size="72" />
        <div class="profile__identity">
          <h1 class="profile__name">{{ user.name }}</h1>
          <p class="profile__stats">
            <span><strong>{{ hosted.length }}</strong> hosted</span>
            <span><strong>{{ attended.length }}</strong> attended</span>
          </p>
        </div>
        <button class="btn-ghost profile__logout" @click="logout">Sign out</button>
      </header>

      <section v-for="group in [
          { title: '🎉 Hosting', events: hosted, empty: 'You haven\'t hosted anything yet — drop a pin on the map!' },
          { title: '✅ Attending', events: attended, empty: 'No RSVPs yet. Tap a pin on the map to join an event.' }
        ]"
        :key="group.title"
        class="profile__section"
      >
        <h2 class="profile__section-title">{{ group.title }}</h2>
        <p v-if="!group.events.length" class="profile__empty glass-panel">{{ group.empty }}</p>
        <button
          v-for="event in group.events"
          :key="event.id"
          class="profile__event glass-panel"
          @click="openEvent(event.id)"
        >
          <span class="profile__event-dot" :style="{ background: categoryOf(event.category).color }" />
          <span class="profile__event-body">
            <span class="profile__event-title">{{ event.title }}</span>
            <span class="profile__event-meta">
              {{ event.locationName }} · {{ formatWhen(event.startsAt) }} ·
              {{ event.attendeeIds.length }}/{{ event.maxCapacity }} going
            </span>
          </span>
          <span class="profile__event-arrow">→</span>
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.profile {
  height: 100%;
  overflow-y: auto;
  background:
    radial-gradient(ellipse 50% 35% at 80% 0%, rgba(139, 21, 56, 0.25), transparent),
    var(--bg-900);
}

.profile__inner {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px 60px;
}

.profile__back {
  margin-bottom: 18px;
}

.profile__header {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 24px;
}

.profile__identity {
  flex: 1;
  min-width: 0;
}

.profile__name {
  font-size: 22px;
  font-weight: 800;
}

.profile__stats {
  display: flex;
  gap: 16px;
  margin-top: 6px;
  font-size: 13.5px;
  color: var(--text-secondary);
}

.profile__stats strong {
  color: var(--text-primary);
}

.profile__logout {
  flex-shrink: 0;
}

.profile__section {
  margin-top: 28px;
}

.profile__section-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 12px;
  letter-spacing: 0.01em;
}

.profile__empty {
  padding: 18px;
  font-size: 13.5px;
  color: var(--text-secondary);
  border-radius: var(--radius-md);
}

.profile__event {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  text-align: left;
  padding: 16px 18px;
  margin-bottom: 10px;
  border-radius: var(--radius-md);
  transition: transform 0.15s ease;
}

.profile__event:hover {
  transform: translateX(4px);
}

.profile__event-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.profile__event-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.profile__event-title {
  font-size: 14.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile__event-meta {
  font-size: 12.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile__event-arrow {
  color: var(--text-secondary);
  flex-shrink: 0;
}
</style>
