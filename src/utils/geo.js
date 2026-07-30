/** Great-circle distance in kilometers. */
export function distanceKm(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

/**
 * Deterministic ~150-300 m offset for privacy-blurred event locations.
 * Seeded by a string so the blurred pin doesn't jump around between
 * renders (which would let people triangulate the real spot).
 */
export function blurCoords(lat, lng, seed) {
  let hash = 0
  for (const ch of String(seed)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const angle = ((hash % 360) * Math.PI) / 180
  const meters = 150 + (hash % 150)
  return {
    lat: lat + (meters * Math.cos(angle)) / 111320,
    lng: lng + (meters * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180))
  }
}
