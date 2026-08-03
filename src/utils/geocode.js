/**
 * Place lookup for Qatar, on free OSM services.
 *
 * Photon is the primary — it is built for autocomplete and answers
 * partial words. Nominatim is the fallback for when Photon is down or
 * returns nothing. Both are biased to Qatar so "The Pearl" finds the
 * island rather than a jeweller in Paris.
 *
 * Results are normalised to { name, detail, lat, lng }.
 */

const QATAR_BBOX = '50.5,24.4,51.9,26.3'

async function photon(q, limit) {
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}` +
    `&limit=${limit}&lang=en&bbox=${QATAR_BBOX}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('photon failed')
  const json = await res.json()
  return (json.features || [])
    .filter((f) => f.properties?.name && f.geometry?.coordinates)
    .map((f) => ({
      name: f.properties.name,
      detail: [f.properties.street, f.properties.district, f.properties.city]
        .filter(Boolean)
        .join(', '),
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0]
    }))
}

async function nominatim(q, limit) {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=qa` +
    `&limit=${limit}&q=${encodeURIComponent(q)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('nominatim failed')
  const json = await res.json()
  return json.map((r) => {
    const parts = r.display_name.split(',')
    return {
      name: parts[0].trim(),
      detail: parts.slice(1, 3).join(',').trim(),
      lat: Number(r.lat),
      lng: Number(r.lon)
    }
  })
}

/**
 * Searches places, falling back between providers.
 * Throws only when both are unreachable, so callers can tell "nothing
 * matched" (empty array) from "search is down" (throw).
 */
export async function searchPlaces(query, limit = 6) {
  try {
    const found = await photon(query, limit)
    if (found.length) return found
    return await nominatim(query, limit)
  } catch {
    return await nominatim(query, limit)
  }
}
