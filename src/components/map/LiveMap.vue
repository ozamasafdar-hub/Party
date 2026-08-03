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
 *   fallback(styleKey)   — raster tiles unreachable; switched to the chart
 */
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.heat'
import { MAP_OPTIONS, BASEMAPS, DEFAULT_BASEMAP, QATAR_CENTER } from '@/config/map'
import { buildEventIcon, buildDraftIcon, buildMemoryIcon } from './eventMarker'
import { addVectorBasemap } from './vectorBasemap'
import { isLive, formatWhen, memoryHoursLeft } from '@/utils/datetime'
import { useEventStore } from '@/stores/eventStore'
import { useFollowStore } from '@/stores/followStore'

const eventStore = useEventStore()
const followStore = useFollowStore()

const props = defineProps({
  events: { type: Array, required: true },
  selectedId: { type: String, default: null },
  pickMode: { type: Boolean, default: false },
  styleKey: { type: String, default: DEFAULT_BASEMAP },
  showHeat: { type: Boolean, default: false },
  memoryMode: { type: Boolean, default: false } // 📸 past-24h recap layer
})

const emit = defineEmits(['select', 'pick', 'fallback'])

const mapEl = ref(null)

let map = null
let clusterGroup = null
let markersById = new Map()
let blurCirclesById = new Map()
let draftMarker = null
let locationMarker = null
let refreshTimer = null
let baseLayers = []
let vectorCleanup = null
let heatLayer = null

onMounted(() => {
  map = L.map(mapEl.value, MAP_OPTIONS)

  applyBasemap(props.styleKey)
  // No zoom buttons — pinch, scroll and double-tap cover it

  // Nearby pins collapse into a count bubble; tapping zooms in, and pins
  // at the same spot fan out — no more unreachable overlapping markers
  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 44,
    disableClusteringAtZoom: 14,
    showCoverageOnHover: false,
    spiderfyDistanceMultiplier: 1.6,
    iconCreateFunction: (cluster) =>
      L.divIcon({
        className: 'event-cluster',
        html: `<span class="event-cluster__badge">${cluster.getChildCount()}</span>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      })
  }).addTo(map)

  map.on('click', onMapClick)
  map.on('locationfound', onLocationFound)

  renderMarkers(props.events)
  applyHeat()

  // Re-style pins once a minute so "live" pulses appear exactly on time
  refreshTimer = setInterval(() => renderMarkers(props.events), 60000)
})

/* --- basemap styles ------------------------------------------------------ */

function applyBasemap(key, sourceIndex = 0) {
  if (!map) return
  baseLayers.forEach((layer) => layer.remove())
  baseLayers = []
  if (vectorCleanup) {
    vectorCleanup()
    vectorCleanup = null
  }

  const style = BASEMAPS[key] || BASEMAPS[DEFAULT_BASEMAP]
  // Warm up the flat CDN tiles (water, greenery) without self-hosting a style
  mapEl.value.style.setProperty('--tile-filter', style.filter || 'none')
  if (style.vector || sourceIndex >= style.sources.length) {
    vectorCleanup = addVectorBasemap(map)
    if (!style.vector) emit('fallback', key)
    return
  }

  // A chain whose base layer loads NOTHING (blocked CDN, offline) hands
  // over to the style's next provider chain, and only when every chain
  // fails does the map drop to the bundled vector chart. A single dropped
  // tile on a flaky connection never downgrades the chosen style.
  let loaded = 0
  let errored = 0
  let advanced = false
  style.sources[sourceIndex].forEach(({ url, options }, i) => {
    const layer = L.tileLayer(url, options).addTo(map)
    if (i === 0) {
      layer.on('tileload', () => {
        loaded += 1
      })
      layer.on('tileerror', () => {
        errored += 1
        if (advanced || loaded > 0 || errored < 3) return
        advanced = true
        applyBasemap(key, sourceIndex + 1)
      })
    }
    baseLayers.push(layer)
  })
}

/* --- activity heatmap ---------------------------------------------------- */

function applyHeat() {
  if (!map) return
  if (heatLayer) {
    heatLayer.remove()
    heatLayer = null
  }
  if (!props.showHeat || !props.events.length) return
  const points = props.events.map((e) => [
    e.lat,
    e.lng,
    Math.max(0.4, e.attendeeIds.length / e.maxCapacity)
  ])
  heatLayer = L.heatLayer(points, {
    radius: 38,
    blur: 28,
    maxZoom: 15,
    minOpacity: 0.35,
    gradient: { 0.2: '#8b1538', 0.5: '#c62d55', 0.8: '#d4af6a', 1: '#f4e9c9' }
  }).addTo(map)
}

onBeforeUnmount(() => {
  clearInterval(refreshTimer)
  if (map) {
    map.remove()
    map = null
  }
  clusterGroup = null
  locationMarker = null
  heatLayer = null
  vectorCleanup = null
  baseLayers = []
  markersById = new Map()
  blurCirclesById = new Map()
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
      selected: event.id === props.selectedId,
      friend: followStore.isFriendEvent(event)
    }
    const existing = markersById.get(event.id)

    // Blurred-location events get a dashed "somewhere around here" circle
    if (event.locationBlurred && !props.memoryMode) {
      const circle = blurCirclesById.get(event.id)
      if (circle) {
        circle.setLatLng([event.lat, event.lng])
      } else {
        blurCirclesById.set(
          event.id,
          L.circle([event.lat, event.lng], {
            radius: 300,
            color: '#38bdf8',
            weight: 2,
            dashArray: '6 6',
            fillColor: '#38bdf8',
            fillOpacity: 0.07,
            interactive: false
          }).addTo(map)
        )
      }
    }

    const buildIcon = () =>
      props.memoryMode
        ? buildMemoryIcon(event, memoryHoursLeft(event))
        : buildEventIcon(event, state)

    if (existing) {
      existing.setLatLng([event.lat, event.lng])
      // Only rebuild the icon when something it displays actually changed
      const signature = JSON.stringify([
        state,
        event.attendeeIds.length,
        event.category,
        event.featuredPin,
        event.ladiesOnly,
        props.memoryMode && memoryHoursLeft(event)
      ])
      if (existing._pinSignature !== signature) {
        existing.setIcon(buildIcon())
        existing._pinSignature = signature
      }
    } else {
      const marker = L.marker([event.lat, event.lng], {
        icon: buildIcon(),
        riseOnHover: true
      })
        .bindTooltip(tooltipHtml(event), {
          direction: 'top',
          opacity: 1,
          className: 'event-tooltip'
        })
        .on('click', () => emit('select', event.id))
      marker._pinSignature = null
      clusterGroup.addLayer(marker)
      markersById.set(event.id, marker)
    }
  }

  // Drop markers for events that ended or were filtered out
  for (const [id, marker] of markersById) {
    if (!seen.has(id)) {
      clusterGroup.removeLayer(marker)
      markersById.delete(id)
    }
  }
  for (const [id, circle] of blurCirclesById) {
    if (!seen.has(id)) {
      circle.remove()
      blurCirclesById.delete(id)
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

/** Programmatic pin placement (search result) — flies the camera there. */
function setDraftPin(lat, lng) {
  placeDraftPin(L.latLng(lat, lng))
  map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.8 })
}

function flyToEvent(event) {
  map.flyTo([event.lat, event.lng], Math.max(map.getZoom(), 14), { duration: 0.8 })
}

/** Camera-only move — used by search results that aren't event pins. */
function flyTo(lat, lng, zoom = 15) {
  map.flyTo([lat, lng], Math.max(map.getZoom(), zoom), { duration: 0.8 })
}

function locateMe() {
  map.locate({ setView: true, maxZoom: 15 })
}

function onLocationFound(e) {
  eventStore.setUserLocation({ lat: e.latlng.lat, lng: e.latlng.lng })
  if (!locationMarker) {
    locationMarker = L.marker(e.latlng, {
      interactive: false,
      keyboard: false,
      zIndexOffset: 1500,
      icon: L.divIcon({
        className: 'my-location',
        html: '<span class="my-location__pulse"></span><span class="my-location__dot"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      })
    }).addTo(map)
  } else {
    locationMarker.setLatLng(e.latlng)
  }
}

function resetView() {
  map.flyTo(QATAR_CENTER, MAP_OPTIONS.zoom, { duration: 0.8 })
}

/* --- reactivity ---------------------------------------------------------- */

watch(
  () => props.events,
  (events) => {
    renderMarkers(events)
    applyHeat()
  },
  { deep: true }
)

watch(() => props.styleKey, (key) => applyBasemap(key))

watch(() => props.showHeat, () => applyHeat())

// Follow/unfollow re-styles pins (gold friend ring)
watch(
  () => followStore.followingIds,
  () => renderMarkers(props.events)
)

watch(
  () => props.selectedId,
  () => {
    renderMarkers(props.events)
    const event = props.events.find((e) => e.id === props.selectedId)
    if (event) flyToEvent(event)
  }
)

// The draft pin intentionally survives leaving pick mode — it stays
// visible while the create form is back up; the parent clears it
// explicitly on save/close via the exposed clearDraftPin()
watch(
  () => props.pickMode,
  (picking) => {
    mapEl.value.style.cursor = picking ? 'crosshair' : ''
  }
)

/** Fly the camera so every given event is on screen (filter changes). */
function fitToEvents(events) {
  if (!map || !events.length) return
  if (events.length === 1) {
    map.flyTo([events[0].lat, events[0].lng], Math.max(map.getZoom(), 13), { duration: 0.8 })
    return
  }
  const bounds = L.latLngBounds(events.map((e) => [e.lat, e.lng]))
  map.flyToBounds(bounds, { padding: [70, 70], maxZoom: 13, duration: 0.8 })
}

defineExpose({ locateMe, resetView, clearDraftPin, setDraftPin, fitToEvents, flyTo })
</script>

<template>
  <div ref="mapEl" class="live-map" role="application" aria-label="Live events map of Qatar" />
</template>

<style scoped>
.live-map {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: #74CEEA; /* sea — matches the vector chart's water */
}

/* Tiles only — markers, circles and labels keep their own colors */
.live-map :deep(.leaflet-tile-pane) {
  filter: var(--tile-filter, none);
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
  color: rgba(60, 64, 67, 0.9);
  text-shadow:
    0 1px 3px rgba(255, 255, 255, 0.95),
    0 0 6px rgba(255, 255, 255, 0.85);
  white-space: nowrap;
}

.live-map :deep(.place-label__text--major) {
  font-size: 13px;
  color: #202124;
  letter-spacing: 0.18em;
}

.live-map :deep(.place-label__text--zone) {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: rgba(60, 64, 67, 0.72);
}

.live-map :deep(.place-label__text--hood) {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: none;
  color: rgba(60, 64, 67, 0.75);
}

.live-map :deep(.event-cluster__badge) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 100%);
  border: 2.5px solid rgba(255, 255, 255, 0.85);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.5);
  cursor: pointer;
}

.live-map :deep(.my-location) {
  pointer-events: none;
}

.live-map :deep(.my-location__dot) {
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: #38bdf8;
  border: 2.5px solid #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
}

.live-map :deep(.my-location__pulse) {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.35);
  animation: pin-pulse 2.2s ease-out infinite;
}
</style>
