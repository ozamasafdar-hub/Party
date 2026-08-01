const TIME_FMT = new Intl.DateTimeFormat('en-QA', {
  hour: 'numeric',
  minute: '2-digit'
})

const DAY_FMT = new Intl.DateTimeFormat('en-QA', {
  weekday: 'short',
  day: 'numeric',
  month: 'short'
})

export function formatTime(iso) {
  return TIME_FMT.format(new Date(iso))
}

export function formatDay(iso) {
  const date = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  if (isSameDay(date, today)) return 'Today'
  if (isSameDay(date, tomorrow)) return 'Tomorrow'
  return DAY_FMT.format(date)
}

export function formatWhen(iso) {
  return `${formatDay(iso)} · ${formatTime(iso)}`
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

/** An event is "live" if now falls inside [startsAt, startsAt + duration]. */
export function isLive(event, now = new Date()) {
  const start = new Date(event.startsAt)
  const end = new Date(start.getTime() + event.durationMinutes * 60000)
  return now >= start && now <= end
}

export function hasEnded(event, now = new Date()) {
  const end =
    new Date(event.startsAt).getTime() + event.durationMinutes * 60000
  return now.getTime() > end
}

const MEMORY_WINDOW_MS = 24 * 3600000

/** Ended less than 24h ago — the pin lives on as a story recap. */
export function inMemoryWindow(event, now = new Date()) {
  const end =
    new Date(event.startsAt).getTime() + event.durationMinutes * 60000
  return now.getTime() > end && now.getTime() - end < MEMORY_WINDOW_MS
}

/** Whole hours until the recap disappears (min 1 for display). */
export function memoryHoursLeft(event, now = new Date()) {
  const end =
    new Date(event.startsAt).getTime() + event.durationMinutes * 60000
  const left = end + MEMORY_WINDOW_MS - now.getTime()
  return Math.max(1, Math.ceil(left / 3600000))
}

/** Tonight = starts today from 17:00, up to 04:00 tomorrow (or live now). */
export function isTonight(event, now = new Date()) {
  if (isLive(event, now)) return true
  const start = new Date(event.startsAt)
  if (start < now) return false
  const cutoff = new Date(now)
  cutoff.setHours(28, 0, 0, 0) // 04:00 tomorrow
  return start <= cutoff && (start.getDate() !== now.getDate() || start.getHours() >= 17)
}

export function isTomorrow(event, now = new Date()) {
  const start = new Date(event.startsAt)
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  return (
    start.getFullYear() === tomorrow.getFullYear() &&
    start.getMonth() === tomorrow.getMonth() &&
    start.getDate() === tomorrow.getDate()
  )
}

/** Weekend in Qatar = Friday & Saturday, within the coming week. */
export function isWeekend(event, now = new Date()) {
  const start = new Date(event.startsAt)
  const day = start.getDay() // 5 = Friday, 6 = Saturday
  if (day !== 5 && day !== 6) return false
  const weekAhead = new Date(now.getTime() + 7 * 86400000)
  return start <= weekAhead
}

/** "Starts in 2h 15m" / "Started 20m ago" — shown when within 24h. */
export function formatCountdown(iso, now = new Date()) {
  const diff = new Date(iso).getTime() - now.getTime()
  const abs = Math.abs(diff)
  if (abs > 24 * 3600000) return ''
  const h = Math.floor(abs / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  const span = h ? `${h}h ${m}m` : `${Math.max(1, m)}m`
  return diff > 0 ? `Starts in ${span}` : `Started ${span} ago`
}

/** Rounds "now" up to the next half hour — friendly default for new events. */
export function nextHalfHourISO() {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + (30 - (d.getMinutes() % 30)))
  return d.toISOString()
}

/** Converts an ISO string to the value a datetime-local input expects. */
export function toLocalInputValue(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
