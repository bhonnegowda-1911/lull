import type { GlobalPrepPlan } from '../types'
import { API_BASE as BASE } from './api'

// Client for the single, cross-application prep plan (one server row). Mirrors profileStore: reads
// return null when the backend is unreachable or nothing has been generated yet; writes resolve to a
// boolean.

export async function getPrepPlan(): Promise<GlobalPrepPlan | null> {
  try {
    const res = await fetch(`${BASE}/api/prep-plan`)
    if (!res.ok) return null
    return ((await res.json()) as { plan: GlobalPrepPlan | null }).plan
  } catch {
    return null
  }
}

export async function savePrepPlan(plan: GlobalPrepPlan): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/prep-plan`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(plan),
    })
    return res.ok
  } catch {
    return false
  }
}
