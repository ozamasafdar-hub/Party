<script setup>
/**
 * MapStyleControl — popover for choosing the basemap style (Night, Day,
 * Satellite, Chart) and toggling the event-activity heatmap.
 */
import { BASEMAPS } from '@/config/map'

defineProps({
  styleKey: { type: String, required: true },
  showHeat: { type: Boolean, required: true }
})

const emit = defineEmits(['update:style', 'update:heat', 'close'])
</script>

<template>
  <aside class="style-panel glass-panel">
    <header class="style-panel__head">
      <h2 class="style-panel__title">Map style</h2>
      <button class="style-panel__close" aria-label="Close" @click="emit('close')">✕</button>
    </header>

    <button
      v-for="(style, key) in BASEMAPS"
      :key="key"
      class="style-panel__row"
      :class="{ 'style-panel__row--active': key === styleKey }"
      @click="emit('update:style', key)"
    >
      <span class="style-panel__emoji">{{ style.emoji }}</span>
      <span class="style-panel__body">
        <span class="style-panel__name">{{ style.label }}</span>
        <span class="style-panel__desc">{{ style.description }}</span>
      </span>
      <span v-if="key === styleKey" class="style-panel__check">✓</span>
    </button>

    <label class="style-panel__heat">
      <span class="style-panel__body">
        <span class="style-panel__name">🔥 Activity heat</span>
        <span class="style-panel__desc">Glow where events are busiest</span>
      </span>
      <input
        type="checkbox"
        class="style-panel__switch"
        :checked="showHeat"
        @change="emit('update:heat', $event.target.checked)"
      />
    </label>
  </aside>
</template>

<style scoped>
.style-panel {
  width: min(300px, calc(100vw - 24px));
  padding: 16px;
}

.style-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.style-panel__title {
  font-size: 16px;
  font-weight: 700;
}

.style-panel__close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  font-size: 12px;
}

.style-panel__row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 10px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  transition: background 0.15s ease;
}

/* Pointer devices only, and never over the selected row — :hover outscores
   the --active modifier and would wash out which style you picked. */
@media (hover: hover) {
  .style-panel__row:not(.style-panel__row--active):hover {
    background: rgba(255, 255, 255, 0.06);
  }
}

.style-panel__row--active {
  background: rgba(198, 45, 85, 0.16);
  border-color: rgba(198, 45, 85, 0.45);
}

.style-panel__emoji {
  font-size: 20px;
  width: 28px;
  text-align: center;
  flex-shrink: 0;
}

.style-panel__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.style-panel__name {
  font-size: 14px;
  font-weight: 600;
}

.style-panel__desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.style-panel__check {
  color: var(--accent-bright);
  font-weight: 800;
  flex-shrink: 0;
}

.style-panel__heat {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 10px 4px;
  margin-top: 8px;
  border-top: 1px solid var(--border-subtle);
  cursor: pointer;
}

.style-panel__switch {
  appearance: none;
  width: 44px;
  height: 26px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  position: relative;
  cursor: pointer;
  transition: background 0.2s ease;
  flex-shrink: 0;
}

.style-panel__switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}

.style-panel__switch:checked {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 100%);
}

.style-panel__switch:checked::after {
  transform: translateX(18px);
}
</style>
