import type { CodingProblem } from '../../data/coding/problems'
import { API_BASE as BASE } from '../api'

// On-demand coding problems the user generates themselves. The curated library
// (src/data/coding/problems.ts) is static and authored by hand; these are LLM-authored additions that
// carry their OWN grading hints, so a generated problem runs the same interview + report pipeline as a
// curated one. Server-durable (Postgres via /api/custom-problems) with a localStorage cache on top for
// instant, synchronous reads and offline fallback — the same pattern as facetDraftStore/profileStore.
// getProblem()/problemCatalog() read the synchronous cache, so call hydrateCustomCodingProblems() on
// mount to refresh it from the server.

const KEY = 'deliveryCoach.coding.customProblems'

// ---- localStorage cache (synchronous source the UI/data layer reads) ----

export function loadCustomCodingProblems(): CodingProblem[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CodingProblem[]) : []
  } catch {
    return []
  }
}

function cache(list: CodingProblem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // localStorage unavailable (private mode) — the server copy remains durable.
  }
}

// ---- backend-backed API (cache + Postgres) ------------------------------

/** Pull every saved problem from the server, merge into the cache, and return the merged list. */
export async function hydrateCustomCodingProblems(): Promise<CodingProblem[]> {
  const local = loadCustomCodingProblems()
  try {
    const res = await fetch(`${BASE}/api/custom-problems?kind=coding`)
    if (!res.ok) return local
    const server = (await res.json()) as CodingProblem[]
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

/** Add (or replace by id) a generated problem, newest first: cache synchronously, upsert to Postgres. */
export function addCustomCodingProblem(problem: CodingProblem): void {
  cache([problem, ...loadCustomCodingProblems().filter((p) => p.id !== problem.id)])
  void fetch(`${BASE}/api/custom-problems/${problem.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'coding', problem }),
  }).catch(() => {})
}

export function deleteCustomCodingProblem(id: string): void {
  cache(loadCustomCodingProblems().filter((p) => p.id !== id))
  void fetch(`${BASE}/api/custom-problems/${id}`, { method: 'DELETE' }).catch(() => {})
}
