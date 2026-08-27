import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
  },
  server: {
    proxy: {
      // API_PROXY_TARGET: apuntar el dev server a otra API (ej. el contenedor
      // stc_api en :3001) sin tocar este archivo. Default: API local en :3000.
      '/api': { target: apiTarget, changeOrigin: true },
      '/ws':  { target: apiTarget.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
    },
  },
})
