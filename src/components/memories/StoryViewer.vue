<script setup>
/**
 * StoryViewer — full-screen, mobile-first recap player (Instagram-story
 * style) for a 24h Memory Pin. Auto-advances (5s per photo, clip length
 * for videos), tap right/left to navigate, hold to pause. Non-attendees
 * get a "notify me" CTA (follows the host) and emoji reactions.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import { useFollowStore } from '@/stores/followStore'
import { useNotifStore } from '@/stores/notifStore'
import { memoryHoursLeft, formatTime } from '@/utils/datetime'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'

const props = defineProps({
  event: { type: Object, required: true },
  frozen: { type: Boolean, default: false } // a modal is on top — hold still
})

const emit = defineEmits(['close', 'add', 'login-required'])

const eventStore = useEventStore()
const authStore = useAuthStore()
const followStore = useFollowStore()
const notifStore = useNotifStore()

const memories = computed(() => eventStore.memoriesFor(props.event.id))
const index = ref(0)
const progress = ref(0) // 0..1 for the current segment
const paused = ref(false)
const videoEl = ref(null)

const current = computed(() => memories.value[index.value] || null)
const hoursLeft = computed(() => memoryHoursLeft(props.event))

const meId = computed(() => authStore.currentUser?.id)
const isAttendee = computed(
  () => !!meId.value && props.event.attendeeIds.includes(meId.value)
)
const host = computed(
  () =>
    eventStore.memberById(props.event.hostId) || {
      name: 'Host',
      initials: 'H',
      avatarColor: '#94a3b8'
    }
)
const followingHost = computed(() => followStore.isFollowing(props.event.hostId))

function authorOf(memory) {
  return (
    eventStore.memberById(memory.userId) || {
      name: 'Member',
      initials: 'M',
      avatarColor: '#94a3b8'
    }
  )
}

/* --- playback engine ------------------------------------------------------ */

const IMAGE_MS = 5000
let raf = null
let elapsedBeforePause = 0
let segmentStart = 0

function cancelTick() {
  if (raf) cancelAnimationFrame(raf)
  raf = null
}

function tick() {
  raf = requestAnimationFrame(() => {
    if (paused.value) return
    if (current.value?.mediaType === 'video') {
      const v = videoEl.value
      if (v?.duration) progress.value = Math.min(1, v.currentTime / v.duration)
      tick() // advancing handled by the video's own `ended` event
      return
    }
    const elapsed = performance.now() - segmentStart
    progress.value = Math.min(1, elapsed / IMAGE_MS)
    if (progress.value >= 1) next()
    else tick()
  })
}

function startSegment() {
  cancelTick()
  progress.value = 0
  paused.value = false
  elapsedBeforePause = 0
  segmentStart = performance.now()
  tick()
}

function next() {
  if (index.value >= memories.value.length - 1) {
    emit('close')
    return
  }
  index.value += 1
}

function prev() {
  if (index.value === 0) {
    startSegment()
    return
  }
  index.value -= 1
}

function pausePlayback() {
  if (paused.value) return
  paused.value = true
  cancelTick()
  elapsedBeforePause = performance.now() - segmentStart
  videoEl.value?.pause()
}

function resumePlayback() {
  if (!paused.value) return
  paused.value = false
  segmentStart = performance.now() - elapsedBeforePause
  videoEl.value?.play()
  tick()
}

watch(index, startSegment)
watch(
  () => memories.value.length,
  (len) => {
    if (index.value >= len) index.value = Math.max(0, len - 1)
  }
)
// While a modal (sign-in, upload) sits on top, the story holds still
watch(
  () => props.frozen,
  (frozen) => {
    if (frozen) pausePlayback()
    else resumePlayback()
  }
)

onMounted(() => {
  startSegment()
  if (props.frozen) pausePlayback()
})
onBeforeUnmount(cancelTick)

/* --- gestures: tap left/right to navigate, hold to pause ------------------ */

let holdTimer = null
let wasHeld = false

function onPointerDown() {
  if (props.frozen) return
  wasHeld = false
  holdTimer = setTimeout(() => {
    wasHeld = true
    pausePlayback()
  }, 220)
}

function onPointerUp(e) {
  if (props.frozen) return
  clearTimeout(holdTimer)
  if (wasHeld) {
    resumePlayback()
    return
  }
  const x = e.clientX ?? 0
  if (x < window.innerWidth / 3) prev()
  else next()
}

/* --- CTAs ----------------------------------------------------------------- */

async function react(emoji) {
  if (!authStore.isAuthenticated) {
    emit('login-required')
    return
  }
  if (!current.value) return
  try {
    await eventStore.reactToMemory(current.value.id, emoji)
  } catch (e) {
    notifStore.flash(e.message)
  }
}

async function notifyMe() {
  if (!authStore.isAuthenticated) {
    emit('login-required')
    return
  }
  if (followingHost.value) return
  await followStore.toggle(meId.value, props.event.hostId)
  notifStore.flash(`🔔 You'll see ${host.value.name.split(' ')[0]}'s next events highlighted`)
}
</script>

<template>
  <div class="story" @pointerdown="onPointerDown" @pointerup="onPointerUp">
    <!-- progress segments -->
    <div class="story__segments">
      <div v-for="(memory, i) in memories" :key="memory.id" class="story__segment">
        <div
          class="story__segment-fill"
          :style="{ width: i < index ? '100%' : i === index ? `${progress * 100}%` : '0%' }"
        />
      </div>
    </div>

    <!-- top bar -->
    <header class="story__head" @pointerdown.stop @pointerup.stop>
      <MemberAvatar :member="host" :size="34" />
      <div class="story__head-text">
        <div class="story__title">{{ event.title }}</div>
        <div class="story__sub">
          Hosted by {{ host.name }}
          <template v-if="current"> · {{ formatTime(current.at) }}</template>
        </div>
      </div>
      <span class="story__timer">⏳ {{ hoursLeft }}h left</span>
      <button class="story__close" aria-label="Close" @click="emit('close')">✕</button>
    </header>

    <!-- media -->
    <div v-if="current" class="story__media">
      <video
        v-if="current.mediaType === 'video'"
        ref="videoEl"
        :key="current.id"
        :src="current.mediaUrl"
        class="story__frame"
        autoplay
        muted
        playsinline
        @ended="next"
      />
      <img v-else :key="current.id" :src="current.mediaUrl" class="story__frame" alt="" />

      <div class="story__meta" @pointerdown.stop @pointerup.stop>
        <div class="story__author">
          <MemberAvatar :member="authorOf(current)" :size="26" />
          <span>{{ authorOf(current).name }}</span>
        </div>
        <p v-if="current.caption" class="story__caption">{{ current.caption }}</p>
      </div>
    </div>
    <p v-else class="story__empty">No memories here yet.</p>

    <!-- bottom CTA bar -->
    <footer class="story__foot" @pointerdown.stop @pointerup.stop>
      <button
        v-if="isAttendee"
        class="btn-primary story__cta"
        @click="emit('add')"
      >
        📸 Add yours
      </button>
      <button
        v-else
        class="btn-primary story__cta"
        :disabled="followingHost"
        @click="notifyMe"
      >
        {{ followingHost ? `✓ Following ${host.name.split(' ')[0]}` : `🔔 Notify me of ${host.name.split(' ')[0]}'s next event` }}
      </button>
      <div class="story__reactions">
        <button class="story__reaction" @click="react('🔥')">
          🔥<span v-if="current?.reactions?.['🔥']">{{ current.reactions['🔥'] }}</span>
        </button>
        <button class="story__reaction" @click="react('👏')">
          👏<span v-if="current?.reactions?.['👏']">{{ current.reactions['👏'] }}</span>
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.story {
  position: fixed;
  inset: 0;
  z-index: 60; /* above the map UI, below every modal (login 70, upload 95) */
  background: #05080f;
  display: flex;
  flex-direction: column;
  user-select: none;
  touch-action: none;
}

.story__segments {
  position: absolute;
  top: max(10px, env(safe-area-inset-top));
  left: 10px;
  right: 10px;
  z-index: 3;
  display: flex;
  gap: 4px;
}

.story__segment {
  flex: 1;
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.28);
  overflow: hidden;
}

.story__segment-fill {
  height: 100%;
  background: #fff;
  border-radius: 999px;
}

.story__head {
  position: absolute;
  top: calc(max(10px, env(safe-area-inset-top)) + 12px);
  left: 12px;
  right: 12px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
}

.story__head-text {
  flex: 1;
  min-width: 0;
}

.story__title {
  font-size: 14.5px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
}

.story__sub {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.75);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
}

.story__timer {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  background: linear-gradient(120deg, #a78bfa, #d4af6a);
  color: #0b0f19;
}

.story__close {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(17, 24, 39, 0.6);
  color: #fff;
  font-size: 13px;
}

.story__media {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.story__frame {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.story__meta {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 92px;
  z-index: 2;
}

.story__author {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
}

.story__caption {
  margin-top: 6px;
  font-size: 14px;
  line-height: 1.4;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
}

.story__empty {
  margin: auto;
  color: var(--text-secondary);
}

.story__foot {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: max(14px, env(safe-area-inset-bottom));
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
}

.story__cta {
  flex: 1;
  padding: 12px;
  font-size: 13.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.story__reactions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.story__reaction {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  border-radius: 999px;
  font-size: 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.story__reaction span {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

.story__reaction:active {
  transform: scale(1.15);
}
</style>
