import L from 'leaflet'
import qatarCoastline from '@/data/qatarCoastline.json'
import basemap from '@/data/qatarBasemap.json'

/**
 * Vector fallback basemap — a "night navigation chart" of Qatar, city grade.
 *
 * Used when raster tiles can't load (offline demos, sandboxed hosting that
 * blocks tile CDNs). Rendered entirely from bundled open data:
 *   - coastline           geoBoundaries (ADM0)
 *   - highways + urban    Natural Earth 10m
 *   - zones, districts,   Who's On First gazetteer
 *     localities, airport
 *
 * Layers reveal by zoom like a real map: city labels when zoomed out,
 * zone boundaries mid-zoom, neighbourhood polygons + names at street zoom.
 */

const CITY_LABELS = [
  { name: 'Doha', lat: 25.2854, lng: 51.531, major: true },
  { name: 'Lusail', lat: 25.43, lng: 51.49 },
  { name: 'Al Wakrah', lat: 25.1715, lng: 51.6034 },
  { name: 'Al Khor', lat: 25.6839, lng: 51.4972 },
  { name: 'Al Rayyan', lat: 25.2919, lng: 51.4244 },
  { name: 'Dukhan', lat: 25.4292, lng: 50.7822 },
  { name: 'Mesaieed', lat: 24.99, lng: 51.5461 },
  { name: 'Al Shamal', lat: 26.1293, lng: 51.2009 }
]

const LAND_STYLE = {
  fillColor: '#f2ede2',
  fillOpacity: 1,
  color: 'rgba(190, 160, 100, 0.75)',
  weight: 1.1,
  interactive: false
}

const URBAN_STYLE = {
  fillColor: '#e6e0d2',
  fillOpacity: 1,
  color: 'rgba(0, 0, 0, 0.05)',
  weight: 1,
  interactive: false
}

const COUNTY_STYLE = {
  fill: false,
  color: 'rgba(90, 105, 130, 0.22)',
  weight: 1,
  interactive: false
}

const HOOD_STYLE = {
  fillColor: 'rgba(255, 255, 255, 0.5)',
  fillOpacity: 1,
  color: 'rgba(90, 105, 130, 0.3)',
  weight: 1,
  interactive: false
}

const CAMPUS_STYLE = {
  fillColor: 'rgba(45, 160, 120, 0.12)',
  fillOpacity: 1,
  color: 'rgba(45, 160, 120, 0.45)',
  weight: 1,
  dashArray: '4 3',
  interactive: false
}

function roadStyle(type, zoom) {
  const major = type === 'Major Highway'
  // Source geometry is country-scale — keep lines slim and translucent at
  // street zoom so they read as highways, not exact street shapes
  const weight = major
    ? zoom >= 13 ? 3.5 : zoom >= 11 ? 3 : 2
    : zoom >= 13 ? 2 : zoom >= 11 ? 1.8 : 1.2
  const opacity = zoom >= 13 ? 0.55 : 0.9
  return {
    color: major ? '#f0b45e' : '#ffffff',
    weight,
    opacity: type === 'Unknown' ? opacity * 0.5 : opacity,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false
  }
}

/** First segment of combined WOF names: "Jelaiah/Al Tarfa/…" → "Jelaiah" */
function shortName(name) {
  return name.split('/')[0].trim()
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function labelMarker(lat, lng, name, cls) {
  return L.marker([lat, lng], {
    interactive: false,
    keyboard: false,
    icon: L.divIcon({
      className: 'place-label',
      html: `<span class="place-label__text ${cls}">${escapeHtml(name)}</span>`,
      iconSize: [0, 0]
    })
  })
}

function labelGroup(features, cls, { dedupe = true } = {}) {
  const seen = new Set()
  const markers = []
  for (const f of features) {
    const name = shortName(f.properties.name)
    if (dedupe && seen.has(name)) continue
    seen.add(name)
    markers.push(labelMarker(f.properties.lat, f.properties.lng, name, cls))
  }
  return L.layerGroup(markers)
}

export function addVectorBasemap(map) {
  const renderer = L.canvas({ padding: 0.4 })
  // Some gazetteer records carry Point geometry — skip them in polygon
  // layers or Leaflet would render default (broken) marker icons
  const opts = (style) => ({
    style,
    renderer,
    interactive: false,
    filter: (f) =>
      f.geometry && f.geometry.type !== 'Point' && f.geometry.type !== 'MultiPoint'
  })

  /* Always-on ground layers, bottom to top */
  const land = L.geoJSON(qatarCoastline, opts(LAND_STYLE)).addTo(map)
  const urban = L.geoJSON(basemap.urban, opts(URBAN_STYLE)).addTo(map)
  const campuses = L.geoJSON(basemap.campuses, opts(CAMPUS_STYLE)).addTo(map)
  const roads = L.geoJSON(basemap.roads, {
    renderer,
    interactive: false,
    style: (f) => roadStyle(f.properties.type, map.getZoom())
  }).addTo(map)
  land.bringToBack()

  /* Zoom-banded layers */
  const cityLabels = L.layerGroup(
    CITY_LABELS.map((p) =>
      labelMarker(p.lat, p.lng, p.name, p.major ? 'place-label__text--major' : '')
    )
  )
  const counties = L.geoJSON(basemap.counties, opts(COUNTY_STYLE))
  const countyLabels = labelGroup(basemap.counties.features, 'place-label__text--zone')
  const hoods = L.geoJSON(basemap.neighbourhoods, opts(HOOD_STYLE))
  const hoodLabels = labelGroup(basemap.neighbourhoods.features, 'place-label__text--hood')
  const localityLabels = labelGroup(basemap.localities.features, 'place-label__text--hood')

  function setBand(group, on) {
    if (on && !map.hasLayer(group)) group.addTo(map)
    if (!on && map.hasLayer(group)) group.remove()
  }

  function applyZoom() {
    const z = map.getZoom()
    setBand(cityLabels, z <= 11)
    setBand(counties, z >= 11)
    setBand(countyLabels, z >= 11 && z <= 12)
    setBand(hoods, z >= 12)
    setBand(hoodLabels, z >= 13)
    setBand(localityLabels, z >= 13)
    roads.setStyle((f) => roadStyle(f.properties.type, z))
  }

  map.on('zoomend', applyZoom)
  applyZoom()

  return () => {
    map.off('zoomend', applyZoom)
    ;[land, urban, campuses, roads, cityLabels, counties, countyLabels, hoods, hoodLabels, localityLabels]
      .forEach((layer) => layer.remove())
  }
}
