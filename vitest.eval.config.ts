import { defineConfig } from 'vitest/config'

// Separate config for the model-driven evals so they never run in `npm test` (which is offline and
// fast). These hit the real LLM gateway — run with the server up and keyed, via `npm run eval`.
// VITE_API_BASE points the app's apiFetch at the local backend when running under Node/tsx.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/evals/**/*.eval.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    env: {
      VITE_API_BASE: process.env.VITE_API_BASE ?? 'http://localhost:8787',
    },
  },
})
