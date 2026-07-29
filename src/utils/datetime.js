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
