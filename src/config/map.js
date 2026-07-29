/**
 * Map configuration for Qatar.
 *
 * Every basemap below is free with no API key. CARTO styles use the {r}
 * retina modifier, so high-DPI screens automatically receive @2x UHD
 * tiles. The "chart" style is the bundled offline vector basemap — it is
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
export const BASEMAPS = {
  night: {
    label: 'Night',
    emoji: '🌙',
    description: 'Dark streets — the WYN look',
    sources: [
      [carto('dark_all')],
      // Esri's dark canvas (native tiles stop at z16; upscaled beyond)
      [esri('Canvas/World_Dark_Gray_Base', 16), esri('Canvas/World_Dark_Gray_Reference', 16)]
    ]
  },
  day: {
    label: 'Day',
    emoji: '☀️',
    description: 'Bright streets and places',
    sources: [
      [carto('rastertiles/voyager')],
      [
        {
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          options: {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxNativeZoom: 19,
            maxZoom: 20
          }
        }
      ]
    ]
  },
  satellite: {
    label: 'Satellite',
    emoji: '🛰️',
    description: 'Aerial imagery with labels',
    sources: [
      [esri('World_Imagery'), esri('Reference/World_Boundaries_and_Places')]
    ]
  },
  chart: {
    label: 'Chart',
    emoji: '🧭',
    description: 'Offline vector map of Qatar',
    vector: true,
    sources: []
  }
}

export const DEFAULT_BASEMAP = 'night'
