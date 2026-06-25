import type { Problem } from '../../data/sysdesign/problems'
import { API_BASE as BASE } from '../api'

// On-demand system-design problems the user generates themselves. Mirrors
// src/lib/coding/customProblems.ts: the curated library is static and hand-authored, while these are
// LLM-authored additions carrying their own per-stage grading hints, so a generated problem runs the
// same staged interview + leveling report as a curated one. Server-durable (Postgres via
// /api/custom-problems) with a localStorage cache on top for instant, synchronous reads and offline
// fallback. getProblem()/problemCatalog() read the synchronous cache, so call
// hydrateCustomSysDesignProblems() on mount to refresh it from the server.

const KEY = 'deliveryCoach.sysdesign.customProblems'

// ---- localStorage cache (synchronous source the UI/data layer reads) ----

export function loadCustomSysDesignProblems(): Problem[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Problem[]) : []
  } catch {
    return []
  }
}

function cache(list: Problem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // localStorage unavailable (private mode) — the server copy remains durable.
  }
}

// ---- backend-backed API (cache + Postgres) ------------------------------

/** Pull every saved problem from the server, merge into the cache, and return the merged list. */
export async function hydrateCustomSysDesignProblems(): Promise<Problem[]> {
  const local = loadCustomSysDesignProblems()
  try {
    const res = await fetch(`${BASE}/api/custom-problems?kind=sysdesign`)
    if (!res.ok) return local
    const server = (await res.json()) as Problem[]
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
export function addCustomSysDesignProblem(problem: Problem): void {
  cache([problem, ...loadCustomSysDesignProblems().filter((p) => p.id !== problem.id)])
  void fetch(`${BASE}/api/custom-problems/${problem.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'sysdesign', problem }),
  }).catch(() => {})
}

export function deleteCustomSysDesignProblem(id: string): void {
  cache(loadCustomSysDesignProblems().filter((p) => p.id !== id))
  void fetch(`${BASE}/api/custom-problems/${id}`, { method: 'DELETE' }).catch(() => {})
}
