<script setup>
/**
 * SettingsView — the things that are about your account rather than about
 * what's on tonight.
 *
 * It exists because there was nowhere to put a support link. The app told
 * members to "contact support" with no support to contact, and a promise
 * with nowhere to go is worse than no promise. Map style moved here too:
 * it was a fifth control crowding the map, and it is set once and then
 * forgotten.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { usePrefsStore } from '@/stores/prefsStore'
import { useDmStore } from '@/stores/dmStore'
import { BASEMAPS } from '@/config/map'
import { supportLink, GENDER_TOPIC } from '@/config/support'
import DeleteAccountModal from '@/components/profile/DeleteAccountModal.vue'

const router = useRouter()
const authStore = useAuthStore()
const prefsStore = usePrefsStore()
const dmStore = useDmStore()

/**
 * Vite's define replaces this token in script source. It cannot do the
 * same inside a template, where Vue compiles a bare identifier into a
 * component-context lookup and it silently renders as nothing — which is
 * exactly what it did until a screenshot showed "Version" with no number
 * after it.
 */
const version = __APP_VERSION__

const me = computed(() => authStore.currentUser)
const showDelete = ref(false)

const genderLabel = computed(() => {
  if (!me.value?.gender) return 'Not set'
  return me.value.gender === 'female' ? 'Woman' : 'Man'
})

/** Back to wherever you came from, or the map on a cold link. */
function goBack() {
  if (window.history.state?.back) router.back()
  else router.push({ name: 'map' })
}

function signOut() {
  dmStore.reset()
  authStore.logout()
  router.push({ name: 'map' })
}

function onDeleted() {
  showDelete.value = false
  dmStore.reset()
  router.push({ name: 'map' })
}
</script>

<template>
  <div class="settings">
    <div class="settings__inner">
      <button class="btn-ghost settings__back" @click="goBack">← Back</button>
      <h1 class="settings__title">Settings</h1>

      <!-- Support first: it is the reason this page exists -->
      <section class="settings__group glass-panel">
        <h2 class="settings__group-title">Help</h2>
        <a
          class="settings__row settings__row--link"
          :href="supportLink(me)"
          target="_blank"
          rel="noopener"
        >
          <span class="settings__row-icon">💬</span>
          <span class="settings__row-body">
            <span class="settings__row-name">Message us on WhatsApp</span>
          </span>
          <span class="settings__row-go">↗</span>
        </a>
      </section>

      <section v-if="me" class="settings__group glass-panel">
        <h2 class="settings__group-title">Account</h2>

        <div class="settings__row">
          <span class="settings__row-icon">👤</span>
          <span class="settings__row-body">
            <span class="settings__row-name">{{ me.name }}</span>
            <span class="settings__row-desc">
              {{ me.subscriptionTier === 'host_pro' ? '👑 Host Pro' : 'Free member' }}
            </span>
          </span>
        </div>

        <!-- Set once at sign-up, so the only route to a fix is a human -->
        <div class="settings__row">
          <span class="settings__row-icon">⚧</span>
          <span class="settings__row-body">
            <span class="settings__row-name">{{ genderLabel }}</span>
            <span class="settings__row-desc">
              Set when you joined and can't be changed here.
              <a
                class="settings__inline-link"
                :href="supportLink(me, GENDER_TOPIC)"
                target="_blank"
                rel="noopener"
              >Tell us if it's wrong</a>.
            </span>
          </span>
        </div>
      </section>

      <section class="settings__group glass-panel">
        <h2 class="settings__group-title">Map</h2>

        <button
          v-for="(style, key) in BASEMAPS"
          :key="key"
          class="settings__row settings__row--tap"
          :class="{ 'settings__row--on': key === prefsStore.mapStyle }"
          @click="prefsStore.setMapStyle(key)"
        >
          <span class="settings__swatch" :style="{ background: style.swatch }" />
          <span class="settings__row-body">
            <span class="settings__row-name">{{ style.emoji }} {{ style.label }}</span>
            <span class="settings__row-desc">{{ style.description }}</span>
          </span>
          <span v-if="key === prefsStore.mapStyle" class="settings__check">✓</span>
        </button>

        <label class="settings__row settings__row--tap">
          <span class="settings__row-icon">🔥</span>
          <span class="settings__row-body">
            <span class="settings__row-name">Activity heat</span>
            <span class="settings__row-desc">Glow where events are busiest</span>
          </span>
          <input
            type="checkbox"
            class="settings__switch"
            :checked="prefsStore.showHeat"
            @change="prefsStore.setHeat($event.target.checked)"
          />
        </label>
      </section>

      <section class="settings__group glass-panel">
        <h2 class="settings__group-title">About</h2>
        <div class="settings__row">
          <span class="settings__row-icon">📍</span>
          <span class="settings__row-body">
            <span class="settings__row-name">WYN — Qatar's social map</span>
            <span class="settings__row-desc">Version {{ version }}</span>
          </span>
        </div>
      </section>

      <section v-if="me" class="settings__group glass-panel">
        <button class="settings__row settings__row--tap" @click="signOut">
          <span class="settings__row-icon">🚪</span>
          <span class="settings__row-body">
            <span class="settings__row-name">Sign out</span>
          </span>
        </button>

        <button
          class="settings__row settings__row--tap settings__row--danger"
          @click="showDelete = true"
        >
          <span class="settings__row-icon">⚠️</span>
          <span class="settings__row-body">
            <span class="settings__row-name">Delete my account</span>
            <span class="settings__row-desc">Permanent — this can't be undone</span>
          </span>
        </button>
      </section>
    </div>

    <DeleteAccountModal
      v-if="showDelete"
      @close="showDelete = false"
      @deleted="onDeleted"
    />
  </div>
</template>

<style scoped>
/**
 * height, not min-height. The app locks the document — html, body and #app
 * are `height: 100%; overflow: hidden` so the map cannot be scrolled off
 * the screen — which means a page has to be its own scroller. With
 * min-height this element grew past the viewport instead, and the overflow
 * landed on #app, where it was hidden: everything below the fold became
 * unreachable on a phone. ProfileView and InboxView already do it this way.
 */
.settings {
  height: 100%;
  background: var(--bg-900, #0b0f19);
  padding: max(18px, env(safe-area-inset-top)) 0 40px;
  overflow-y: auto;
}

.settings__inner {
  width: min(560px, 100%);
  margin: 0 auto;
  padding: 0 14px;
}

.settings__back {
  padding: 8px 14px;
  font-size: 13.5px;
}

.settings__title {
  margin: 14px 2px 16px;
  font-size: 26px;
  font-weight: 700;
}

.settings__group {
  padding: 6px;
  margin-bottom: 14px;
}

.settings__group-title {
  padding: 10px 12px 6px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.settings__row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-md);
  text-align: left;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid transparent;
}

/* Pointer devices only, and never over the chosen row — a tap leaves the
   hover stuck, and :hover outscores the --on modifier */
@media (hover: hover) {
  .settings__row--tap:not(.settings__row--on):hover,
  .settings__row--link:hover {
    background: rgba(255, 255, 255, 0.05);
  }
}

.settings__row--on {
  background: rgba(198, 45, 85, 0.16);
  border-color: rgba(198, 45, 85, 0.4);
}

.settings__row--link {
  text-decoration: none;
}

.settings__row--danger .settings__row-name {
  color: var(--danger);
}

.settings__row-icon {
  width: 34px;
  flex-shrink: 0;
  font-size: 19px;
  text-align: center;
}

.settings__swatch {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.settings__row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings__row-name {
  font-size: 14.5px;
  font-weight: 600;
}

.settings__row-desc {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.settings__inline-link {
  color: var(--gold);
  font-weight: 600;
}

.settings__row-go,
.settings__check {
  flex-shrink: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.settings__check {
  color: var(--accent-bright);
  font-weight: 700;
}

.settings__switch {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  accent-color: var(--accent-bright);
}
</style>
