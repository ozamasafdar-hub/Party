# 🗺️ WYN — Qatar's Members-Only Social Events Map

A members-only web app that connects people in Qatar through member-hosted
social events. The home screen is a fullscreen, Snap-Map-style **live map**:
verified members drop pins for what they're doing ("Bowling at B Square, 8 PM",
"Yacht from The Pearl at 6 PM"), and everyone else discovers and joins in
real time.

Built with **Vue 3 (JavaScript, `.vue` single-file components — no
TypeScript)**.

---

## 🚀 Quick start

```bash
npm install
npm run dev
```

Open the printed URL — the map is public, no account needed to browse.
The app ships with seeded events across Doha (The Pearl,
B Square, Education City Golf Club, Souq Waqif, Katara, Lusail…) and a
simulated realtime feed, so the map is alive with zero backend setup.

---

## 🧱 Recommended tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| Frontend | **Vue 3 + Vite + Pinia + Vue Router** (JS) | Your chosen framework; Vite for instant HMR, Pinia as the single source of truth for map/event state |
| Map rendering | **Leaflet** now → **Mapbox GL JS** at scale | Leaflet is free, tiny, and battle-tested; the app uses CARTO's `@2x` retina tiles (the `{r}` URL modifier) plus pure-SVG vector pins, so everything is crisp on UHD displays with **no API key**. When you need 3D buildings, smooth vector zoom, and custom branded styles, swap the tile layer for Mapbox GL — only `src/config/map.js` changes |
| Backend + realtime | **Supabase** (Postgres + PostGIS + Realtime + Auth) | One platform covers all four hard problems: relational data, **geospatial queries** (`ST_DWithin` for "events near me"), **live sync** (Postgres changes streamed over websockets to every open map), and **auth** (email + password accounts with Row Level Security). Firebase lacks real geo-queries; Socket.io means running your own server |
| Hosting | Vercel / Netlify (frontend) + Supabase cloud | Zero-ops, free tiers to start |

**Why not Firebase or Socket.io?** Firestore has no native geospatial
indexing (geohash workarounds only) and its security rules are weaker than
Postgres RLS for a members-only product. Socket.io gives you realtime but
nothing else — you'd still need a database, auth, and an API server.

### How realtime works here

The UI never talks to a backend directly — everything goes through
`src/services/eventService.js`, which exposes the exact call shapes Supabase
uses (`listEvents`, `createEvent`, `joinEvent`, `subscribeToEvents`). Today
those functions run against seeded in-memory data with a simulated activity
feed; going live means replacing only the bodies of that one file with
`supabase.from('events')...` / `supabase.channel(...)` calls. Stores,
components, and the map don't change.

---

## 🗄️ Database schema (high level)

Full production SQL (PostGIS, triggers, RLS, realtime) lives in
[`docs/database-schema.sql`](docs/database-schema.sql).

```
profiles (Users)                      events                                rsvps
─────────────────                     ──────────────────────────────        ────────────────────
id (uuid, PK → auth.users)            id (uuid, PK)                         event_id (PK, FK → events)
full_name                             host_id (FK → profiles)               user_id  (PK, FK → profiles)
avatar_url                            title / description                   status: going|waitlist|cancelled
bio                                   category (enum)                       created_at
is_approved  ← admin gate             location_name
is_admin                              location  geography(Point,4326) ← PostGIS
created_at                            starts_at (timestamptz)
                                      duration_minutes
                                      max_capacity
                                      is_cancelled
                                      created_at
```

Key mechanics:

- **Geospatial:** `events.location` is a PostGIS `geography(Point)` with a
  GiST index; the `events_within_radius()` RPC powers "what's happening near
  me" straight from the map viewport.
- **Capacity auto-close:** a `BEFORE INSERT` trigger on `rsvps` locks the
  event row and rejects joins beyond `max_capacity` — no oversold guestlists
  even under concurrent taps.
- **Members-only:** Row Level Security means unapproved accounts can't read
  a single event, even with a valid session token.
- **Realtime:** `events` and `rsvps` are in the `supabase_realtime`
  publication, so every open map receives INSERT/UPDATE deltas instantly.

---

## 📁 Folder structure

```
Party/
├── index.html
├── package.json
├── vite.config.js
├── docs/
│   └── database-schema.sql        # Production Supabase/PostGIS schema
└── src/
    ├── main.js                    # App bootstrap (Pinia + Router)
    ├── App.vue
    ├── assets/
    │   └── styles/main.css        # Design system: dark glass theme, pin CSS
    ├── config/
    │   ├── categories.js          # Category colors + vector pin glyphs
    │   └── map.js                 # Qatar bounds, UHD retina tile config
    ├── data/
    │   └── seedData.js            # Demo members + events across Doha
    ├── services/
    │   └── eventService.js        # Data layer (mock now, Supabase later)
    ├── stores/
    │   ├── authStore.js           # Email+password accounts (live & demo)
    │   └── eventStore.js          # Events, filters, RSVP + capacity logic
    ├── router/
    │   └── index.js               # Routes + auth guard
    ├── utils/
    │   └── datetime.js            # "Today · 8:00 PM", live-now detection
    ├── components/
    │   ├── map/
    │   │   ├── LiveMap.vue        # ★ Fullscreen live map (core component)
    │   │   └── eventMarker.js     # Crisp SVG pin factory (retina-perfect)
    │   ├── events/
    │   │   ├── EventCard.vue      # Pin tap → details + Join/RSVP sheet
    │   │   └── CreateEventModal.vue # Quick-post: title/category/time/capacity
    │   ├── layout/
    │   │   └── TopBar.vue         # Brand, category filter chips, profile
    │   └── ui/
    │       └── MemberAvatar.vue
    └── views/
        ├── MapView.vue            # Home: map + sheets + quick-post flow
        ├── LoginView.vue          # Log in / sign up page
        └── ProfileView.vue        # Avatar + hosted/attended history
```

---

## ✨ Feature walkthrough

1. **Interactive live map** — `LiveMap.vue` owns a Leaflet instance over
   CARTO dark retina (`@2x`) tiles, locked to Qatar's bounds. Event pins are
   inline SVG `divIcon`s (vector = crisp at any DPI), color-coded by
   category, with an attendee-count badge and a pulsing ring while the event
   is live. Markers are diffed in place, so realtime updates never flicker.
2. **Accounts at the right moment** — the map is public; tapping
   Join/RSVP or Drop-an-event opens a log in / sign up modal (email +
   password). Live mode uses Supabase Auth with an `is_approved` flag
   enforced by RLS, ready for admin gating later.
3. **Location-based event creation** — "＋ Drop an event" enters pick mode;
   tap the map to place a draft pin, then fill Title, Description, Category,
   Date/Time, Duration, and Max Capacity.
4. **RSVP & live guestlist** — tapping a pin opens `EventCard.vue` with the
   guestlist, a capacity bar, and Join/RSVP. Joins are rejected once
   capacity is hit (mirrored by a Postgres trigger in production), and the
   button flips to "Event full".
5. **Profiles** — name, avatar, and hosted/attended event history, linked
   from the map's top bar.

---

## 🗺️ Basemap data credits

The map ships four styles — Night and Day (CARTO retina tiles), Satellite
(Esri World Imagery with a CARTO label overlay), and Chart — plus an
event-density heatmap toggle.

When raster tiles are unavailable, the app renders a bundled vector basemap
of Qatar built from open data: coastline from
[geoBoundaries](https://www.geoboundaries.org) (CC BY 4.0), highways and
urban areas from [Natural Earth](https://www.naturalearthdata.com) (public
domain), and zone/neighbourhood/locality boundaries from
[Who's On First](https://whosonfirst.org) (CC0/CC BY). Raster tiles are
© OpenStreetMap contributors, style © CARTO.

## 🔌 Going live with Supabase

The Supabase integration is already built in — the app auto-detects it.
With no configuration it runs in demo mode (local seeded data and
browser-local accounts); with the two env vars set it becomes a real
multi-user app: email + password accounts, shared events, and realtime
RSVP sync.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's **SQL Editor**, paste and run
   [`docs/database-schema.sql`](docs/database-schema.sql) (creates tables,
   security policies, capacity trigger, profile auto-creation, realtime).
3. In **Authentication → Sign In / Up → Email**, make sure the Email
   provider is enabled (it is by default).
4. Grab **Settings → API → Project URL** and the **anon public** key, then:
   - **Local dev:** copy `.env.example` to `.env` and fill both values.
   - **Deployed site:** both values are pinned in
     `.github/workflows/deploy-pages.yml` (they're public by design —
     protected by Row Level Security) — update them there and push.
5. Optional: in **Authentication → Sign In / Up**, turn off **Confirm
   email** for instant sign-up (otherwise new members click a
   confirmation link first). To hand-approve members later, set the
   `profiles.is_approved` default to false in the schema.

Optional next step: swap `src/config/map.js` to Mapbox GL vector tiles for
3D buildings and custom branding.

## 🌐 Going live on your own domain

**Change one line.** [`site.config.js`](site.config.js) holds `SITE_URL`, and
everything that needs to know the address reads from there: the `CNAME` file
GitHub Pages needs to answer on your domain, the `og:image` / `og:url` tags
WhatsApp fetches to draw a link card, and the app's own "open the full app"
link. Set it, push, and the deploy carries the rest.

Then, outside the repo, in this order:

1. **Buy the domain.** Cloudflare Registrar sells at cost with no renewal
   markup. Keep DNS there too — Cloudflare flattens CNAMEs at the apex, so a
   bare domain needs *one* record pointing at `<user>.github.io` instead of
   the eight A/AAAA records GitHub otherwise requires.
2. **Point it.** A CNAME at the apex and one for `www`, both → your
   `<user>.github.io`. Leave them **DNS-only (grey cloud)** — proxying blocks
   GitHub from issuing the certificate.
3. **Tell GitHub.** Settings → Pages → Custom domain, wait for the check to
   pass, then tick **Enforce HTTPS**.
4. **Tell Supabase.** Authentication → URL Configuration → Site URL, and add
   the domain to Redirect URLs. Every confirmation email points at whatever
   is set here; miss it and sign-up links go to the old address.
5. **Send real email.** Supabase's built-in sender is rate-limited and
   labelled for testing only — with confirmation on, invites stop arriving
   once more than a handful of people sign up in a day. Point Supabase at
   an SMTP provider (Resend's free tier is 3,000/month) and verify your new
   domain so mail comes from `noreply@yourdomain`.

### What the code already handles

- **The confirmation link.** Supabase returns the session in the URL as
  `#access_token=…`, and the app routes on the hash — so the router matched
  nothing, hit the catch-all, and rewrote the hash to `#/`, taking the
  session with it. `consumeAuthCallback()` in
  [`supabaseClient.js`](src/services/supabaseClient.js) claims it first, and
  `main.js` waits for that before the app exists. Both link shapes are
  covered, and an expired one says so in plain words.
- **A backend that isn't answering.** A profile query against an unreachable
  Supabase never settles — it doesn't fail, it hangs. The public map no
  longer waits on it, and the store gives up after 8 seconds, so the worst
  case is browsing signed-out rather than a white screen.
- **Link previews and Add to Home Screen.** Generated by
  [`build/site-plugin.js`](build/site-plugin.js); the images are committed
  and redrawn with `node scripts/make-brand-images.js`.
