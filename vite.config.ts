import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // The Plugin type can differ between the project's `vite` and the copy bundled with
  // `vitest`; the runtime is identical, so cast to keep the config type-checking.
  plugins: [react(), tailwindcss()] as never,
  // These are only ever loaded via dynamic import (resume PDF/Word export, and PDF/Word upload
  // parsing), so Vite's scanner can miss them at startup and force a full-page reload on first use —
  // which silently aborts the download/parse. Pre-bundle them so the lazy imports resolve without
  // re-optimizing. (docx = Word export; pdfjs-dist + mammoth = upload parsing.)
  optimizeDeps: { include: ['@react-pdf/renderer', 'docx', 'pdfjs-dist', 'mammoth'] },
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
