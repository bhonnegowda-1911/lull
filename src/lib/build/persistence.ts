import { BUILD_STAGES } from '../../data/build/stages'
import { resumeClocks } from '../interview/stageTiming'
import type { Coverage, Turn } from './conversation'
import type { SysDesignReport } from '../sysdesign/report'

// On-device persistence for an in-progress Build session. Same pattern as the system-design
// persistence: localStorage is the fast, offline-capable cache for instant resume; the backend
// session store is the durable copy that powers history. `sanitize` is shared by both the
// localStorage revive and the DB hydrate paths. The Build mode is planning-only (the candidate
// implements offline), so the persisted state is just the prioritization conversation.

export type BuildPhase = 'pick' | 'session' | 'reporting' | 'report' | 'error'

export interface BuildStageSession {
  transcript: Turn[]
  coverage: Coverage | null
  aligned: boolean
  /** Wall-clock ms when this stage's live timer started; absent ⇒ not running. */
  enteredAt?: number
  /** Time banked on this stage so far — drives the report's expected-vs-took read. */
  elapsedMs?: number
}

export interface BuildSessionState {
  /** Stable id, generated at START — also the row id in the backend session store. */
  id: string
  createdAt: number
  phase: BuildPhase
  problemId: string | null
  currentIndex: number
  sessions: Record<string, BuildStageSession>
  completed: Record<string, true>
  thinking: boolean
  report: SysDesignReport | null
  error: string | null
}

export const BUILD_STORAGE_KEY = 'deliveryCoach.build.session'

export function sanitize(input: unknown): BuildSessionState | null {
  if (!input || typeof input !== 'object') return null
  const s = input as Partial<BuildSessionState>
  if (!s.problemId || typeof s.problemId !== 'string') return null
  if (typeof s.currentIndex !== 'number' || s.currentIndex < 0 || s.currentIndex >= BUILD_STAGES.length) return null
  if (!s.sessions || typeof s.sessions !== 'object') return null

  // Keep a completed report if present; otherwise drop back into the live session.
  const phase: BuildPhase = s.phase === 'report' && s.report ? 'report' : 'session'
  const sessions = resumeClocks(
    s.sessions as Record<string, BuildStageSession>,
    BUILD_STAGES[s.currentIndex]?.id,
    phase === 'session',
  )

  return {
    id: typeof s.id === 'string' && s.id ? s.id : crypto.randomUUID(),
    createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
    phase,
    problemId: s.problemId,
    currentIndex: s.currentIndex,
    sessions,
    completed: (s.completed as Record<string, true>) || {},
    thinking: false,
    report: s.report ?? null,
    error: null,
  }
}

export function reviveSession(raw: string | null): BuildSessionState | null {
  if (!raw) return null
  try {
    return sanitize(JSON.parse(raw))
  } catch {
    return null
  }
}

export function loadSession(): BuildSessionState | null {
  try {
    return reviveSession(localStorage.getItem(BUILD_STORAGE_KEY))
  } catch {
    return null
  }
}

export function persistSession(state: BuildSessionState): void {
  try {
    if (state.phase === 'pick') {
      localStorage.removeItem(BUILD_STORAGE_KEY)
    } else {
      localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(state))
    }
  } catch {
    // localStorage may be unavailable (private mode) — the session simply won't persist.
  }
}
