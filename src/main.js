import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
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

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
