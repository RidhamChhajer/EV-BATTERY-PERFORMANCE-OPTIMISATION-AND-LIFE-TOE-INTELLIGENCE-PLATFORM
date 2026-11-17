/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the API runs on :8000 (override with EV_API_PORT) and /api is proxied, so the browser sees one origin (no CORS needed).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: `http://127.0.0.1:${process.env.EV_API_PORT ?? 8000}`, changeOrigin: false } } },
  // The 3D chunk (three.js, about 240 kB gzipped) is loaded only on the Overview and Optimise pages; the rest of the app stays under 100 kB gzipped.
  build: { chunkSizeWarningLimit: 1100 },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], css: false },
})
