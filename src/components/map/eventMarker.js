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

const PIN_W = 46
const PIN_H = 60

export function buildEventIcon(event, { live = false, full = false, selected = false } = {}) {
  const { color, glyph } = categoryOf(event.category)
  const badgeColor = full ? '#f4587a' : '#2dd4a0'
  const count = event.attendeeIds.length

  const pulse = live
    ? `<span class="event-pin__pulse" style="
         position:absolute; left:50%; top:20px; width:34px; height:34px;
         margin-left:-17px; margin-top:-17px; border-radius:50%;
         background:${color}; opacity:0.5; pointer-events:none;"></span>`
    : ''

  const html = `
    ${pulse}
    <svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 46 60"
         xmlns="http://www.w3.org/2000/svg" style="position:relative;display:block">
      <path d="M23 2C11.4 2 2 11.2 2 22.6 2 33 10 41.4 19.6 52.8c1.8 2.1 5 2.1 6.8 0
               C36 41.4 44 33 44 22.6 44 11.2 34.6 2 23 2Z"
            fill="${color}" stroke="${selected ? '#ffffff' : 'rgba(255,255,255,0.85)'}"
            stroke-width="${selected ? 3 : 1.5}"/>
      <circle cx="23" cy="21" r="14" fill="rgba(11,15,25,0.28)"/>
      <g transform="translate(13.4,11.4) scale(0.8)">
        <path d="${glyph}" fill="#ffffff"/>
      </g>
      <g>
        <circle cx="38" cy="10" r="9" fill="${badgeColor}" stroke="#0b0f19" stroke-width="2"/>
        <text x="38" y="13.4" text-anchor="middle" font-size="10" font-weight="700"
              font-family="Inter, system-ui, sans-serif" fill="#0b0f19">${full ? '×' : count}</text>
      </g>
    </svg>`

  return L.divIcon({
    className: `event-pin${live ? ' event-pin--live' : ''}`,
    html,
    iconSize: [PIN_W, PIN_H],
    iconAnchor: [PIN_W / 2, PIN_H - 4],
    tooltipAnchor: [0, -PIN_H + 8]
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
