import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { consumeAuthCallback } from './services/supabaseClient'
import { useAuthStore } from './stores/authStore'
import './assets/styles/main.css'

// After a redeploy, route code that loads on demand (profile, login…) may
// reference files from the previous build that no longer exist. Reload
// once to pick up the fresh build instead of silently failing —
// guarded so a genuinely broken network can't cause a reload loop.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'wyn:reloaded-for-update'
  try {
    if (sessionStorage.getItem(KEY)) return
    sessionStorage.setItem(KEY, '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

/**
 * Nothing may read the URL before the auth callback has.
 *
 * Arriving from a confirmation email means the session is sitting in the
 * address bar as `#access_token=…`. The router routes on the hash, so the
 * moment it starts it will fail to match that, hit the catch-all, and
 * rewrite the hash to `#/` — destroying the session on the way past. So
 * the callback is claimed first and the app is only built afterwards.
 *
 * On an ordinary visit consumeAuthCallback() returns immediately without
 * touching the network, so this costs a resolved promise and nothing else.
 */
consumeAuthCallback().then((callback) => {
  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)
  app.mount('#app')

  if (callback) useAuthStore(pinia).noteCallback(callback)
})
