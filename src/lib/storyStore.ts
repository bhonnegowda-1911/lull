import type { Story } from '../data/stories'

// Client for the story bank, backed by the server. Mirrors sessionStore: read calls return []/null
// when the backend is unreachable and writes resolve to a boolean, so the UI degrades gracefully.

const BASE = import.meta.env.VITE_API_BASE ?? ''

// Server columns are snake_case; map to/from the camelCase domain Story.
interface StoryRow {
  id: string
  title: string
  role_ref: string | null
  star: Story['star']
  impact: Story['impact']
  themes: string[] | null
  true_ceiling_level: Story['trueCeilingLevel']
  source_session_ids: string[] | null
  status: Story['status']
  project_id: string | null
}

function fromRow(r: StoryRow): Story {
  return {
    id: r.id,
    title: r.title,
    roleRef: r.role_ref,
    star: r.star,
    impact: r.impact,
    themes: Array.isArray(r.themes) ? r.themes : [],
    trueCeilingLevel: r.true_ceiling_level,
    sourceSessionIds: Array.isArray(r.source_session_ids) ? r.source_session_ids : [],
    status: r.status,
    projectId: r.project_id ?? null,
  }
}

export async function listStories(filter: { status?: Story['status']; theme?: string } = {}): Promise<Story[]> {
  const qs = new URLSearchParams()
  if (filter.status) qs.set('status', filter.status)
  if (filter.theme) qs.set('theme', filter.theme)
  const suffix = qs.toString() ? `?${qs}` : ''
  try {
    const res = await fetch(`${BASE}/api/stories${suffix}`)
    if (!res.ok) return []
    return ((await res.json()) as StoryRow[]).map(fromRow)
  } catch {
    return []
  }
}

export async function getStory(id: string): Promise<Story | null> {
  try {
    const res = await fetch(`${BASE}/api/stories/${id}`)
    if (!res.ok) return null
    return fromRow((await res.json()) as StoryRow)
  } catch {
    return null
  }
}

/** Upsert a story. The body uses camelCase keys the server maps to columns. */
export async function saveStory(story: Story): Promise<boolean> {
  const { id, ...body } = story
  try {
    const res = await fetch(`${BASE}/api/stories/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteStory(id: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/stories/${id}`, { method: 'DELETE' })
  } catch {
    // best effort
  }
}
