import { toFacets, type FacetAnswer, type FacetId, type Project } from '../data/projects'

// Client for the project store, backed by the server. Mirrors storyStore: reads return []/null
// when the backend is unreachable; writes resolve to a boolean. Maps snake_case columns to the
// camelCase domain Project.

const BASE = import.meta.env.VITE_API_BASE ?? ''

interface ProjectRow {
  id: string
  title: string
  role_ref: string | null
  summary: string | null
  // Legacy rows stored a bare string per facet; toFacets normalizes either shape.
  facets: Partial<Record<FacetId, string | FacetAnswer>> | null
  target_level_at_capture: Project['targetLevelAtCapture']
}

function fromRow(r: ProjectRow): Project {
  return {
    id: r.id,
    title: r.title,
    roleRef: r.role_ref,
    summary: r.summary ?? '',
    facets: toFacets(r.facets),
    targetLevelAtCapture: r.target_level_at_capture,
  }
}

export async function listProjects(): Promise<Project[]> {
  try {
    const res = await fetch(`${BASE}/api/projects`)
    if (!res.ok) return []
    return ((await res.json()) as ProjectRow[]).map(fromRow)
  } catch {
    return []
  }
}

export async function getProject(id: string): Promise<Project | null> {
  try {
    const res = await fetch(`${BASE}/api/projects/${id}`)
    if (!res.ok) return null
    return fromRow((await res.json()) as ProjectRow)
  } catch {
    return null
  }
}

export async function saveProject(project: Project): Promise<boolean> {
  const { id, ...body } = project
  try {
    const res = await fetch(`${BASE}/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/projects/${id}`, { method: 'DELETE' })
  } catch {
    // best effort
  }
}
