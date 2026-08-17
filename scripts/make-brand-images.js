/**
 * Renders the app icons and the link-preview card into public/.
 *
 *   node scripts/make-brand-images.js
 *
 * Everything here is drawn from the same WYN pin that is already the
 * favicon, in the same maroon the app uses — so the icon on a member's home
 * screen, the pin on the map and the card in a WhatsApp thread are the one
 * mark rather than three drawings of it. Re-run after changing the pin or
 * the palette; the output is committed, so a normal build does not need it.
 *
 * Uses the headless Chromium the test suite already runs on. No image
 * library: five files, and a browser draws SVG better than a dependency.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { SITE_NAME, SITE_TAGLINE } from '../site.config.js'

/**
 * Not a dependency of the app. Its output is committed, so a build never
 * needs it, and making every `npm install` pull a browser engine down for a
 * script that runs about once a year is a bad trade.
 */
async function loadChromium() {
  try {
    return (await import('playwright-core')).chromium
  } catch {
    console.error(
      'This script needs playwright-core, which the app itself does not:\n' +
        '  npm i --no-save playwright-core\n' +
        'The images it writes are committed, so you only need this to redraw them.'
    )
    process.exit(1)
  }
}

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

const MAROON = '#8b1538'
const MAROON_BRIGHT = '#c62d55'
const INK = '#0b0f19'

/** The favicon's pin, unpacked from the data URI in index.html. */
const PIN = `
<svg viewBox="0 0 40 44" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="d" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#AC2148"/>
      <stop offset="1" stop-color="#7C1533"/>
    </linearGradient>
  </defs>
  <path d="M20 43.2C10.4 32.6 3.4 25.6 3.4 17.1a16.6 16.6 0 1 1 33.2 0c0 8.5-7 15.5-16.6 26.1Z" fill="url(#d)"/>
  <circle cx="20" cy="16.8" r="8.5" fill="none" stroke="white" stroke-width="4.6"/>
  <path d="M23.9 21.9c1.6 4-2.1 7.3-6.6 6-1.7-.5-3.2 0-4.2 1.2" fill="none" stroke="white" stroke-width="4.4" stroke-linecap="round"/>
</svg>`

const FONT =
  "'Inter','Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif"

/**
 * `inset` is the quiet zone as a fraction of the canvas. Android crops a
 * maskable icon to whatever shape the launcher likes — a circle on most —
 * so that variant has to keep the pin well inside a safe centre or the
 * launcher takes a bite out of it.
 */
function iconPage(size, inset) {
  const pin = Math.round(size * (1 - inset * 2))
  return `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0}
  body{width:${size}px;height:${size}px;display:flex;align-items:center;
       justify-content:center;
       background:radial-gradient(120% 120% at 30% 10%, ${MAROON_BRIGHT} 0%, ${MAROON} 45%, ${INK} 100%)}
  svg{width:${pin}px;height:${pin}px;filter:drop-shadow(0 ${Math.round(size * 0.02)}px ${Math.round(size * 0.04)}px rgba(0,0,0,.45))}
</style>${PIN}`
}

/**
 * 1200×630 is what every link unfurler expects.
 *
 * The copy fills the space the pin leaves rather than sitting in a fixed
 * column — the first draft pinned it to 15ch and the tagline came out five
 * lines deep with a third of the card empty beside it.
 */
function cardPage(title, tagline) {
  return `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0}
  body{width:1200px;height:630px;display:flex;align-items:center;gap:76px;
       padding:0 92px;box-sizing:border-box;font-family:${FONT};color:#f4f6fb;
       background:radial-gradient(90% 130% at 18% 8%, #2a1230 0%, ${INK} 55%, #05070d 100%)}
  .glow{position:absolute;inset:0;
        background:radial-gradient(40% 55% at 20% 48%, rgba(198,45,85,.38) 0%, transparent 72%);}
  .pin{position:relative;width:270px;flex-shrink:0;
       filter:drop-shadow(0 24px 52px rgba(0,0,0,.6))}
  .copy{position:relative;flex:1;min-width:0}
  h1{margin:0;font-size:132px;line-height:.94;font-weight:800;letter-spacing:-.04em}
  p{margin:30px 0 0;font-size:41px;line-height:1.28;font-weight:500;color:#ccd4e3}
  .rule{margin-top:38px;width:170px;height:8px;border-radius:99px;
        background:linear-gradient(90deg, ${MAROON_BRIGHT}, #d4af6a)}
</style>
<div class="glow"></div>
<div class="pin">${PIN}</div>
<div class="copy"><h1>${title}</h1><p>${tagline}</p><div class="rule"></div></div>`
}

const JOBS = [
  // Android / PWA install
  { file: 'icon-192.png', w: 192, h: 192, html: iconPage(192, 0.16) },
  { file: 'icon-512.png', w: 512, h: 512, html: iconPage(512, 0.16) },
  // Cropped to the launcher's shape, so it needs a wider quiet zone
  { file: 'icon-maskable-512.png', w: 512, h: 512, html: iconPage(512, 0.26) },
  // iOS ignores the manifest entirely and reads only this one
  { file: 'apple-touch-icon.png', w: 180, h: 180, html: iconPage(180, 0.15) },
  // JPEG, not PNG: the card is a big soft gradient, which PNG stores badly
  // (377KB on the first pass) and JPEG stores well. Every unfurler fetches
  // this from its own servers on every share, so the weight is worth caring
  // about. Icons stay PNG — they need the crisp edges and the transparency.
  {
    file: 'og-image.jpg',
    w: 1200,
    h: 630,
    quality: 88,
    html: cardPage(SITE_NAME, SITE_TAGLINE)
  }
]

async function main() {
  const chromium = await loadChromium()
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
  for (const job of JOBS) {
    const page = await (
      await browser.newContext({
        viewport: { width: job.w, height: job.h },
        deviceScaleFactor: 1
      })
    ).newPage()
    await page.setContent(job.html, { waitUntil: 'load' })
    const file = path.join(OUT, job.file)
    await page.screenshot(
      job.quality ? { path: file, type: 'jpeg', quality: job.quality } : { path: file }
    )
    await page.context().close()
    const kb = Math.round(fs.statSync(file).size / 1024)
    console.log(`  ${job.file.padEnd(24)} ${job.w}×${job.h}  ${kb}KB`)
  }
  await browser.close()
  console.log('\nWrote 5 files to public/')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
