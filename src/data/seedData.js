import { nextHalfHourISO } from '@/utils/datetime'

/**
 * Seed members + events so the map is alive on first run.
 * In production this data lives in Postgres (see docs/database-schema.sql)
 * and arrives through the Supabase client instead.
 */

export const SEED_MEMBERS = [
  { id: 'u-noora', name: 'Noora Al-Thani', avatarColor: '#c62d55', initials: 'NA' },
  { id: 'u-hassan', name: 'Hassan Karim', avatarColor: '#38bdf8', initials: 'HK' },
  { id: 'u-mariam', name: 'Mariam Saleh', avatarColor: '#2dd4a0', initials: 'MS' },
  { id: 'u-omar', name: 'Omar Farouk', avatarColor: '#a78bfa', initials: 'OF' },
  { id: 'u-layla', name: 'Layla Ahmed', avatarColor: '#fbbf6e', initials: 'LA' },
  { id: 'u-yousef', name: 'Yousef Mansour', avatarColor: '#fb7185', initials: 'YM' }
]

function at(hoursFromNow, minutes = 0) {
  const d = new Date(nextHalfHourISO())
  d.setHours(d.getHours() + hoursFromNow, d.getMinutes() + minutes)
  return d.toISOString()
}

export const SEED_MESSAGES = [
  {
    id: 'm-1',
    eventId: 'e-bowling',
    userId: 'u-mariam',
    text: 'Anyone carpooling from West Bay?',
    at: new Date(Date.now() - 2 * 3600000).toISOString()
  },
  {
    id: 'm-2',
    eventId: 'e-bowling',
    userId: 'u-hassan',
    text: 'I can take 3 people — leaving 7:30 from the Corniche.',
    at: new Date(Date.now() - 90 * 60000).toISOString()
  },
  {
    id: 'm-3',
    eventId: 'e-yacht',
    userId: 'u-noora',
    text: 'Berth 12 at Porto Arabia — look for the blue hull ⚓',
    at: new Date(Date.now() - 40 * 60000).toISOString()
  }
]

export const SEED_EVENTS = [
  {
    id: 'e-bowling',
    hostId: 'u-hassan',
    title: 'Bowling night at B Square',
    description:
      'Booked two lanes at B Square Mall. Casual game, all levels welcome — loser buys karak!',
    category: 'bowling',
    locationName: 'B Square Mall, Al Waab',
    lat: 25.2597,
    lng: 51.4457,
    startsAt: at(3),
    durationMinutes: 120,
    maxCapacity: 8,
    attendeeIds: ['u-hassan', 'u-mariam', 'u-omar']
  },
  {
    id: 'e-yacht',
    hostId: 'u-noora',
    title: 'Sunset yacht from The Pearl',
    description:
      'Booked a 46ft yacht from Porto Arabia marina, 6 hours. Bring sunscreen — swimming stop at Banana Island.',
    category: 'yacht',
    locationName: 'Porto Arabia, The Pearl',
    lat: 25.3697,
    lng: 51.5536,
    startsAt: at(1),
    durationMinutes: 360,
    maxCapacity: 6,
    attendeeIds: ['u-noora', 'u-layla', 'u-hassan', 'u-yousef', 'u-mariam']
  },
  {
    id: 'e-golf',
    hostId: 'u-omar',
    title: 'Golf session at Education City',
    description:
      'Booked the 9-hole course at Education City Golf Club. Clubs available to rent on site.',
    category: 'golf',
    locationName: 'Education City Golf Club',
    lat: 25.3106,
    lng: 51.4249,
    startsAt: at(20),
    durationMinutes: 180,
    maxCapacity: 4,
    attendeeIds: ['u-omar']
  },
  {
    id: 'e-cinema',
    hostId: 'u-layla',
    title: 'Movie night at Novo, The Pearl',
    description:
      'Watching the new release at Novo Cinemas. Meeting at the ticket counter 15 minutes before.',
    category: 'cinema',
    locationName: 'Novo Cinemas, The Pearl',
    lat: 25.3671,
    lng: 51.5497,
    startsAt: at(5, 30),
    durationMinutes: 150,
    maxCapacity: 10,
    attendeeIds: ['u-layla', 'u-noora']
  },
  {
    id: 'e-karak',
    hostId: 'u-mariam',
    title: 'Karak & kunafa at Souq Waqif',
    description:
      'Evening walk through the souq then karak at our usual spot. Very relaxed, come and go as you like.',
    category: 'dining',
    locationName: 'Souq Waqif',
    lat: 25.2867,
    lng: 51.5333,
    startsAt: at(0),
    durationMinutes: 180,
    maxCapacity: 12,
    attendeeIds: ['u-mariam', 'u-yousef', 'u-omar', 'u-hassan']
  },
  {
    id: 'e-padel',
    hostId: 'u-yousef',
    title: 'Padel doubles in Lusail',
    description:
      'Booked a court at Padel In. Need two more players for doubles — intermediate level.',
    category: 'sports',
    locationName: 'Padel In, Lusail',
    lat: 25.4106,
    lng: 51.4904,
    startsAt: at(26),
    durationMinutes: 90,
    maxCapacity: 4,
    attendeeIds: ['u-yousef', 'u-hassan', 'u-omar', 'u-mariam']
  },
  {
    id: 'e-katara',
    hostId: 'u-noora',
    title: 'Open-air concert at Katara',
    description:
      'Free amphitheatre concert at Katara Cultural Village. Meeting by the pigeon towers.',
    category: 'culture',
    locationName: 'Katara Amphitheatre',
    lat: 25.3594,
    lng: 51.5257,
    startsAt: at(28),
    durationMinutes: 150,
    maxCapacity: 20,
    attendeeIds: ['u-noora']
  },
  {
    id: 'e-run',
    hostId: 'u-hassan',
    title: 'Sunrise run — Aspire Park',
    description:
      '5k easy pace around Aspire Park lake, coffee after at the Torch café.',
    category: 'sports',
    locationName: 'Aspire Park',
    lat: 25.2632,
    lng: 51.4479,
    startsAt: at(16),
    durationMinutes: 60,
    maxCapacity: 15,
    attendeeIds: ['u-hassan', 'u-layla']
  }
]
