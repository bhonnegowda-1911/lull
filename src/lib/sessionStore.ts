// Client for the generic, kind-agnostic session store (backed by Postgres via the server).
// A "session" is any activity/analysis — a behavioral take, a system-design interview, and
// later JD-fit / resume-tune / skill-gap runs. Each feature maps its own state to a
// SessionRecord (kind + jsonb payload); the backend never needs to know the feature.
//
// Every call degrades gracefully: if the backend is unreachable the app keeps working from
// its in-memory / localStorage state, it just won't have durable history.

import { API_BASE as BASE } from './api'

export type SessionKind = 'behavioral' | 'sysdesign' | 'build' | (string & {})
export type SessionStatus = 'in_progress' | 'completed'

/** A history-list row — everything except the (potentially large) payload. */
export interface SessionSummary {
  id: string
  kind: SessionKind
  status: SessionStatus
  title: string | null
  level: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface SessionRecord<T = unknown> extends SessionSummary {
  payload: T
}

export interface SaveSessionInput<T = unknown> {
  id: string
  kind: SessionKind
  status: SessionStatus
  title?: string | null
  level?: string | null
  payload: T
}

export interface SessionFilter {
  kind?: SessionKind
  status?: SessionStatus
}

export async function listSessions(filter: SessionFilter = {}): Promise<SessionSummary[]> {
  const qs = new URLSearchParams()
  if (filter.kind) qs.set('kind', filter.kind)
  if (filter.status) qs.set('status', filter.status)
  const suffix = qs.toString() ? `?${qs}` : ''
  try {
    const res = await fetch(`${BASE}/api/sessions${suffix}`)
    if (!res.ok) return []
    return (await res.json()) as SessionSummary[]
  } catch {
    return []
  }
}

export async function getSession<T = unknown>(id: string): Promise<SessionRecord<T> | null> {
  try {
    const res = await fetch(`${BASE}/api/sessions/${id}`)
    if (!res.ok) return null
    return (await res.json()) as SessionRecord<T>
  } catch {
    return null
  }
}

/** Upsert a session. Resolves even on failure (the local copy remains the source of truth). */
export async function saveSession<T = unknown>(input: SaveSessionInput<T>): Promise<boolean> {
  const { id, ...body } = input
  try {
    const res = await fetch(`${BASE}/api/sessions/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/sessions/${id}`, { method: 'DELETE' })
  } catch {
    // best effort
  }
}
