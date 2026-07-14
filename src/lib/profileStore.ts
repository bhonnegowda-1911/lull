import { DEFAULT_PROFILE, type Profile } from '../data/stories'
import type { ResumeStyle } from '../types'

// Client for the profile (resume + target level), backed by the server. Like sessionStore, every
// call degrades gracefully: if the backend is unreachable the app falls back to DEFAULT_PROFILE
// (and a localStorage cache) so behavioral practice is never blocked by infra.

import { apiFetch } from './api'
const CACHE_KEY = 'deliveryCoach.profile'

// The server returns snake_case columns; map to/from the camelCase domain type.
interface ProfileRow {
  resume_text: string | null
  roles: Profile['roles'] | null
  target_level: string | null
  /** Present only if the server has been taught to store it; otherwise we fall back to the cache. */
  resume_style?: ResumeStyle | null
}

function fromRow(row: ProfileRow): Profile {
  return {
    resumeText: row.resume_text ?? '',
    roles: Array.isArray(row.roles) ? row.roles : [],
    targetLevel: (row.target_level as Profile['targetLevel']) || 'senior',
    resumeStyle: row.resume_style ?? null,
  }
}

function readCache(): Profile {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Profile) } : DEFAULT_PROFILE
  } catch {
    return DEFAULT_PROFILE
  }
}

function writeCache(profile: Profile): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(profile))
  } catch {
    // localStorage unavailable — fine, the server remains the durable copy.
  }
}

export async function getProfile(): Promise<Profile> {
  try {
    const res = await apiFetch(`/api/profile`)
    if (!res.ok) return readCache()
    const fromServer = fromRow((await res.json()) as ProfileRow)
    // The server persists only text/roles/level; keep the locally-cached upload fields (style + the
    // original resume file: asset id, kind, Word HTML) so the Resume tab can still render the file.
    const cached = readCache()
    const profile: Profile = { ...cached, ...fromServer, resumeStyle: fromServer.resumeStyle ?? cached.resumeStyle ?? null }
    writeCache(profile)
    return profile
  } catch {
    return readCache()
  }
}

/** Upsert the profile. Caches locally regardless so an offline edit isn't lost on reload. */
export async function saveProfile(profile: Profile): Promise<boolean> {
  writeCache(profile)
  try {
    const res = await apiFetch(`/api/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(profile),
    })
    return res.ok
  } catch {
    return false
  }
}
