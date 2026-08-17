/**
 * Where WYN lives, and how it introduces itself.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  MOVING TO YOUR OWN DOMAIN? Change SITE_URL below. That is the only  │
 * │  edit. Everything downstream reads from here:                        │
 * │                                                                      │
 * │   • the CNAME file GitHub Pages needs to answer on your domain       │
 * │   • the og:image / og:url tags WhatsApp reads to draw a link card,   │
 * │     which have to be absolute because WhatsApp's servers fetch them  │
 * │     with no page to resolve a relative path against                  │
 * │   • the "open the full app" link shown inside embedded previews      │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Imported by vite.config.js at build time, and handed to the app as
 * __SITE_URL__ — the same define trick as __APP_VERSION__.
 */

/** Trailing slash matters: every absolute asset URL is resolved against it. */
export const SITE_URL = 'https://ozamasafdar-hub.github.io/Party/'

export const SITE_NAME = 'WYN'

/** What a shared link says on its first line. */
export const SITE_TITLE = 'WYN — see what’s on in Qatar'

/**
 * The second line of a link card. Long enough to say what the app is to
 * somebody who has never heard of it, short enough that WhatsApp doesn't
 * cut it off — roughly 120 characters is the safe ceiling.
 */
export const SITE_DESCRIPTION =
  'A live map of what’s happening around Doha tonight. Find an event, join it, or host your own.'

/**
 * The line printed on the preview image itself — shorter than the
 * description, because the card has the wordmark above it doing half the
 * work and only about two lines of room underneath.
 */
export const SITE_TAGLINE = 'A live map of what’s on in Qatar tonight.'
