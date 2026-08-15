import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath, URL } from 'node:url'

// `npm run build:single` — emits dist-single/index.html with every script,
// style, and asset inlined. Handy for one-file demos and simple hosting.
export default defineConfig({
  // Shown on the Settings page so support can ask 'which version?'
  define: { __APP_VERSION__: JSON.stringify('0.1.0') },
  plugins: [vue(), viteSingleFile()],
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
