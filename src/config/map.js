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

export const BASEMAPS = {
  night: {
    label: 'Night',
    emoji: '🌙',
    description: 'Dark streets — the WYN look',
    tiles: [carto('dark_all')]
  },
  day: {
    label: 'Day',
    emoji: '☀️',
    description: 'Bright streets and places',
    tiles: [carto('rastertiles/voyager')]
  },
  satellite: {
    label: 'Satellite',
    emoji: '🛰️',
    description: 'Aerial imagery with labels',
    tiles: [
      {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: { attribution: ESRI_ATTRIBUTION, maxZoom: 19 }
      },
      // Labels drawn over the imagery so place names stay readable
      carto('dark_only_labels')
    ]
  },
  chart: {
    label: 'Chart',
    emoji: '🧭',
    description: 'Offline vector map of Qatar',
    vector: true,
    tiles: []
  }
}

export const DEFAULT_BASEMAP = 'night'
