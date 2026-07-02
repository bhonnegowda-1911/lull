import { STAGES } from '../../data/coding/stages'
import type { CodeLanguage } from '../../data/coding/stages'
import { resumeClocks } from '../interview/stageTiming'
import { sanitizeConfig, type InterviewConfig } from '../interview/persona'
import type { Coverage, Turn } from './conversation'
import type { CodingReport } from './report'

// On-device persistence for an in-progress coding interview. Mirrors the system-design persistence
// (src/lib/sysdesign/persistence.ts): the session lives in a reducer; localStorage is a fast cache
// for instant resume, while the backend session store is the durable copy. Adds `language` and
// `code` so the editor restores exactly where the candidate left off.

export type Phase = 'pick' | 'interview' | 'reporting' | 'report' | 'error'
export type Completion = 'done' | 'skipped'

export interface StageSession {
  transcript: Turn[]
  coverage: Coverage | null
  aligned: boolean
  /** Wall-clock ms when this stage's live timer started; absent ⇒ not running. */
  enteredAt?: number
  /** Time banked on this stage so far — drives the report's expected-vs-took read. */
  elapsedMs?: number
}

export interface SessionState {
  /** Stable id, generated at START — also the row id in the backend session store. */
  id: string
  createdAt: number
  phase: Phase
  problemId: string | null
  currentIndex: number
  sessions: Record<string, StageSession>
  completed: Record<string, Completion>
  thinking: boolean
  report: CodingReport | null
  error: string | null
  /** The candidate's current code buffer + language (the IMPLEMENT stage editor restores from these). */
  language: CodeLanguage
  code: string
  /** Target level + interviewer style chosen at the pick screen; drives the interviewer + report. */
  config: InterviewConfig
}

export const SESSION_STORAGE_KEY = 'deliveryCoach.coding.session'

const LANGS: CodeLanguage[] = ['javascript', 'python', 'java', 'cpp']

// Bring an arbitrary persisted/loaded state into a resumable shape, or null when there's nothing
// worth restoring. In-flight LLM work can't survive a reload, so we land on an interactive state.
export function sanitize(input: unknown): SessionState | null {
  if (!input || typeof input !== 'object') return null
  const s = input as Partial<SessionState>
  if (!s.problemId || typeof s.problemId !== 'string') return null
  if (typeof s.currentIndex !== 'number' || s.currentIndex < 0 || s.currentIndex >= STAGES.length) return null
  if (!s.sessions || typeof s.sessions !== 'object') return null

  const phase: Phase = s.phase === 'report' && s.report ? 'report' : 'interview'
  const sessions = resumeClocks(
    s.sessions as Record<string, StageSession>,
    STAGES[s.currentIndex]?.id,
    phase === 'interview',
  )

  return {
    id: typeof s.id === 'string' && s.id ? s.id : crypto.randomUUID(),
    createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
    phase,
    problemId: s.problemId,
    currentIndex: s.currentIndex,
    sessions,
    completed: (s.completed as Record<string, Completion>) || {},
    thinking: false,
    report: s.report ?? null,
    error: null,
    language: s.language && LANGS.includes(s.language) ? s.language : 'python',
    code: typeof s.code === 'string' ? s.code : '',
    config: sanitizeConfig(s.config),
  }
}

/** Parse a localStorage blob and sanitize it for resume. */
export function reviveSession(raw: string | null): SessionState | null {
  if (!raw) return null
  try {
    return sanitize(JSON.parse(raw))
  } catch {
    return null
  }
}

export function loadSession(): SessionState | null {
  try {
    return reviveSession(localStorage.getItem(SESSION_STORAGE_KEY))
  } catch {
    return null
  }
}

export function persistSession(state: SessionState): void {
  try {
    if (state.phase === 'pick') {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    } else {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state))
    }
  } catch {
    // localStorage may be unavailable (private mode) — the session simply won't persist.
  }
}
