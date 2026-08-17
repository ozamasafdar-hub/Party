import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath, URL } from 'node:url'
import { sitePlugin } from './build/site-plugin.js'
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION } from './site.config.js'

// `npm run build:single` — emits dist-single/index.html with every script,
// style, and asset inlined. Handy for one-file demos and simple hosting.
//
// No CNAME here: this build is one file that gets carried around, so it has
// no domain of its own to claim. It keeps the rest of sitePlugin so the two
// builds cannot drift — the smoke suites run against this one, which is the
// only reason the preview tags and the manifest are ever tested at all.
export default defineConfig({
  define: {
    // Shown on the Settings page so support can ask 'which version?'
    __APP_VERSION__: JSON.stringify('0.1.0'),
    __SITE_URL__: JSON.stringify(SITE_URL),
    __SITE_TITLE__: JSON.stringify(SITE_TITLE),
    __SITE_DESCRIPTION__: JSON.stringify(SITE_DESCRIPTION)
  },
  plugins: [vue(), sitePlugin({ emitCname: false }), viteSingleFile()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100000000
  }
})
