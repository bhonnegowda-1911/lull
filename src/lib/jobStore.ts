import { roundCatalog } from '../data/rounds'
import type {
  Application,
  InterviewRoundInstance,
  JobDescription,
  ParsedJob,
  PrepPlan,
  ProblemPick,
  CodingPick,
  BehavioralPick,
  RecruiterPick,
  RoundType,
} from '../types'

// Client for the job-description store, backed by the server. Mirrors projectStore: reads return
// []/null when the backend is unreachable; writes resolve to a boolean. Maps snake_case columns to
// the camelCase domain type.

import { API_BASE as BASE } from './api'

interface JobRow {
  id: string
  title: string
  company: string | null
  raw_text: string | null
  parsed: ParsedJob | Record<string, never> | null
  problem_picks: ProblemPick[] | null
  coding_picks: CodingPick[] | null
  behavioral_picks: BehavioralPick[] | null
  recruiter_picks: RecruiterPick[] | null
  application: Application | LegacyApplication | null
  /** Legacy job-level prep plan column; migrated into a round instance, no longer written. */
  prep_plan: PrepPlan | null
}

// ---- Legacy application migration ----------------------------------------
// The original model had a fixed 4-round `stages` array and one job-level prep plan. Upgrade any
// such blob to the configurable `rounds` model so saved jobs keep working without a DB migration.
type LegacyRound = 'recruiter' | 'behavioral' | 'system_design' | 'onsite'
interface LegacyStage {
  round: LegacyRound
  label: string
  scheduledAt: string | null
  outcome: InterviewRoundInstance['outcome']
}
interface LegacyApplication {
  status: Application['status']
  stages: LegacyStage[]
  decisionNote: string
}

const LEGACY_TYPE: Record<LegacyRound, RoundType> = {
  recruiter: 'recruiter',
  behavioral: 'behavioral',
  system_design: 'system_design',
  onsite: 'onsite_loop',
}

function isLegacy(app: Application | LegacyApplication): app is LegacyApplication {
  return Array.isArray((app as LegacyApplication).stages)
}

function normalizeApplication(
  app: Application | LegacyApplication | null,
  legacyPrepPlan: PrepPlan | null,
): Application | null {
  if (!app) return null
  if (!isLegacy(app)) return { ...app, fit: app.fit ?? null }
  const rounds: InterviewRoundInstance[] = app.stages.map((s) => {
    const type = LEGACY_TYPE[s.round] ?? 'custom'
    // Re-attach the old single job-level prep plan to the round it was built for.
    const prepPlan = legacyPrepPlan && legacyPrepPlan.targetRound === type ? legacyPrepPlan : null
    return {
      id: crypto.randomUUID(),
      type,
      label: s.label || roundCatalog(type).label,
      topic: '',
      focusAreas: [],
      scheduledAt: s.scheduledAt,
      scheduledTime: null,
      outcome: s.outcome,
      prepPlan,
    }
  })
  return { status: app.status, rounds, fit: null, decisionNote: app.decisionNote }
}

function fromRow(r: JobRow): JobDescription {
  const parsed = r.parsed && Object.keys(r.parsed).length > 0 ? (r.parsed as ParsedJob) : null
  return {
    id: r.id,
    title: r.title,
    company: r.company ?? '',
    rawText: r.raw_text ?? '',
    parsed,
    problemPicks: r.problem_picks ?? [],
    codingPicks: r.coding_picks ?? [],
    behavioralPicks: r.behavioral_picks ?? [],
    recruiterPicks: r.recruiter_picks ?? [],
    application: normalizeApplication(r.application, r.prep_plan ?? null),
  }
}

export function emptyJob(id: string): JobDescription {
  return {
    id,
    title: '',
    company: '',
    rawText: '',
    parsed: null,
    problemPicks: [],
    codingPicks: [],
    behavioralPicks: [],
    recruiterPicks: [],
    application: null,
  }
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
