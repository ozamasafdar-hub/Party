/**
 * Map configuration for Qatar.
 *
 * Every basemap below is free and needs no API key — which is a constraint
 * worth stating plainly, because it has already been broken once.
 *
 * CARTO used to serve the Streets and Minimal styles. In October 2026 they
 * began answering unauthenticated requests with a tile that reads
 * "API KEY REQUIRED" across it, and the map turned into a wall of
 * watermarks on the live site. Nothing errored: those tiles come back
 * HTTP 200, so the offline fallback below never fired and could not have.
 *
 * `scripts/check-tiles.js` exists because of that day. Run it before
 * trusting any new source.
 *
 * The "soft" style is the bundled offline vector basemap. It is the
 * default, it needs no network at all, and it is the automatic fallback
 * whenever raster tiles cannot load — so a provider disappearing degrades
 * the map rather than emptying it.
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

const ESRI_ATTRIBUTION =
  'Imagery &copy; <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

const esri = (service, maxNativeZoom = 19) => ({
  url: `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`,
  options: { attribution: ESRI_ATTRIBUTION, maxNativeZoom, maxZoom: 20 }
})

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
 * Each style lists `sources` — ordered fallback chains. If a chain's base
 * layer can't load anything (blocked CDN, offline), the map tries the
 * next chain, and only after every chain fails does it drop to the
 * bundled vector chart. A chain is an array of stacked tile layers
 * (base first, optional label overlays after).
 *
 * Two independent providers per style, deliberately. One of them going
 * away is now a thing that has happened rather than a thing that might.
 */

/**
 * `filter` is a CSS filter applied to the tile layer only (markers and
 * overlays keep their own colors). It's how the flat CDN tiles get some
 * warmth — richer water and greenery without hosting our own tile style.
 */
export const BASEMAPS = {
  streets: {
    // Land, parks and sea, as this style actually renders them
    swatch: 'linear-gradient(135deg, #efe7d8 0%, #cfe3b8 45%, #8fd0e0 100%)',
    label: 'Streets',
    emoji: '🗺️',
    description: 'Colourful streets and places',
    // Gentler than the filter CARTO's palette needed: Esri's street map is
    // already saturated, and the old values turned it lurid
    filter: 'saturate(1.08) contrast(1.02) brightness(1.02)',
    sources: [[esri('World_Street_Map')], [osm]]
  },
  minimal: {
    swatch: 'linear-gradient(135deg, #f7f7f7 0%, #e6e8ea 55%, #cfd8dc 100%)',
    label: 'Minimal',
    emoji: '🤍',
    description: 'Clean and quiet — pins pop',
    // Esri's light canvas is near-neutral, and saturating a neutral colour
    // leaves it neutral — so a strong saturate brings the sea up blue while
    // land stays pale and roads stay white
    filter: 'saturate(4.5) hue-rotate(-8deg)',
    sources: [
      [esri('Canvas/World_Light_Gray_Base', 16), esri('Canvas/World_Light_Gray_Reference', 16)],
      [osm]
    ]
  },
  satellite: {
    swatch: 'linear-gradient(135deg, #3b4a32 0%, #6b6244 50%, #1d3b4a 100%)',
    label: 'Satellite',
    emoji: '🛰️',
    description: 'Aerial imagery with labels',
    filter: 'saturate(1.2) contrast(1.06)',
    sources: [[esri('World_Imagery'), esri('Reference/World_Boundaries_and_Places')]]
  },
  soft: {
    swatch: 'linear-gradient(135deg, #f0e6d2 0%, #e8dcc0 45%, #7ecfd6 100%)',
    label: 'Soft',
    emoji: '🩵',
    description: 'Cream land, turquoise sea — works offline',
    vector: true,
    sources: []
  }
}

export const DEFAULT_BASEMAP = 'soft'

/** Every remote tile URL the app can ask for — scripts/check-tiles.js reads this. */
export const ALL_TILE_SOURCES = Object.entries(BASEMAPS).flatMap(([style, cfg]) =>
  (cfg.sources || []).flatMap((chain, chainIndex) =>
    chain.map((layer, layerIndex) => ({
      style,
      chain: chainIndex,
      layer: layerIndex,
      url: layer.url
    }))
  )
)

