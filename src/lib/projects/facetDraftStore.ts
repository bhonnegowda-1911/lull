import type { FacetAnswer, FacetId } from '../../data/projects'
import type { FacetBeats, FacetMessage } from './facetChat'

// In-progress facet conversations are durable working state, not curated ground truth. They persist
// to Postgres (via /api/facet-drafts) so a half-built STAR answer survives across devices, with a
// localStorage cache on top for instant reads and offline fallback — the same server-durable +
// local-cache pattern as profileStore. The accepted answer ultimately lands in projects.facets and
// the draft is then deleted from both. Writes are fire-and-forget to the backend; the cache is the
// synchronous source the UI reads, and hydrateProjectDrafts refreshes it from the server on open.

import { API_BASE as BASE } from '../api'
const PREFIX = 'deliveryCoach.facetDraft'

export interface FacetDraft {
  messages: FacetMessage[]
  beats: FacetBeats | null
  draft: FacetAnswer | null
}

function key(projectId: string, facetId: FacetId): string {
  return `${PREFIX}.${projectId}.${facetId}`
}

// ---- localStorage cache (synchronous) -----------------------------------

export function loadFacetDraft(projectId: string, facetId: FacetId): FacetDraft | null {
  try {
    const raw = localStorage.getItem(key(projectId, facetId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as FacetDraft
    return parsed.messages?.length ? parsed : null
  } catch {
    return null
  }
}

function cacheDraft(projectId: string, facetId: FacetId, draft: FacetDraft): void {
  try {
    localStorage.setItem(key(projectId, facetId), JSON.stringify(draft))
  } catch {
    // localStorage unavailable — the server copy remains durable.
  }
}

function removeCached(projectId: string, facetId: FacetId): void {
  try {
    localStorage.removeItem(key(projectId, facetId))
  } catch {
    // ignore
  }
}

function removeCachedProject(projectId: string): void {
  try {
    const prefix = `${PREFIX}.${projectId}.`
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) doomed.push(k)
    }
    for (const k of doomed) localStorage.removeItem(k)
  } catch {
    // ignore
  }
}

// ---- backend-backed API (cache + Postgres) ------------------------------

/** Pull every saved draft for a project from the server into the local cache. Call before reading. */
export async function hydrateProjectDrafts(projectId: string): Promise<void> {
  try {
    const res = await fetch(`${BASE}/api/facet-drafts/${projectId}`)
    if (!res.ok) return
    const rows = (await res.json()) as Array<{ facet_id: FacetId; payload: FacetDraft }>
    for (const r of rows) {
      if (r.payload?.messages?.length) cacheDraft(projectId, r.facet_id, r.payload)
    }
  } catch {
    // offline — keep whatever the cache already holds.
  }
}

/** Save the in-progress draft: cache synchronously, then upsert to Postgres (best effort). */
export function saveFacetDraft(projectId: string, facetId: FacetId, draft: FacetDraft): void {
  cacheDraft(projectId, facetId, draft)
  void fetch(`${BASE}/api/facet-drafts/${projectId}/${facetId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(draft),
  }).catch(() => {})
}

/** Drop one draft (on Accept or Discard) from both cache and Postgres. */
export function clearFacetDraft(projectId: string, facetId: FacetId): void {
  removeCached(projectId, facetId)
  void fetch(`${BASE}/api/facet-drafts/${projectId}/${facetId}`, { method: 'DELETE' }).catch(() => {})
}

/** Drop every draft for a project — call when the project is deleted. */
export function clearProjectDrafts(projectId: string): void {
  removeCachedProject(projectId)
  void fetch(`${BASE}/api/facet-drafts/${projectId}`, { method: 'DELETE' }).catch(() => {})
}
