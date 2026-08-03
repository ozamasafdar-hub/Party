/**
 * Map configuration for Qatar.
 *
 * Every basemap below is free with no API key. CARTO styles use the {r}
 * retina modifier, so high-DPI screens automatically receive @2x UHD
 * tiles. The "soft" style is the bundled offline vector basemap — it is
 * also the automatic fallback whenever raster tiles can't load.
 */
export const QATAR_CENTER = [25.3, 51.48]

export const MAP_OPTIONS = {
  center: QATAR_CENTER,
  zoom: 11,
  minZoom: 9,
  maxZoom: 19,
  zoomControl: false,
  attributionControl: true,
  // Keep members focused on Qatar (loose bounds so Banana Island etc. fit)
  maxBounds: [
    [24.35, 50.55],
    [26.35, 51.85]
  ],
  maxBoundsViscosity: 0.8
}

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

const ESRI_ATTRIBUTION =
  'Imagery &copy; <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

const carto = (style) => ({
  url: `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`,
  options: {
    attribution: CARTO_ATTRIBUTION,
    subdomains: 'abcd',
    maxZoom: 20
  }
})

const esri = (service, maxNativeZoom = 19) => ({
  url: `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`,
  options: { attribution: ESRI_ATTRIBUTION, maxNativeZoom, maxZoom: 20 }
})

/**
 * Each style lists `sources` — ordered fallback chains. If a chain's base
 * layer can't load anything (blocked CDN, offline), the map tries the
 * next chain, and only after every chain fails does it drop to the
 * bundled vector chart. A chain is an array of stacked tile layers
 * (base first, optional label overlays after).
 */
const osm = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  options: {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 19,
    maxZoom: 20
  }
}

/**
 * `filter` is a CSS filter applied to the tile layer only (markers and
 * overlays keep their own colors). It's how the flat CDN tiles get some
 * warmth — richer water and greenery without hosting our own tile style.
 */
export const BASEMAPS = {
  streets: {
    label: 'Streets',
    emoji: '🗺️',
    description: 'Colourful streets and places',
    // Warms the land toward cream and pushes the water toward the
    // turquoise of the Soft style, so the two don't clash
    filter: 'saturate(1.35) hue-rotate(-6deg) contrast(1.04) brightness(1.03)',
    sources: [[carto('rastertiles/voyager')], [osm]]
  },
  minimal: {
    label: 'Minimal',
    emoji: '🤍',
    description: 'Clean and quiet — pins pop',
    filter: 'saturate(1.1) brightness(1.03)',
    sources: [
      [carto('light_all')],
      [esri('Canvas/World_Light_Gray_Base', 16), esri('Canvas/World_Light_Gray_Reference', 16)]
    ]
  },
  satellite: {
    label: 'Satellite',
    emoji: '🛰️',
    description: 'Aerial imagery with labels',
    filter: 'saturate(1.2) contrast(1.06)',
    sources: [[esri('World_Imagery'), esri('Reference/World_Boundaries_and_Places')]]
  },
  soft: {
    label: 'Soft',
    emoji: '🩵',
    description: 'Cream land, turquoise sea — works offline',
    vector: true,
    sources: []
  }
}

export const DEFAULT_BASEMAP = 'streets'
