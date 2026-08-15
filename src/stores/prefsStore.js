import { defineStore } from 'pinia'
import { BASEMAPS, DEFAULT_BASEMAP } from '@/config/map'

/**
 * Per-browser display preferences.
 *
 * These lived as refs inside MapView while the only way to change them was
 * a control sitting on the map. They are set from the Settings page now, so
 * they have to outlive that component — and the map has to follow a change
 * made on another screen.
 *
 * Same localStorage keys as before, so nobody's existing choice resets.
 */

const STYLE_KEY = 'wyn:map-style'
const HEAT_KEY = 'wyn:map-heat'

// localStorage throws in some sandboxed iframes (hosted previews); fall
// back to not persisting rather than breaking the page.
const read = (key) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* preference just won't survive a reload */
  }
}

export const usePrefsStore = defineStore('prefs', {
  state: () => {
    const stored = read(STYLE_KEY)
    return {
      // An unknown key — a style renamed or removed since — falls back
      // rather than leaving the map with no basemap at all
      mapStyle: BASEMAPS[stored] ? stored : DEFAULT_BASEMAP,
      showHeat: read(HEAT_KEY) === '1'
    }
  },

  actions: {
    setMapStyle(key) {
      if (!BASEMAPS[key]) return
      this.mapStyle = key
      write(STYLE_KEY, key)
    },

    setHeat(on) {
      this.showHeat = !!on
      write(HEAT_KEY, on ? '1' : '0')
    }
  }
})
