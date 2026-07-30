<script setup>
/**
 * ProfileView — a member profile: avatar, name, bio, and history of
 * hosted / attending events. Shows your own profile (with Edit + Sign
 * out) or any other member's (with Follow / Unfollow), via /profile/:id.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useEventStore } from '@/stores/eventStore'
import { useFollowStore } from '@/stores/followStore'
import { categoryOf } from '@/config/categories'
import { formatWhen } from '@/utils/datetime'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import EditProfileModal from '@/components/profile/EditProfileModal.vue'
import HostProModal from '@/components/pro/HostProModal.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const eventStore = useEventStore()
const followStore = useFollowStore()

// Optional chaining throughout: signing out nulls currentUser while this
// view is still mounted, a tick before the router leaves it.
const me = computed(() => authStore.currentUser)
const viewedId = computed(() => route.params.id || me.value?.id)
const isSelf = computed(() => !!me.value && viewedId.value === me.value.id)

const member = computed(() =>
  isSelf.value ? me.value : eventStore.memberById(viewedId.value)
)

const hosted = computed(() => eventStore.hostedBy(viewedId.value))
const attended = computed(() => eventStore.attendedBy(viewedId.value))
const following = computed(() => followStore.isFollowing(viewedId.value))

const showEdit = ref(false)
const showPro = ref(false)
const followBusy = ref(false)
const isProMember = computed(() => member.value?.subscriptionTier === 'host_pro')

onMounted(async () => {
  if (!eventStore.events.length) eventStore.load()
  if (me.value) await followStore.load(me.value.id)
})

async function toggleFollow() {
  followBusy.value = true
  try {
    await followStore.toggle(me.value.id, viewedId.value)
  } finally {
    followBusy.value = false
  }
}

function openEvent(eventId) {
  eventStore.select(eventId)
  router.push({ name: 'map' })
}

function logout() {
  authStore.logout()
  router.push({ name: 'map' })
}
</script>

<template>
  <div class="profile">
    <div class="profile__inner">
      <button class="btn-ghost profile__back" @click="router.push({ name: 'map' })">
        ← Back to map
      </button>

      <template v-if="member">
        <header class="profile__header glass-panel">
          <MemberAvatar :member="member" :size="72" />
          <div class="profile__identity">
            <h1 class="profile__name">
              {{ member.name }}
              <span v-if="isProMember" class="profile__pro-badge">👑 Host Pro</span>
            </h1>
            <p v-if="member.bio" class="profile__bio">{{ member.bio }}</p>
            <p class="profile__reliability">
              ⭐ {{ member.reliability ?? 100 }}% reliable · {{ member.attended ?? 0 }} attended
            </p>
            <p class="profile__stats">
              <span><strong>{{ hosted.length }}</strong> hosted</span>
              <span><strong>{{ attended.length }}</strong> attending</span>
            </p>
          </div>
          <div class="profile__actions">
            <template v-if="isSelf">
              <button class="btn-ghost profile__edit" @click="showEdit = true">✏️ Edit profile</button>
              <button
                v-if="!isProMember"
                class="btn-primary profile__upgrade"
                @click="showPro = true"
              >
                👑 Go Host Pro
              </button>
              <button class="btn-ghost profile__logout" @click="logout">Sign out</button>
            </template>
            <button
              v-else
              class="profile__follow"
              :class="following ? 'btn-ghost' : 'btn-primary'"
              :disabled="followBusy"
              @click="toggleFollow"
            >
              {{ following ? '✓ Following' : '⭐ Follow' }}
            </button>
          </div>
        </header>

        <section v-for="group in [
            { title: '🎉 Hosting', events: hosted, empty: isSelf ? 'You haven\'t hosted anything yet — create an event from the map!' : 'No events hosted yet.' },
            { title: '✅ Attending', events: attended, empty: isSelf ? 'No RSVPs yet. Tap a pin on the map to join an event.' : 'Not attending anything yet.' }
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
      </template>

      <p v-else class="profile__empty glass-panel">
        Member not found — they may not have joined any events yet.
      </p>
    </div>

    <Transition name="fade">
      <EditProfileModal
        v-if="showEdit"
        @close="showEdit = false"
        @saved="showEdit = false"
      />
    </Transition>

    <Transition name="fade">
      <HostProModal v-if="showPro" @close="showPro = false" @upgraded="showPro = false" />
    </Transition>
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

.profile__bio {
  margin-top: 4px;
  font-size: 13.5px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.profile__reliability {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--gold);
}

.profile__pro-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  vertical-align: 4px;
  background: rgba(212, 175, 106, 0.16);
  border: 1px solid rgba(212, 175, 106, 0.45);
  color: var(--gold);
}

.profile__upgrade {
  padding: 9px 16px;
  font-size: 13px;
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

.profile__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 520px) {
  .profile__header {
    flex-wrap: wrap;
  }

  .profile__actions {
    flex-direction: row;
    flex-basis: 100%;
  }

  .profile__actions > * {
    flex: 1;
  }
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
