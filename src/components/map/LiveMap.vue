<script setup>
/**
 * LiveMap — the fullscreen, Snap-Map-style home screen.
 *
 * Owns the Leaflet instance and keeps one marker per event in sync with the
 * `events` prop: markers are diffed (added / moved / restyled / removed)
 * rather than rebuilt, so realtime updates never flicker the map.
 *
 * Emits:
 *   select(eventId)      — a pin was tapped
 *   pick({ lat, lng })   — the map was tapped while in pick mode
 */
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MAP_OPTIONS, TILE_URL, TILE_OPTIONS, QATAR_CENTER } from '@/config/map'
import { buildEventIcon, buildDraftIcon } from './eventMarker'
import { addVectorBasemap } from './vectorBasemap'
import { isLive, formatWhen } from '@/utils/datetime'

const props = defineProps({
  events: { type: Array, required: true },
  selectedId: { type: String, default: null },
  pickMode: { type: Boolean, default: false }
})

const emit = defineEmits(['select', 'pick'])

const mapEl = ref(null)

let map = null
let markersById = new Map()
let draftMarker = null
let refreshTimer = null

onMounted(() => {
  map = L.map(mapEl.value, MAP_OPTIONS)

  // If the tile CDN is unreachable (offline demo, sandboxed hosting),
  // swap the raster layer for the bundled vector chart of Qatar.
  const tiles = L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(map)
  let fellBack = false
  tiles.on('tileerror', () => {
    if (fellBack) return
    fellBack = true
    tiles.remove()
    addVectorBasemap(map)
  })

  L.control.zoom({ position: 'bottomright' }).addTo(map)

  map.on('click', onMapClick)

  renderMarkers(props.events)

  // Re-style pins once a minute so "live" pulses appear exactly on time
  refreshTimer = setInterval(() => renderMarkers(props.events), 60000)
})

onBeforeUnmount(() => {
  clearInterval(refreshTimer)
  if (map) {
    map.remove()
    map = null
  }
  markersById = new Map()
})

/* --- plotting event coordinates ----------------------------------------- */

function renderMarkers(events) {
  if (!map) return
  const seen = new Set()

  for (const event of events) {
    seen.add(event.id)
    const state = {
      live: isLive(event),
      full: event.attendeeIds.length >= event.maxCapacity,
      selected: event.id === props.selectedId
    }
    const existing = markersById.get(event.id)

    if (existing) {
      existing.setLatLng([event.lat, event.lng])
      // Only rebuild the icon when something it displays actually changed
      const signature = JSON.stringify([state, event.attendeeIds.length, event.category])
      if (existing._pinSignature !== signature) {
        existing.setIcon(buildEventIcon(event, state))
        existing._pinSignature = signature
      }
    } else {
      const marker = L.marker([event.lat, event.lng], {
        icon: buildEventIcon(event, state),
        riseOnHover: true
      })
        .bindTooltip(tooltipHtml(event), {
          direction: 'top',
          opacity: 1,
          className: 'event-tooltip'
        })
        .on('click', () => emit('select', event.id))
        .addTo(map)
      marker._pinSignature = null
      markersById.set(event.id, marker)
    }
  }

  // Drop markers for events that ended or were filtered out
  for (const [id, marker] of markersById) {
    if (!seen.has(id)) {
      marker.remove()
      markersById.delete(id)
    }
  }
}

function tooltipHtml(event) {
  return `
    <strong>${escapeHtml(event.title)}</strong><br/>
    <span style="opacity:0.75">${escapeHtml(event.locationName)} · ${formatWhen(event.startsAt)}</span>`
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/* --- interactions -------------------------------------------------------- */

function onMapClick(e) {
  if (!props.pickMode) return
  placeDraftPin(e.latlng)
  emit('pick', { lat: e.latlng.lat, lng: e.latlng.lng })
}

function placeDraftPin(latlng) {
  if (draftMarker) {
    draftMarker.setLatLng(latlng)
  } else {
    draftMarker = L.marker(latlng, { icon: buildDraftIcon(), zIndexOffset: 2000 }).addTo(map)
  }
}

function clearDraftPin() {
  if (draftMarker) {
    draftMarker.remove()
    draftMarker = null
  }
}

function flyToEvent(event) {
  map.flyTo([event.lat, event.lng], Math.max(map.getZoom(), 14), { duration: 0.8 })
}

function locateMe() {
  map.locate({ setView: true, maxZoom: 15 })
}

function resetView() {
  map.flyTo(QATAR_CENTER, MAP_OPTIONS.zoom, { duration: 0.8 })
}

/* --- reactivity ---------------------------------------------------------- */

watch(() => props.events, (events) => renderMarkers(events), { deep: true })

watch(
  () => props.selectedId,
  () => {
    renderMarkers(props.events)
    const event = props.events.find((e) => e.id === props.selectedId)
    if (event) flyToEvent(event)
  }
)

watch(
  () => props.pickMode,
  (picking) => {
    if (!picking) clearDraftPin()
    mapEl.value.style.cursor = picking ? 'crosshair' : ''
  }
)

defineExpose({ locateMe, resetView, clearDraftPin })
</script>

<template>
  <div ref="mapEl" class="live-map" role="application" aria-label="Live events map of Qatar" />
</template>

<style scoped>
.live-map {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.live-map :deep(.event-tooltip) {
  background: var(--bg-glass);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-card);
  padding: 8px 12px;
  font-size: 12.5px;
  line-height: 1.45;
  backdrop-filter: blur(18px);
}

.live-map :deep(.event-tooltip::before) {
  display: none;
}

.live-map :deep(.place-label) {
  pointer-events: none;
}

.live-map :deep(.place-label__text) {
  display: inline-block;
  transform: translate(-50%, -50%);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(154, 165, 184, 0.75);
  text-shadow: 0 1px 6px rgba(10, 14, 23, 0.9);
  white-space: nowrap;
}

.live-map :deep(.place-label__text--major) {
  font-size: 13px;
  color: rgba(244, 246, 251, 0.85);
  letter-spacing: 0.18em;
}
</style>
