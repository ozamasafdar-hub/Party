/**
 * The reporter.
 *
 * Every assertion carries two strings: what should be true, and what was
 * actually found when it wasn't. The second one is the whole value of the
 * suite — "expected true, got false" sends you back to the source to work
 * out what the test even meant, where "row ends at 322, controls start at
 * 334" tells you what to fix without opening anything.
 */
export function suite(title) {
  const findings = []
  let passed = 0

  return {
    title,

    section(name) {
      console.log(`\n  ${name}`)
    },

    /**
     * @param {string} name  what is true when this passes
     * @param {boolean} ok
     * @param {string} detail  what was actually found, with the numbers
     */
    check(name, ok, detail = '') {
      if (ok) {
        passed++
        console.log(`    ✓ ${name}`)
      } else {
        findings.push({ name, detail })
        console.log(`    ✗ ${name}\n        ${detail}`)
      }
    },

    /** Something the spec could not get far enough to judge. */
    skip(name, why) {
      console.log(`    – ${name} (${why})`)
    },

    result: () => ({ title, passed, findings })
  }
}
