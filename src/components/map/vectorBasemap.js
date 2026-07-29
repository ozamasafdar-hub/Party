import L from 'leaflet'
import qatarCoastline from '@/data/qatarCoastline.json'

/**
 * Vector fallback basemap — a "night navigation chart" of Qatar.
 *
 * Used when raster tiles can't load (offline demos, sandboxed hosting that
 * blocks the tile CDN). Drawn entirely from bundled GeoJSON: deep-navy
 * water, softly lit landmass, a faint gold coastline, and district labels,
 * so the map still reads unmistakably as Qatar with zero network access.
 */

const PLACES = [
  { name: 'Doha', lat: 25.2854, lng: 51.531, major: true },
  { name: 'Lusail', lat: 25.43, lng: 51.49, major: false },
  { name: 'The Pearl', lat: 25.37, lng: 51.5527, major: false },
  { name: 'Al Wakrah', lat: 25.1715, lng: 51.6034, major: false },
  { name: 'Al Khor', lat: 25.6839, lng: 51.4972, major: false },
  { name: 'Al Rayyan', lat: 25.2919, lng: 51.4244, major: false },
  { name: 'Dukhan', lat: 25.4292, lng: 50.7822, major: false },
  { name: 'Mesaieed', lat: 24.99, lng: 51.5461, major: false }
]

export function addVectorBasemap(map) {
  const land = L.geoJSON(qatarCoastline, {
    style: {
      fillColor: '#16202f',
      fillOpacity: 1,
      color: 'rgba(212, 175, 106, 0.45)', // gold coastline glow
      weight: 1.2,
      interactive: false
    }
  }).addTo(map)
  land.bringToBack()

  const labels = PLACES.map((place) =>
    L.marker([place.lat, place.lng], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'place-label',
        html: `<span class="place-label__text${place.major ? ' place-label__text--major' : ''}">${place.name}</span>`,
        iconSize: [0, 0]
      })
    }).addTo(map)
  )

  return () => {
    land.remove()
    labels.forEach((m) => m.remove())
  }
}
