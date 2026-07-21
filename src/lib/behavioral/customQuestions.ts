import type { Prompt } from '../../data/prompts'
import { apiFetch } from '../api'

// On-demand behavioral questions the user authors themselves. The curated bank (src/data/prompts.ts)
// is static and hand-written; these are LLM-authored additions carrying the same Prompt shape, so a
// generated question runs the identical follow-up + STAR grading pipeline as a curated one. Server-
// durable (Postgres via /api/custom-problems, kind: 'behavioral') with a localStorage cache on top for
// instant, synchronous reads and offline fallback — the exact pattern used by coding/customProblems.
// The UI reads the synchronous cache, so call hydrateCustomPrompts() on mount to refresh from the server.

const KEY = 'deliveryCoach.behavioral.customQuestions'

// ---- localStorage cache (synchronous source the UI reads) ----

export function loadCustomPrompts(): Prompt[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Prompt[]) : []
  } catch {
    return []
  }
}

function cache(list: Prompt[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // localStorage unavailable (private mode) — the server copy remains durable.
  }
}

// ---- backend-backed API (cache + Postgres) ------------------------------

/** Pull every saved question from the server, merge into the cache, and return the merged list. */
export async function hydrateCustomPrompts(): Promise<Prompt[]> {
  const local = loadCustomPrompts()
  try {
    const res = await apiFetch(`/api/custom-problems?kind=behavioral`)
    if (!res.ok) return local
    const server = (await res.json()) as Prompt[]
    if (!Array.isArray(server)) return local
    // Server (durable, newest-first) wins on id; keep local-only items not yet synced.
    const ids = new Set(server.map((p) => p.id))
    const merged = [...server, ...local.filter((p) => !ids.has(p.id))]
    cache(merged)
    return merged
  } catch {
    return local
  }
}

/** Add (or replace by id) a generated question, newest first: cache synchronously, upsert to Postgres. */
export function addCustomPrompt(prompt: Prompt): void {
  cache([prompt, ...loadCustomPrompts().filter((p) => p.id !== prompt.id)])
  void apiFetch(`/api/custom-problems/${prompt.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'behavioral', problem: prompt }),
  }).catch(() => {})
}

export function deleteCustomPrompt(id: string): void {
  cache(loadCustomPrompts().filter((p) => p.id !== id))
  void apiFetch(`/api/custom-problems/${id}`, { method: 'DELETE' }).catch(() => {})
}
