import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

/**
 * Finding a browser to drive.
 *
 * playwright-core deliberately ships without one, which keeps `npm install`
 * small but means the executable has to be located. Three places, in order
 * of how likely they are to be right:
 *
 *   1. CHROME_PATH — an explicit override always wins
 *   2. PLAYWRIGHT_BROWSERS_PATH — how the Claude Code container provides it
 *   3. playwright-core's own guess — how a normal `npx playwright install`
 *      machine provides it
 *
 * The failure message names the fix, because "Executable doesn't exist"
 * from deep inside a library tells you nothing about what to type.
 */
function findChromium() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH
  }

  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (root && fs.existsSync(root)) {
    const candidates = fs
      .readdirSync(root)
      .filter((d) => d.startsWith('chromium') && !d.includes('headless_shell'))
      // chromium-1194 before chromium, so a pinned build wins over a symlink
      .sort()
      .reverse()
      .flatMap((d) => [
        path.join(root, d, 'chrome-linux', 'chrome'),
        path.join(root, d, 'chrome-mac', 'Chromium.app/Contents/MacOS/Chromium'),
        path.join(root, d, 'chrome-win', 'chrome.exe')
      ])
    const hit = candidates.find((p) => fs.existsSync(p))
    if (hit) return hit
  }

  try {
    const own = chromium.executablePath()
    if (own && fs.existsSync(own)) return own
  } catch {
    /* falls through to the message below */
  }

  throw new Error(
    'No Chromium to test with.\n' +
      '  • installed browsers:  npx playwright install chromium\n' +
      '  • or point at one:     CHROME_PATH=/path/to/chrome npm test'
  )
}

export async function launch() {
  return chromium.launch({
    executablePath: findChromium(),
    // The container runs as root, where the sandbox refuses to start
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  })
}

/**
 * A phone-shaped page that collects the errors the app logs.
 *
 * `touch` matters for anything about selected states: a stuck :hover after
 * a tap only happens on a real touch device, so a desktop context cannot
 * see that class of bug at all.
 */
export async function phone(browser, { width = 390, height = 780, touch = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    ...(touch ? { hasTouch: true, isMobile: true } : {})
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  // Tiles and avatars are fetched from the open internet, which the test
  // container cannot reach. Those failures are the sandbox, not the app.
  page.errors = () => errors.filter((e) => !/net::|Failed to load resource/.test(e))
  return page
}

/** Reach into the running app the way the old suites did. */
export const pinia = (page) =>
  page.evaluate(() => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    return Object.fromEntries([...store._s.keys()].map((k) => [k, true]))
  })

/** Read one value out of a store, by name. */
export const fromStore = (page, store, fn) =>
  page.evaluate(
    ([s, body]) => {
      const p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      // eslint-disable-next-line no-new-func
      return new Function('store', `return (${body})(store)`)(p._s.get(s))
    },
    [store, fn.toString()]
  )
