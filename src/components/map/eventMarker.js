import L from 'leaflet'
import { categoryOf } from '@/config/categories'

/**
 * Builds a Leaflet divIcon for an event pin.
 *
 * Pins are pure inline SVG (no raster images), so they render pixel-perfect
 * on every display density — retina, 4K, UHD. Each pin carries:
 *   - the category color + glyph
 *   - an attendee-count badge
 *   - a pulsing ring when the event is happening right now
 */

/**
 * The teardrop is drawn in a 46x60 space; the canvas adds 5 units of
 * padding all round so corner badges, the gold ring and its shadow can
 * never be clipped by the SVG viewport.
 */
const PAD = 5
const ART_W = 46
const ART_H = 60
const PIN_W = ART_W + PAD * 2 // 56
const PIN_H = ART_H + PAD * 2 // 70
const TIP_Y = 53 // where the teardrop touches the ground, in art units

const PIN_PATH =
  'M23 2C11.4 2 2 11.2 2 22.6 2 33 10 41.4 19.6 52.8c1.8 2.1 5 2.1 6.8 0' +
  'C36 41.4 44 33 44 22.6 44 11.2 34.6 2 23 2Z'

/** Small round badge sitting on the teardrop's shoulder. */
function badge(cx, cy, fill, content, { bold = false, size = 10 } = {}) {
  return `<g>
      <circle cx="${cx}" cy="${cy}" r="8.5" fill="${fill}" stroke="#0b0f19" stroke-width="1.8"/>
      <text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="${size}"
            ${bold ? 'font-weight="700"' : ''} fill="#0b0f19"
            font-family="Inter, system-ui, sans-serif">${content}</text>
    </g>`
}

export function buildEventIcon(
  event,
  { live = false, full = false, selected = false, friend = false } = {}
) {
  const { color, glyph } = categoryOf(event.category)
  const featured = !!event.featuredPin
  const badgeColor = full ? '#f4587a' : '#2dd4a0'
  const count = event.attendeeIds.length
  const stroke = selected ? '#ffffff' : friend ? '#d4af6a' : 'rgba(255,255,255,0.85)'
  const strokeWidth = selected ? 3 : friend ? 2.5 : 1.5

  const pulse = live
    ? `<span class="event-pin__pulse" style="
         position:absolute; left:50%; top:${PAD + 21}px; width:34px; height:34px;
         margin-left:-17px; margin-top:-17px; border-radius:50%;
         background:${color}; opacity:0.5; pointer-events:none;"></span>`
    : ''

  // Featured pins get a breathing golden halo behind the teardrop
  const featuredGlow = featured
    ? `<span class="event-pin__glow" style="
         position:absolute; left:50%; top:${PAD + 21}px; width:52px; height:52px;
         margin-left:-26px; margin-top:-26px; border-radius:50%;
         pointer-events:none;"></span>`
    : ''

  // Featured events are outlined in gold rather than wearing another
  // corner badge — the ring reads at a glance and leaves the shoulders
  // free for the guest count and the ladies-only mark.
  const goldRing = featured
    ? `<path d="${PIN_PATH}" fill="none" stroke="#F2C763" stroke-width="4"
             stroke-linejoin="round" opacity="0.95"/>
       <path d="${PIN_PATH}" fill="none" stroke="#FFF3D0" stroke-width="1.4"
             stroke-linejoin="round" opacity="0.9"/>`
    : ''

  const badges = [
    badge(38, 9, badgeColor, full ? '×' : count, { bold: true }),
    event.ladiesOnly ? badge(8, 9, '#f472b6', '🚺') : ''
  ].join('')

  const html = `
    ${featuredGlow}
    ${pulse}
    <svg width="${PIN_W}" height="${PIN_H}" viewBox="${-PAD} ${-PAD} ${PIN_W} ${PIN_H}"
         xmlns="http://www.w3.org/2000/svg" style="position:relative;display:block;overflow:visible">
      <path d="${PIN_PATH}"
            fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"
            ${event.locationBlurred ? 'stroke-dasharray="5 3"' : ''}/>
      ${goldRing}
      <circle cx="23" cy="21" r="14" fill="rgba(11,15,25,0.28)"/>
      <g transform="translate(13.4,11.4) scale(0.8)">
        <path d="${glyph}" fill="#ffffff"/>
      </g>
      ${badges}
    </svg>`

  return L.divIcon({
    className: `event-pin${live ? ' event-pin--live' : ''}${featured ? ' event-pin--featured' : ''}`,
    html,
    iconSize: [PIN_W, PIN_H],
    iconAnchor: [PIN_W / 2, PAD + TIP_Y],
    tooltipAnchor: [0, -(PAD + TIP_Y) + 6]
  })
}

/**
 * 24h Memory Pin — an ended event living on as a story recap. A pulsing
 * purple/gold ring with a camera glyph and an "expires in Nh" badge.
 */
export function buildMemoryIcon(event, hoursLeft) {
  const html = `
    <span class="memory-pin__glow"></span>
    <span class="memory-pin__ring"><span class="memory-pin__icon">📸</span></span>
    <span class="memory-pin__badge">${hoursLeft}h</span>`

  return L.divIcon({
    className: 'event-pin event-pin--memory',
    html,
    iconSize: [52, 64],
    iconAnchor: [26, 32],
    tooltipAnchor: [0, -30]
  })
}

/** Temporary pin shown while the member picks a spot for a new event. */
export function buildDraftIcon() {
  const html = `
    <svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 46 60"
         xmlns="http://www.w3.org/2000/svg" style="display:block">
      <path d="M23 2C11.4 2 2 11.2 2 22.6 2 33 10 41.4 19.6 52.8c1.8 2.1 5 2.1 6.8 0
               C36 41.4 44 33 44 22.6 44 11.2 34.6 2 23 2Z"
            fill="#d4af6a" stroke="#ffffff" stroke-width="2" stroke-dasharray="4 3"/>
      <text x="23" y="27" text-anchor="middle" font-size="18" font-weight="700"
            font-family="Inter, system-ui, sans-serif" fill="#0b0f19">+</text>
    </svg>`

  return L.divIcon({
    className: 'event-pin',
    html,
    iconSize: [PIN_W, PIN_H],
    iconAnchor: [PIN_W / 2, PIN_H - 4]
  })
}
