import type { JobDescription, ParsedJob } from '../types'

// Client for the job-description store, backed by the server. Mirrors projectStore: reads return
// []/null when the backend is unreachable; writes resolve to a boolean. Maps snake_case columns to
// the camelCase domain type.

const BASE = import.meta.env.VITE_API_BASE ?? ''

interface JobRow {
  id: string
  title: string
  company: string | null
  raw_text: string | null
  parsed: ParsedJob | Record<string, never> | null
}

function fromRow(r: JobRow): JobDescription {
  const parsed = r.parsed && Object.keys(r.parsed).length > 0 ? (r.parsed as ParsedJob) : null
  return {
    id: r.id,
    title: r.title,
    company: r.company ?? '',
    rawText: r.raw_text ?? '',
    parsed,
  }
}

export function emptyJob(id: string): JobDescription {
  return { id, title: '', company: '', rawText: '', parsed: null }
}

export async function listJobs(): Promise<JobDescription[]> {
  try {
    const res = await fetch(`${BASE}/api/jobs`)
    if (!res.ok) return []
    return ((await res.json()) as JobRow[]).map(fromRow)
  } catch {
    return []
  }
}

export async function getJob(id: string): Promise<JobDescription | null> {
  try {
    const res = await fetch(`${BASE}/api/jobs/${id}`)
    if (!res.ok) return null
    return fromRow((await res.json()) as JobRow)
  } catch {
    return null
  }
}

export async function saveJob(job: JobDescription): Promise<boolean> {
  const { id, ...body } = job
  try {
    const res = await fetch(`${BASE}/api/jobs/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteJob(id: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/jobs/${id}`, { method: 'DELETE' })
  } catch {
    // best effort
  }
}
