import { onBeforeUnmount, onMounted, watch } from 'vue'

/**
 * Makes the phone's back gesture — the edge swipe on iOS, the back button
 * on Android — close the open sheet instead of leaving the app.
 *
 * Sheets (the event card, the list, search, messages, the create wizard,
 * a story) are component state, not routes, so the browser had nothing to
 * go back to and the gesture walked straight out of the site.
 *
 * Opening a sheet pushes one history entry. A back gesture pops it and we
 * close the topmost sheet.
 *
 * Closing a sheet from the UI deliberately does NOT rewind that entry.
 * history.go() is queued and lands asynchronously, so a rewind issued as a
 * sheet closes can arrive after a route push that followed it and undo the
 * navigation — closing the sign-in sheet and then opening a profile was
 * enough to trigger it. Entries are left in place and reused instead: the
 * count only ever grows to the most sheets open at once, and an entry that
 * outlived its sheet simply passes the gesture along to the next one.
 *
 * Router state is spread into each entry, so vue-router keeps its own
 * bookkeeping (position, scroll) intact.
 *
 * @param {import('vue').Ref<number>} openCount how many sheets are open
 * @param {() => void} closeTop closes the topmost one
 */
export function useOverlayBack(openCount, closeTop) {
  let owned = 0 // history entries we hold
  let desired = 0 // sheets currently open
  let active = false

  function sync() {
    if (!active) return
    while (owned < desired) {
      owned += 1
      window.history.pushState({ ...window.history.state, wynSheet: owned }, '')
    }
  }

  function onPopState() {
    if (!active || owned === 0) return
    owned -= 1
    if (desired > 0) {
      closeTop()
    } else {
      // The entry outlived its sheet — carry the gesture onwards rather
      // than swallowing it, so a back press is never a dead press.
      window.history.back()
    }
  }

  watch(
    openCount,
    (n) => {
      desired = n
      sync()
    },
    { immediate: true }
  )

  onMounted(() => {
    active = true
    // Always starts at zero: we must only ever act on entries pushed during
    // THIS mount, never on a wynSheet marker left by an earlier one.
    owned = 0
    window.addEventListener('popstate', onPopState)
    sync()
  })

  onBeforeUnmount(() => {
    active = false
    window.removeEventListener('popstate', onPopState)
  })
}
