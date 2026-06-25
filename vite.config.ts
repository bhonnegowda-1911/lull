import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // The Plugin type can differ between the project's `vite` and the copy bundled with
  // `vitest`; the runtime is identical, so cast to keep the config type-checking.
  plugins: [react(), tailwindcss()] as never,
  // @react-pdf/renderer is only ever loaded via a dynamic import (the resume PDF download), so
  // Vite's scanner can miss it at startup and force a full-page reload on the first click. Pre-bundle
  // it explicitly so the lazy import resolves without re-optimizing.
  optimizeDeps: { include: ['@react-pdf/renderer'] },
  // Proxy API calls to the backend so the browser talks to the same origin in dev.
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.{ts,tsx}'],
  },
})
