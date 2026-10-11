# WYN's tests

```sh
npm test                  # build, then run every spec
npm test -- --quick       # skip the build, reuse what's on disk
npm test -- card gates    # only the specs whose filename matches
node tests/negative-control.js   # prove the suite can still fail
```

## Why these live here

They used to live in a scratch directory outside the repo, and one day the
container was recycled and all thirty-one of them were gone — along with
every regression they guarded. Everything committed came back; nothing else
did. **A test outside the repo is not a test.**

## What is covered, and why each one exists

Nothing here is hypothetical. Every spec guards a bug that actually
happened to this app.

| Spec | The bug it remembers |
|---|---|
| `01-boot` | A profile query against an unreachable backend never settles — it doesn't fail, it hangs. The router awaited it before the first paint, so the whole app rendered white, indefinitely, with no error. A paused free-tier Supabase project looks exactly like this. |
| `02-join-gates` | Migration 011 silently dropped the Host Pro-only check, and nobody noticed until a real database was stood up and asked. Also: gender had to become unchangeable, or a man reached a ladies-only event in two taps. |
| `03-event-card` | Opened from a profile, the card's ✕ dropped you on a map you had never chosen. Separately, the card grew past the screen and its bottom was unreachable on a phone. |
| `04-settings` | Settings used `min-height: 100vh` against a locked document, putting a third of the page out of reach. Also covers what must SURVIVE a member deleting their account — a delete that cascaded would take other people's evenings with it. |
| `05-launch-readiness` | The confirmation link in the sign-up email did not work: the session comes back in the URL hash, the app routes on the hash, and the router wiped it before anything could read it. |
| `06-controls` | `:hover` outscores an `--active` modifier, and on a touch screen the hover sticks to whatever you just tapped — so the selected control wore the hover wash and vanished over a light basemap. Four controls had it at once. |

## The two kinds of test here

The browser specs cover what a member can see and do. They run against the
demo backend, which is seeded and offline.

**`docs/sql-tests/` is the other half**, and it is not optional. Some rules
only exist in the database — the capacity trigger, the ladies-only gate in
live mode, the host's exemption from their own reliability floor, what
survives `delete_my_account()`. Those are asserted against a real
throwaway Postgres built from the real schema:

```sh
bash docs/sql-tests/run.sh
```

If a rule cannot be reached from the browser, do not fake it here — assert
it there. One check in this suite was quietly meaningless for exactly that
reason, and only the negative control caught it.

## Two builds, two servers

| | | |
|---|---|---|
| `dist-single` | `:4174` | Demo backend. Seeded local data, no network. Almost everything. |
| `dist-test` | `:4176` | Supabase configured, pointed at a dead port. The only way to exercise the confirmation-link path, and the only way to see what a member gets when the backend doesn't answer. |

Both are built by `npm test`. `dist-test` is gitignored.

## Writing a new spec

Drop a file in `tests/specs/`. Export a `title` and a default async
function taking `{ browser, demo, live }`, and return `s.result()`.

Two rules, both learned the hard way:

**Write the failure message, not just the assertion.** `expected true, got
false` sends you back to the source to work out what the test even meant.
`row ends at 322, controls start at 334` tells you what to fix without
opening anything.

**Then add the mutation that breaks it** to `tests/negative-control.js`. If
you cannot think of a change that would make your new check go red, the
check is not testing anything — and you will not find that out any other
way. That file is how we learned one of these specs had been passing on a
code path it never actually touched.

## Finding a browser

`playwright-core` ships without one. The suite looks in three places, in
order: `CHROME_PATH`, then `PLAYWRIGHT_BROWSERS_PATH` (how the Claude Code
container provides it), then playwright-core's own guess (how a normal
machine does). To set one up from scratch:

```sh
node node_modules/playwright-core/cli.js install chromium
```
