import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // Shown on the Settings page so support can ask 'which version?'
  define: { __APP_VERSION__: JSON.stringify('0.1.0') },
  // Relative base + hash routing → deployable to any static path
  // (GitHub Pages serves from /<repo>/)
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
