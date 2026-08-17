import { SITE_URL, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION } from '../site.config.js'

const site = new URL(SITE_URL)

/** Absolute, because the things that read these tags are not the browser. */
const absolute = (path) => new URL(path, SITE_URL).href

/**
 * The three files that have to agree with site.config.js.
 *
 * **Preview tags.** `og:image` and `og:url` are fetched by WhatsApp's,
 * Instagram's and iMessage's own servers, which have no page to resolve a
 * relative path against — so they must carry the full domain. Generating
 * them is what stops the domain being pasted into index.html by hand and
 * going stale the day it changes. Everything a preview needs that is NOT
 * domain-dependent stays as plain markup in index.html, where it can be
 * read.
 *
 * **The manifest.** Same reason in a different costume: it repeats the app's
 * name and description, and a home-screen icon labelled with last month's
 * tagline is worse than no manifest.
 *
 * **CNAME.** GitHub Pages reads it out of the published files to learn which
 * domain to answer on. It has to match the domain in the tags, or the
 * preview image 404s on the very host that serves the page.
 */
export function sitePlugin({ emitCname = false } = {}) {
  return {
    name: 'wyn-site',

    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        { tag: 'meta', attrs: { property: 'og:url', content: SITE_URL }, injectTo: 'head' },
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: absolute('og-image.jpg') },
          injectTo: 'head'
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: absolute('og-image.jpg') },
          injectTo: 'head'
        }
      ]
    },

    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify(
          {
            name: SITE_TITLE,
            short_name: SITE_NAME,
            description: SITE_DESCRIPTION,
            // Relative, so one manifest serves both the github.io path and
            // the custom domain without being rebuilt per host
            start_url: './',
            scope: './',
            // No browser chrome once it is on the home screen — the point of
            // the whole exercise for a full-screen map
            display: 'standalone',
            background_color: '#0b0f19',
            theme_color: '#0b0f19',
            categories: ['social', 'lifestyle', 'events'],
            icons: [
              { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
              { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
              // Android crops this one to whatever shape the launcher likes,
              // so it is drawn with a wider quiet zone around the pin
              {
                src: './icon-maskable-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable'
              }
            ]
          },
          null,
          2
        )
      })

      // Only meaningful once there IS a custom domain — on github.io the
      // file would tell Pages to answer on a host it does not own
      if (!emitCname || site.hostname.endsWith('github.io')) return
      this.emitFile({ type: 'asset', fileName: 'CNAME', source: `${site.hostname}\n` })
    }
  }
}
