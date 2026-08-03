<script setup>
/**
 * MapSearchBar — place search shown while picking an event location.
 * Selecting a result emits { lat, lng, name } so the parent can fly
 * there and set the pin. The lookup itself lives in utils/geocode.
 */
import { ref, onMounted } from 'vue'
import { searchPlaces } from '@/utils/geocode'

const emit = defineEmits(['select'])

const query = ref('')
const results = ref([])
const searching = ref(false)
const failed = ref(false)
const inputEl = ref(null)
let timer = null

onMounted(() => inputEl.value?.focus())

function onInput() {
  clearTimeout(timer)
  failed.value = false
  const q = query.value.trim()
  if (q.length < 2) {
    results.value = []
    return
  }
  timer = setTimeout(() => search(q), 350)
}

async function search(q) {
  searching.value = true
  failed.value = false
  try {
    results.value = await searchPlaces(q)
  } catch {
    results.value = []
    failed.value = true
  } finally {
    searching.value = false
  }
}

function pick(result) {
  emit('select', result)
  query.value = ''
  results.value = []
}
</script>

<template>
  <div class="map-search glass-panel">
    <div class="map-search__row">
      <span class="map-search__icon">🔎</span>
      <input
        ref="inputEl"
        v-model="query"
        class="map-search__input"
        type="text"
        placeholder="Search a place — mall, café, beach…"
        autocomplete="off"
        @input="onInput"
      />
      <span v-if="searching" class="map-search__spinner">…</span>
    </div>

    <div v-if="results.length" class="map-search__results">
      <button
        v-for="(result, i) in results"
        :key="i"
        class="map-search__result"
        type="button"
        @click="pick(result)"
      >
        <span class="map-search__result-name">📍 {{ result.name }}</span>
        <span v-if="result.detail" class="map-search__result-detail">{{ result.detail }}</span>
      </button>
    </div>
    <p v-else-if="failed" class="map-search__failed">
      Couldn't search right now — tap the map to set the spot instead.
    </p>
  </div>
</template>

<style scoped>
.map-search {
  width: min(420px, calc(100vw - 24px));
  padding: 6px;
}

.map-search__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
}

.map-search__icon {
  font-size: 15px;
  flex-shrink: 0;
}

.map-search__input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 16px;
  padding: 10px 0;
}

.map-search__input::placeholder {
  color: rgba(154, 165, 184, 0.6);
}

.map-search__spinner {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.map-search__results {
  border-top: 1px solid var(--border-subtle);
  margin-top: 4px;
  padding-top: 4px;
  max-height: 260px;
  overflow-y: auto;
}

.map-search__result {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  text-align: left;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.map-search__result:hover {
  background: rgba(255, 255, 255, 0.07);
}

.map-search__result-name {
  font-size: 14px;
  font-weight: 600;
}

.map-search__result-detail {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-search__failed {
  padding: 9px 10px;
  font-size: 12.5px;
  color: var(--text-secondary);
  border-top: 1px solid var(--border-subtle);
  margin-top: 4px;
}
</style>
