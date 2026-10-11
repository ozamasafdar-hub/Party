import process from 'node:process'
import { ALL_TILE_SOURCES } from '../src/config/map.js'

/**
 * Are the map's tile providers still serving maps?
 *
 *   node scripts/check-tiles.js
 *
 * Written the day CARTO started answering unauthenticated requests with a
 * tile reading "API KEY REQUIRED" across it. The live map became a wall of
 * watermarks and nothing anywhere went red, because those tiles are
 * perfectly valid PNGs returned with HTTP 200. Status codes cannot see
 * this. Neither can the app's offline fallback, which only fires when a
 * tile fails to load.
 *
 * So the check is shape, not status: fetch three tiles that cover very
 * different ground — dense city, open sea, empty desert — and compare
 * them. A real basemap renders those three differently. A provider saying
 * "pay me" renders them identically, because it is the same picture of the
 * same sentence every time.
 *
 * Exit codes: 0 all well, 1 something is serving placeholders, 2 the
 * network could not be reached at all (which is not the provider's fault
 * and not a failure of this check).
 */

/** Slippy-map tile numbers for a lon/lat, the standard way. */
function tileFor(lon, lat, z) {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const rad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n)
  return { x, y, z }
}

/** Three places in Qatar that no honest basemap draws the same way. */
const PROBES = [
  { name: 'central Doha', ...tileFor(51.53, 25.28, 13) },
  { name: 'open sea', ...tileFor(51.9, 25.6, 13) },
  { name: 'inland desert', ...tileFor(51.0, 25.1, 13) }
]

const fill = (template, { x, y, z }) =>
  template
    .replace('{z}', z)
    .replace('{x}', x)
    .replace('{y}', y)
    .replace('{r}', '')
    // Any leftover subdomain placeholder; the app no longer uses one
    .replace('{s}', 'a')

async function fetchTile(url) {
  const res = await fetch(url, {
    headers: {
      // OSM's policy asks apps to identify themselves, and anonymous
      // clients get throttled or refused
      'user-agent': 'WYN-tile-check/1.0 (+https://github.com/ozamasafdar-hub/Party)'
    },
    signal: AbortSignal.timeout(20000)
  })
  const body = Buffer.from(await res.arrayBuffer())
  return {
    status: res.status,
    type: res.headers.get('content-type') || '',
    bytes: body.length,
    image: imageShape(body),
    // Cheap fingerprint: enough to tell two pictures apart
    fingerprint: `${body.length}:${body.subarray(0, 64).toString('hex')}`
  }
}

/**
 * Is this really a 256-pixel map tile?
 *
 * Size is not the test. The first version of this refused anything under
 * 300 bytes and immediately failed a perfectly good OpenStreetMap tile of
 * open sea — 103 bytes, because a solid blue square compresses to almost
 * nothing. Esri does the same over empty desert. A featureless tile being
 * tiny is the format working, not the provider failing.
 *
 * So read the header instead: PNG carries its dimensions in the IHDR
 * chunk, JPEG in its SOFn marker. A real tile is 256×256, or 512 if the
 * provider served a retina one.
 */
function imageShape(body) {
  // PNG: 8-byte signature, then IHDR with width and height as big-endian
  if (body.length > 24 && body.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
    return { kind: 'png', width: body.readUInt32BE(16), height: body.readUInt32BE(20) }
  }
  // JPEG: walk the markers to the frame header that carries the size
  if (body.length > 4 && body[0] === 0xff && body[1] === 0xd8) {
    let i = 2
    while (i + 9 < body.length) {
      if (body[i] !== 0xff) break
      const marker = body[i + 1]
      const length = body.readUInt16BE(i + 2)
      // SOF0..SOF15, skipping the four that are not frame headers
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { kind: 'jpeg', height: body.readUInt16BE(i + 5), width: body.readUInt16BE(i + 7) }
      }
      i += 2 + length
    }
    return { kind: 'jpeg', width: 0, height: 0 }
  }
  return null
}

async function checkSource(source) {
  const results = []
  for (const probe of PROBES) {
    try {
      results.push({ probe, ...(await fetchTile(fill(source.url, probe))) })
    } catch (e) {
      return { state: 'unreachable', why: e.message }
    }
  }

  const bad = results.find((r) => r.status !== 200 || !r.type.startsWith('image/'))
  if (bad) {
    return {
      state: 'broken',
      why: `${bad.probe.name} came back ${bad.status} ${bad.type || '(no type)'}`
    }
  }

  const notAnImage = results.find((r) => !r.image)
  if (notAnImage) {
    return {
      state: 'broken',
      why: `${notAnImage.probe.name} is not a PNG or JPEG at all (${notAnImage.bytes}B)`
    }
  }

  const wrongSize = results.find((r) => ![256, 512].includes(r.image.width))
  if (wrongSize) {
    return {
      state: 'broken',
      why: `${wrongSize.probe.name} is ${wrongSize.image.width}×${wrongSize.image.height}, not a 256px tile`
    }
  }

  /**
   * The watermark test, and the reason this script exists.
   *
   * Only for a chain's BASE layer. A labels overlay is legitimately blank
   * over sea and over empty desert — identical tiles there mean the
   * cartography is right, not that the provider is stalling.
   */
  if (source.layer === 0) {
    const prints = new Set(results.map((r) => r.fingerprint))
    if (prints.size === 1) {
      return {
        state: 'broken',
        why:
          `all three tiles are byte-identical (${results[0].bytes}B) — city, sea and ` +
          'desert cannot look the same, so this is a placeholder, not a map'
      }
    }
  }

  return {
    state: 'ok',
    why: results.map((r) => `${r.probe.name} ${r.bytes}B`).join(', ')
  }
}

async function main() {
  // One source can appear under several styles; check each URL once, and
  // remember whether it is ever used as a chain's base layer — the
  // watermark test only applies to those
  const seen = new Map()
  for (const s of ALL_TILE_SOURCES) {
    if (!seen.has(s.url)) seen.set(s.url, { styles: [], layer: s.layer })
    const entry = seen.get(s.url)
    entry.styles.push(s.style)
    entry.layer = Math.min(entry.layer, s.layer)
  }

  console.log(`checking ${seen.size} tile sources across ${PROBES.length} places in Qatar\n`)

  const broken = []
  const unreachable = []

  for (const [url, { styles, layer }] of seen) {
    const host = new URL(url.replace('{s}', 'a')).host
    const result = await checkSource({ url, layer })
    const role = layer === 0 ? '' : ' — labels overlay'
    const label = `${host}  (${[...new Set(styles)].join(', ')}${role})`

    if (result.state === 'ok') console.log(`  ✓ ${label}\n      ${result.why}`)
    else if (result.state === 'unreachable') {
      console.log(`  – ${label}\n      could not reach it: ${result.why}`)
      unreachable.push(label)
    } else {
      console.log(`  ✗ ${label}\n      ${result.why}`)
      broken.push({ label, why: result.why })
    }
  }

  console.log('\n' + '─'.repeat(62))
  if (broken.length) {
    console.log(`${broken.length} source(s) are no longer serving real maps:\n`)
    broken.forEach((b) => console.log(`  • ${b.label}\n    ${b.why}`))
    console.log(
      '\nReplace them in src/config/map.js. Every style keeps a second,\n' +
        'independent chain, and "soft" is a bundled vector map that needs no\n' +
        'network at all — so the app degrades rather than going blank.'
    )
    process.exit(1)
  }
  if (unreachable.length === seen.size) {
    console.log('Could not reach any tile server — no network here, nothing proven.')
    process.exit(2)
  }
  console.log(
    unreachable.length
      ? `Every reachable source is serving real tiles (${unreachable.length} unreachable).`
      : 'Every tile source is still serving real maps.'
  )
}

main().catch((e) => {
  console.error('the check itself failed:', e)
  process.exit(2)
})
