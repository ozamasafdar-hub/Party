import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

/**
 * Guards against a selected control going invisible when you tap it.
 *
 * `.pill:hover` scores one class plus a pseudo-class; `.pill--active`
 * scores one class. So wherever both set a background on the same element,
 * hover wins regardless of which is written last — and on a touch screen
 * the hover sticks to whatever you just tapped. The selected control then
 * wears the hover wash instead of its own colour, which over a light
 * basemap reads as nothing at all.
 *
 * Run against a build:  npm run build && node scripts/check-hover-active.js
 * Exits non-zero, listing each control, when a pair is found.
 *
 * The fix on every hit so far: put the hover rule behind
 * `@media (hover: hover)` and exclude the active modifier with :not().
 */

const dir = path.resolve(import.meta.dirname, '..', 'dist', 'assets')
if (!fs.existsSync(dir)) {
  console.error('No dist/assets — run `npm run build` first.')
  process.exit(2)
}

const css = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
  .join('\n')

const rules = []
const re = /([^{}]+)\{([^{}]*)\}/g
let m
while ((m = re.exec(css))) {
  if (!/(^|;|\s)background(-color|-image)?\s*:/.test(m[2])) continue
  rules.push({ sel: m[1].trim(), body: m[2].trim() })
}

const bg = (body) => {
  const hit = body.match(/(?:^|;)\s*(background(?:-color|-image)?)\s*:\s*([^;]+)/)
  return hit ? hit[2].trim() : ''
}

// Vue's scoped styles emit `.foo[data-v-xxx]:hover` — the attribute lands
// before the pseudo-class, so match it there.
const hovers = new Map()
for (const r of rules) {
  for (const part of r.sel.split(',')) {
    const hit = part.trim().match(/^\.([a-z0-9_-]+)(?:\[[^\]]*\])?:hover$/i)
    if (hit) hovers.set(hit[1], { sel: part.trim(), value: bg(r.body) })
  }
}

const findings = []
for (const r of rules) {
  for (const part of r.sel.split(',')) {
    const hit = part.trim().match(/^\.(([a-z0-9_-]+?)--[a-z0-9-]*active)(?:\[[^\]]*\])?$/i)
    if (!hit) continue
    const hover = hovers.get(hit[2])
    if (!hover) continue
    findings.push({
      base: hit[2],
      activeSel: `.${hit[1]}`,
      activeBg: bg(r.body),
      hoverSel: hover.sel,
      hoverBg: hover.value
    })
  }
}

if (!findings.length) {
  console.log('check-hover-active: every selected state survives a hover')
  process.exit(0)
}

console.log(`\ncheck-hover-active: ${findings.length} control(s) where hover hides the selection\n`)
for (const f of findings) {
  console.log(`  .${f.base}`)
  console.log(`     selected : ${f.activeSel}`)
  console.log(`                ${f.activeBg}`)
  console.log(`     hovered  : ${f.hoverSel}   ← wins on specificity`)
  console.log(`                ${f.hoverBg}\n`)
}
process.exit(1)
