import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { sitePlugin } from './build/site-plugin.js'
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION } from './site.config.js'

export default defineConfig({
  define: {
    // Shown on the Settings page so support can ask 'which version?'
    __APP_VERSION__: JSON.stringify('0.1.0'),
    // Read via src/config/site.js — never straight into a template
    __SITE_URL__: JSON.stringify(SITE_URL),
    __SITE_TITLE__: JSON.stringify(SITE_TITLE),
    __SITE_DESCRIPTION__: JSON.stringify(SITE_DESCRIPTION)
  },
  // Relative base + hash routing → deployable to any static path
  // (GitHub Pages serves from /<repo>/)
  base: './',
  // emitCname: this is the build that GitHub Pages publishes
  plugins: [vue(), sitePlugin({ emitCname: true })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
