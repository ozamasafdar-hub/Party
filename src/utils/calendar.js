/**
 * Add-to-calendar helpers: Google Calendar template URL and a
 * downloadable .ics file, both built from an event object.
 */

function toUtcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function eventTimes(event) {
  const start = new Date(event.startsAt)
  const end = new Date(start.getTime() + event.durationMinutes * 60000)
  return { start: toUtcStamp(start), end: toUtcStamp(end) }
}

export function googleCalendarUrl(event, shareUrl) {
  const { start, end } = eventTimes(event)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    details: `${event.description || ''}\n\n${shareUrl}`.trim(),
    location: event.locationName
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

export function icsDataUrl(event, shareUrl) {
  const { start, end } = eventTimes(event)
  const escape = (text) =>
    String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WYN//Qatar Social Events//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@wyn`,
    `DTSTAMP:${start}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(`${event.description || ''}\n${shareUrl}`.trim())}`,
    `LOCATION:${escape(event.locationName)}`,
    `GEO:${event.lat};${event.lng}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
}
