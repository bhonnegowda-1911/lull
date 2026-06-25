// Single source of truth for the backend origin. In dev, Vite proxies `/api` → the API server, so
// the base is empty and requests are same-origin; set `VITE_API_BASE` to point at a remote API.
// Every store/client imports this instead of re-reading the env var, so the wiring lives in one place.

export const API_BASE = import.meta.env.VITE_API_BASE ?? ''
