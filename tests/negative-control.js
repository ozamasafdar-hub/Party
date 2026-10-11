import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * Does the suite actually have teeth?
 *
 *   node tests/negative-control.js
 *
 * A test that cannot fail is decoration, and a green suite tells you
 * nothing until you have watched it go red for the right reason. So: break
 * one real protection at a time, run the spec that is supposed to guard
 * it, and confirm it notices. Then put it back.
 *
 * Every mutation below is a bug that genuinely happened to this app, or
 * the exact line that prevents one. If you add a spec, add the mutation it
 * is meant to catch — otherwise nobody, including you, knows whether it
 * works.
 *
 * Nothing is left modified: each file is restored from the copy taken
 * before it was touched, including when a run crashes.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const MUTATIONS = [
  {
    name: 'the ladies-only gate stops refusing',
    spec: 'gates',
    file: 'src/services/eventService.js',
    find: "  if (event.ladiesOnly && db.members.find((m) => m.id === userId)?.gender !== 'female') {",
    replace: "  if (false && event.ladiesOnly) {",
    shouldCatch: /ladies|women|a man cannot/i
  },
  {
    name: 'the Host Pro-only gate stops refusing (migration 011 did this for real)',
    spec: 'gates',
    file: 'src/services/eventService.js',
    find: "  if (event.proOnly && event.hostId !== userId && demoTierOf(userId) !== 'host_pro') {",
    replace: '  if (false) {',
    shouldCatch: /free member cannot join/i
  },
  {
    name: 'a host is allowed to walk away from their own event',
    spec: 'gates',
    file: 'src/services/eventService.js',
    find: "    if (event.hostId === userId) throw new Error('Hosts cannot leave their own event')",
    replace: '    if (false) throw new Error(0)',
    shouldCatch: /cannot walk away from it/i
  },
  {
    name: 'gender becomes editable again, so the ladies gate is two taps away',
    spec: 'gates',
    file: 'src/stores/authStore.js',
    find: '      const genderLocked = !!this.currentUser.gender',
    replace: '      const genderLocked = false',
    shouldCatch: /cannot be switched afterwards/i
  },
  {
    name: 'sign-up stops saying where the confirmation link should return to',
    spec: 'launch',
    file: 'src/stores/authStore.js',
    find: '            emailRedirectTo: SITE_URL,',
    replace: '',
    shouldCatch: /where to send the member back|full path/i
  },
  {
    name: 'the confirmation-link handler stops claiming the session',
    spec: 'launch',
    file: 'src/services/supabaseClient.js',
    find: '  if (!code && !hasTokens && !failed) return null',
    replace: '  return null\n  // eslint-disable-next-line no-unreachable',
    shouldCatch: /session survives the router|told it worked/i
  },
  {
    name: 'the public map waits on the backend again (the white screen)',
    spec: 'boot',
    file: 'src/router/index.js',
    find: '  if (needsAnswer) await auth.restoreSession()\n  else auth.restoreSession()',
    replace: '  await auth.restoreSession()',
    alsoNeeds: [
      {
        file: 'src/stores/authStore.js',
        find: '      await Promise.race([\n        load,\n        new Promise((resolve) => setTimeout(resolve, RESTORE_TIMEOUT_MS))\n      ])',
        replace: '      await load'
      }
    ],
    shouldCatch: /white screen|paints anyway/i
  },
  {
    name: 'the Settings page grows past the screen again',
    spec: 'settings',
    file: 'src/views/SettingsView.vue',
    find: '.settings {\n  height: 100%;',
    replace: '.settings {\n  min-height: 100vh;',
    shouldCatch: /settings is its own scroller/i
  },
  {
    name: 'the pill row goes back to guillotining a pill in half',
    spec: 'controls',
    file: 'src/components/map/TimePills.vue',
    find: '  -webkit-mask-image: linear-gradient(',
    replace: '  -webkit-mask-image: none;\n  --off: linear-gradient(',
    alsoNeeds: [
      {
        file: 'src/components/map/TimePills.vue',
        find: '  mask-image: linear-gradient(',
        replace: '  mask-image: none;\n  --off2: linear-gradient('
      }
    ],
    shouldCatch: /fades instead of being cut off/i
  },
  {
    name: 'the preview image goes back to a relative path',
    spec: 'launch',
    file: 'build/site-plugin.js',
    find: "          attrs: { property: 'og:image', content: absolute('og-image.jpg') },",
    replace: "          attrs: { property: 'og:image', content: './og-image.jpg' },",
    shouldCatch: /absolute address/i
  },
  {
    name: 'a card opened from a profile goes back to offering Close',
    spec: 'card',
    file: 'src/views/MapView.vue',
    find: ':can-go-back="!!eventStore.cardReturnTo"',
    replace: ':can-go-back="false"',
    shouldCatch: /offers Back, not Close/i
  }
]

/* ------------------------------------------------------------------ */

const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const write = (f, s) => fs.writeFileSync(path.join(root, f), s)

function apply(m) {
  const touched = new Map()
  const edits = [{ file: m.file, find: m.find, replace: m.replace }, ...(m.alsoNeeds || [])]

  for (const e of edits) {
    const before = read(e.file)
    if (!touched.has(e.file)) touched.set(e.file, before)
    if (!before.includes(e.find)) {
      // Restore anything already changed, then report honestly
      for (const [f, s] of touched) write(f, s)
      return { ok: false, touched: null, why: `anchor not found in ${e.file}:\n    ${e.find.split('\n')[0]}` }
    }
    write(e.file, before.replace(e.find, e.replace))
  }


  return { ok: true, touched }
}

function runSpec(spec) {
  const r = spawnSync('node', ['tests/run.js', spec], {
    cwd: root,
    encoding: 'utf8',
    env: process.env
  })
  return (r.stdout || '') + (r.stderr || '')
}

function main() {
  const results = []
  for (const m of MUTATIONS) {
    process.stdout.write(`\n▸ ${m.name}\n`)
    const applied = apply(m)
    if (!applied.ok) {
      console.log(`  ⚠ could not apply — ${applied.why}`)
      results.push({ m, state: 'unapplied' })
      continue
    }

    let out = ''
    try {
      out = runSpec(m.spec)
    } finally {
      for (const [f, s] of applied.touched) write(f, s)
    }

    const failures = out
      .split('\n')
      .filter((l) => l.trim().startsWith('✗'))
      .map((l) => l.replace(/^\s*✗\s*/, ''))

    const caught = failures.some((f) => m.shouldCatch.test(f))
    console.log(
      caught
        ? `  ✓ caught by: ${failures.filter((f) => m.shouldCatch.test(f))[0]}`
        : `  ✗ NOT CAUGHT — the suite stayed green with this broken` +
            (failures.length ? `\n    (it did fail on: ${failures.join('; ')})` : '')
    )
    results.push({ m, state: caught ? 'caught' : 'missed' })
  }

  const missed = results.filter((r) => r.state !== 'caught')
  console.log('\n' + '═'.repeat(62))
  if (!missed.length) {
    console.log(`All ${results.length} broken behaviours were caught. The suite has teeth.`)
    return
  }
  console.log(`${results.length - missed.length}/${results.length} caught. NOT caught:`)
  missed.forEach((r) => console.log(`  • ${r.m.name} (${r.state})`))
  process.exit(1)
}

main()
