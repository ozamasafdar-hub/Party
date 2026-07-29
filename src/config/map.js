/**
 * Map configuration for Qatar.
 *
 * Tiles: CARTO "Dark Matter" served with the {r} retina modifier, so
 * high-DPI screens automatically receive @2x UHD tiles. No API key needed.
 * Swapping to Mapbox GL later only means replacing TILE_URL + attribution.
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

export const TILE_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'

export const TILE_OPTIONS = {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 20,
  // {r} in TILE_URL resolves to "@2x" on retina displays — crisp UHD tiles
  detectRetina: false
}
