import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { serve } from './lib/server.js'
import { launch } from './lib/browser.js'

/**
 * WYN's regression suite.
 *
 *   npm test              build, then run everything
 *   npm test -- --quick   skip the build and reuse what is on disk
 *   npm test -- card      run only the specs whose name contains "card"
 *
 * It serves two builds, because some of what broke here is only reachable
 * with a backend configured:
 *
 *   DEMO  dist-single   — seeded local data, no network. Almost everything.
 *   LIVE  dist-test     — Supabase configured but pointed at a dead port.
 *                         The only way to exercise the confirmation-link
 *                         path, and the only way to see what a member gets
 *                         when the backend does not answer, which is what
 *                         a paused free-tier project looks like.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

const args = process.argv.slice(2)
const quick = args.includes('--quick')
const filter = args.filter((a) => !a.startsWith('--'))

// Chrome refuses to connect to a handful of ports it considers unsafe, so a
// dead backend has to be somewhere it will actually try and fail
const DEAD_BACKEND = 'http://127.0.0.1:59999'

function run(cmd, cmdArgs, env) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
  if (r.status !== 0) {
    console.error(`\n${cmd} ${cmdArgs.join(' ')} failed:\n${r.stdout}\n${r.stderr}`)
    process.exit(1)
  }
  return r.stdout
}

function build() {
  console.log('building…')
  run('npx', ['vite', 'build', '--config', 'vite.single.config.js'])
  run('npx', ['vite', 'build', '--config', 'vite.single.config.js', '--outDir', 'dist-test'], {
    VITE_SUPABASE_URL: DEAD_BACKEND,
    VITE_SUPABASE_ANON_KEY: 'test.test.test'
  })
}

async function main() {
  if (quick) {
    for (const d of ['dist-single', 'dist-test']) {
      if (!fs.existsSync(path.join(root, d, 'index.html'))) {
        console.error(`--quick needs ${d} on disk; run without it once first.`)
        process.exit(1)
      }
    }
  } else {
    build()
  }

  const demo = await serve(path.join(root, 'dist-single'), 4174)
  const live = await serve(path.join(root, 'dist-test'), 4176)
  const browser = await launch()

  const specDir = path.join(here, 'specs')
  const files = fs
    .readdirSync(specDir)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => !filter.length || filter.some((want) => f.includes(want)))
    .sort()

  const results = []
  for (const file of files) {
    const spec = await import(path.join(specDir, file))
    console.log(`\n${'─'.repeat(62)}\n${spec.title}`)
    try {
      results.push(await spec.default({ browser, demo: demo.url, live: live.url }))
    } catch (e) {
      console.log(`    ✗ the spec itself crashed\n        ${e.message}`)
      results.push({ title: spec.title, passed: 0, findings: [{ name: 'spec crashed', detail: e.message }] })
    }
  }

  await browser.close()
  await demo.close()
  await live.close()

  const findings = results.flatMap((r) => r.findings.map((f) => ({ ...f, spec: r.title })))
  const passed = results.reduce((n, r) => n + r.passed, 0)

  console.log('\n' + '═'.repeat(62))
  if (!findings.length) {
    console.log(`${passed} checks passed across ${results.length} specs.`)
    return
  }
  console.log(`${passed} passed, ${findings.length} FAILED\n`)
  findings.forEach((f, i) => console.log(` ${i + 1}. [${f.spec}] ${f.name}\n     ${f.detail}`))
  process.exit(1)
}

main().catch((e) => {
  console.error('the runner crashed:', e)
  process.exit(2)
})
