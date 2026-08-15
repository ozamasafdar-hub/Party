<script setup>
/**
 * ProfileView — a member profile: avatar, name, bio, and history of
 * hosted / attending events. Shows your own profile (with Edit + Sign
 * out) or any other member's (with Follow / Unfollow), via /profile/:id.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useEventStore } from '@/stores/eventStore'
import { useFollowStore } from '@/stores/followStore'
import { useDmStore } from '@/stores/dmStore'
import { pinColorOf } from '@/config/categories'
import { formatWhen, hasEnded, inMemoryWindow, memoryHoursLeft } from '@/utils/datetime'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import EditProfileModal from '@/components/profile/EditProfileModal.vue'
import HostProModal from '@/components/pro/HostProModal.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const eventStore = useEventStore()
const followStore = useFollowStore()
const dmStore = useDmStore()

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

/* An event that has finished isn't something you're "hosting" or
 * "attending" any more, so the two live sections only carry what's still
 * ahead and everything else drops into Past. The clock ticks so an event
 * moves across on its own while the page is open. */
const now = ref(new Date())
let clock = null

const soonestFirst = (a, b) => new Date(a.startsAt) - new Date(b.startsAt)
const latestFirst = (a, b) => new Date(b.startsAt) - new Date(a.startsAt)

const upcomingHosted = computed(() =>
  hosted.value.filter((e) => !hasEnded(e, now.value)).sort(soonestFirst)
)
const upcomingAttended = computed(() =>
  attended.value.filter((e) => !hasEnded(e, now.value)).sort(soonestFirst)
)
const pastHosted = computed(() =>
  hosted.value.filter((e) => hasEnded(e, now.value)).sort(latestFirst)
)
const pastAttended = computed(() =>
  attended.value.filter((e) => hasEnded(e, now.value)).sort(latestFirst)
)

/* Recaps: an event that ended in the last 24h with photos on it still has
 * a live story. Past rows surface it while it lasts, then it lapses. */
function recapOf(event) {
  if (!inMemoryWindow(event, now.value)) return null
  const count = eventStore.memoriesFor(event.id).length
  if (!count) return null
  return { count, hoursLeft: memoryHoursLeft(event, now.value) }
}

function openRecap(event) {
  router.push({ name: 'map', query: { recap: event.id } })
}

/* Long histories collapse — each past list keeps its own toggle. */
const PAST_PREVIEW = 5
const expanded = ref({})

function shown(key, events) {
  return expanded.value[key] ? events : events.slice(0, PAST_PREVIEW)
}

function toggleExpanded(key) {
  expanded.value = { ...expanded.value, [key]: !expanded.value[key] }
}

const showEdit = ref(false)
const showPro = ref(false)
const followBusy = ref(false)
const isProMember = computed(() => member.value?.subscriptionTier === 'host_pro')

/* Social graph — who this member follows, and who follows them */
const graph = ref({ following: [], followers: [] })
const graphTab = ref(null) // 'following' | 'followers' | null

async function loadGraph() {
  graph.value = await followStore.graphFor(viewedId.value)
}

const graphList = computed(() =>
  (graphTab.value ? graph.value[graphTab.value] : []).map(
    (id) =>
      eventStore.memberById(id) ||
      (id === me.value?.id ? me.value : null) || {
        id,
        name: 'Member',
        initials: 'M',
        avatarColor: '#94a3b8'
      }
  )
)

onMounted(async () => {
  if (!eventStore.events.length) eventStore.load()
  if (me.value) await followStore.load(me.value.id)
  loadGraph()
  clock = setInterval(() => (now.value = new Date()), 60000)
})

onBeforeUnmount(() => clearInterval(clock))

watch(viewedId, () => {
  graphTab.value = null
  expanded.value = {}
  loadGraph()
})

async function toggleFollow() {
  followBusy.value = true
  try {
    await followStore.toggle(me.value.id, viewedId.value)
    await loadGraph()
  } finally {
    followBusy.value = false
  }
}

function openEvent(eventId) {
  // Remember where we stood, so the card's back arrow returns here
  eventStore.selectFrom(eventId, route.fullPath)
  router.push({ name: 'map' })
}

/**
 * Back to wherever you actually came from — the inbox, a story you tapped
 * through, another profile. vue-router records the previous entry in
 * history.state.back; when there isn't one (a shared link opened cold) the
 * map is the sensible home. Read at click time so it is never stale.
 */
function goBack() {
  if (window.history.state?.back) router.back()
  else router.push({ name: 'map' })
}

function messageMember() {
  router.push({ name: 'inbox', query: { to: viewedId.value } })
}

function logout() {
  dmStore.reset()
  authStore.logout()
  router.push({ name: 'map' })
}
</script>

<template>
  <div class="profile">
    <div class="profile__inner">
      <div class="profile__topline">
        <button class="btn-ghost profile__back" @click="goBack">← Back</button>
        <!-- Only on your own profile: this page renders other members too -->
        <RouterLink
          v-if="isSelf"
          class="btn-ghost profile__settings"
          :to="{ name: 'settings' }"
          title="Settings"
        >
          ⚙️ Settings
        </RouterLink>
      </div>

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
              <span><strong>{{ upcomingAttended.length }}</strong> attending</span>
              <button
                class="profile__stat-btn"
                :class="{ 'profile__stat-btn--on': graphTab === 'followers' }"
                @click="graphTab = graphTab === 'followers' ? null : 'followers'"
              >
                <strong>{{ graph.followers.length }}</strong> followers
              </button>
              <button
                class="profile__stat-btn"
                :class="{ 'profile__stat-btn--on': graphTab === 'following' }"
                @click="graphTab = graphTab === 'following' ? null : 'following'"
              >
                <strong>{{ graph.following.length }}</strong> following
              </button>
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
            <template v-else>
              <button
                class="profile__follow"
                :class="following ? 'btn-ghost' : 'btn-primary'"
                :disabled="followBusy"
                @click="toggleFollow"
              >
                {{ following ? '✓ Following' : '⭐ Follow' }}
              </button>
              <button class="btn-ghost profile__message" @click="messageMember">
                💬 Message
              </button>
            </template>
          </div>
        </header>

        <Transition name="fade">
          <section v-if="graphTab" class="profile__graph glass-panel">
            <h2 class="profile__graph-title">
              {{ graphTab === 'followers' ? '👥 Followers' : '⭐ Following' }}
            </h2>
            <p v-if="!graphList.length" class="profile__graph-empty">
              {{
                graphTab === 'followers'
                  ? 'No followers yet — host a great event and they’ll come.'
                  : 'Not following anyone yet. Follow hosts to hear about their next event.'
              }}
            </p>
            <RouterLink
              v-for="person in graphList"
              :key="person.id"
              class="profile__graph-row"
              :to="{ name: 'profile', params: { id: person.id } }"
            >
              <MemberAvatar :member="person" :size="34" />
              <span class="profile__graph-name">{{ person.name }}</span>
              <span v-if="person.subscriptionTier === 'host_pro'" class="profile__graph-pro">👑</span>
            </RouterLink>
          </section>
        </Transition>

        <section v-for="group in [
            { key: 'hosted', title: '🏁 Hosted', events: pastHosted, past: true, empty: '' },
            { key: 'hosting', title: '🎉 Hosting', events: upcomingHosted, past: false, empty: isSelf ? 'Nothing coming up — create an event from the map!' : 'Nothing coming up.' },
            { key: 'attending', title: '✅ Attending', events: upcomingAttended, past: false, empty: isSelf ? 'No RSVPs yet. Tap a pin on the map to join an event.' : 'Not attending anything yet.' },
            { key: 'went', title: '🕓 Went', events: pastAttended, past: true, empty: '' }
          ]"
          v-show="group.events.length || !group.past"
          :key="group.key"
          class="profile__section"
        >
          <h2 class="profile__section-title">{{ group.title }}</h2>
          <p v-if="!group.events.length" class="profile__empty glass-panel">{{ group.empty }}</p>
          <button
            v-for="event in shown(group.key, group.events)"
            :key="event.id"
            class="profile__event glass-panel"
            :class="{ 'profile__event--past': group.past }"
            @click="openEvent(event.id)"
          >
            <span class="profile__event-dot" :style="{ background: pinColorOf(event) }" />
            <span class="profile__event-body">
              <span class="profile__event-title">{{ event.title }}</span>
              <span class="profile__event-meta">
                {{ event.locationName }} · {{ formatWhen(event.startsAt) }}
                <template v-if="!group.past">
                  · {{ event.attendeeIds.length }}/{{ event.maxCapacity }} going
                </template>
              </span>
            </span>
            <!-- Ended in the last 24h with photos on it: the recap is still live -->
            <span
              v-if="recapOf(event)"
              class="profile__recap"
              role="button"
              :title="`${recapOf(event).count} recap post${recapOf(event).count === 1 ? '' : 's'}`"
              @click.stop="openRecap(event)"
            >
              📸 {{ recapOf(event).count }} · {{ recapOf(event).hoursLeft }}h left
            </span>
            <span v-else-if="!group.past" class="profile__event-arrow">→</span>
          </button>
          <button
            v-if="group.events.length > PAST_PREVIEW"
            class="profile__past-more"
            @click="toggleExpanded(group.key)"
          >
            {{ expanded[group.key] ? 'Show less' : `Show all ${group.events.length}` }}
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

.profile__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 18px;
}

.profile__settings {
  text-decoration: none;
  font-size: 13.5px;
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

.profile__stats {
  flex-wrap: wrap;
}

.profile__stat-btn {
  font-size: 13.5px;
  color: var(--text-secondary);
  padding: 0;
  transition: color 0.15s ease;
}

.profile__stat-btn:hover,
.profile__stat-btn--on {
  color: var(--gold);
}

.profile__stat-btn--on strong {
  color: var(--gold);
}

.profile__graph {
  margin-top: 16px;
  padding: 16px 18px;
  border-radius: var(--radius-md);
}

.profile__graph-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 8px;
}

.profile__graph-empty {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.profile__graph-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.profile__graph-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.profile__graph-name {
  font-size: 14px;
  font-weight: 600;
}

.profile__graph-pro {
  font-size: 12px;
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

/* Finished events sit back a step so what's coming up reads first */
.profile__event--past {
  opacity: 0.72;
}

.profile__event--past:hover {
  opacity: 1;
}

/* A recap that is still inside its 24h window — tap to watch it */
.profile__recap {
  flex-shrink: 0;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
  color: #0b0f19;
  background: linear-gradient(120deg, #a78bfa, #d4af6a);
  cursor: pointer;
}

.profile__past-more {
  display: block;
  margin: 2px auto 10px;
  padding: 7px 16px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
}

.profile__past-more:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.11);
}
</style>
