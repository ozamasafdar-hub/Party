<script setup>
/**
 * WynLogo — the Q-Pin brand mark (user-chosen design): a crimson map-pin
 * drop holding a glossy white Q whose tail curls out like a wave.
 * Faithful vector recreation of the supplied reference — do not restyle.
 */
defineProps({
  size: { type: Number, default: 36 }
})
</script>

<template>
  <svg
    :width="size"
    :height="size * 1.1"
    viewBox="0 0 40 44"
    aria-hidden="true"
    class="wyn-logo"
  >
    <defs>
      <linearGradient id="wyn-qpin-drop" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#AC2148" />
        <stop offset="1" stop-color="#7C1533" />
      </linearGradient>
      <linearGradient id="wyn-qpin-q" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="1" stop-color="#D9DDE3" />
      </linearGradient>
    </defs>
    <path
      d="M20 43.2C10.4 32.6 3.4 25.6 3.4 17.1a16.6 16.6 0 1 1 33.2 0c0 8.5-7 15.5-16.6 26.1Z"
      fill="url(#wyn-qpin-drop)"
    />
    <circle cx="20" cy="16.8" r="8.5" fill="none" stroke="url(#wyn-qpin-q)" stroke-width="4.6" />
    <path
      d="M23.9 21.9c1.6 4-2.1 7.3-6.6 6-1.7-.5-3.2 0-4.2 1.2"
      fill="none"
      stroke="url(#wyn-qpin-q)"
      stroke-width="4.4"
      stroke-linecap="round"
    />
  </svg>
</template>

<style scoped>
.wyn-logo {
  display: block;
}
</style>
