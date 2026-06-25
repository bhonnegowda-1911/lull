import { STAGES } from '../../data/sysdesign/stages'
import { sanitizeConfig, type InterviewConfig } from '../interview/persona'
import type { Coverage, Turn } from './conversation'
import type { SysDesignReport } from './report'

// On-device persistence for an in-progress system-design interview. The session lives in a
// reducer; localStorage is a fast, offline-capable cache so a refresh resumes instantly, while
// the backend (sessionStore) is the durable store that survives a cleared cache and powers the
// history list. `sanitize` is shared by both paths (localStorage revive and DB hydrate).

export type Phase = 'pick' | 'interview' | 'reporting' | 'report' | 'error'
export type Completion = 'done' | 'skipped'

export interface StageSession {
  transcript: Turn[]
  coverage: Coverage | null
  aligned: boolean
}

/**
 * A persisted Excalidraw scene. We only keep the serializable bits we need to restore the
 * canvas — the element list plus the canvas background. Typed loosely so this module stays
 * decoupled from the (heavy, lazy-loaded) Excalidraw type graph.
 */
export interface WhiteboardScene {
  elements: unknown[]
  appState?: { viewBackgroundColor?: string }
}

/**
 * A voice answer kept for later. The recording itself lives in object storage (assetId,
 * playable via assetUrl); we keep just enough here to replay it and to compute delivery
 * metrics (WPM / filler rate) over what was actually spoken.
 */
export interface VoiceClip {
  /** Stored recording asset id (streamable via assetUrl). */
  assetId: string
  /** Stage the clip was recorded in, for grouping in the report. */
  stageId: string
  /** Spoken length in seconds, or null when unknown. */
  durationSec: number | null
  /** Transcript of this clip. */
  text: string
}

export interface SessionState {
  /** Stable id, generated at START — also the row id in the backend session store. */
  id: string
  createdAt: number
  /** Wall-clock time the report finished — with createdAt gives total time to complete. */
  completedAt?: number
  phase: Phase
  problemId: string | null
  currentIndex: number
  sessions: Record<string, StageSession>
  completed: Record<string, Completion>
  thinking: boolean
  report: SysDesignReport | null
  error: string | null
  /** Asset ids of images/video the candidate attached during the interview. */
  attachments?: string[]
  /** Live Excalidraw whiteboard the candidate draws their design on. */
  whiteboard?: WhiteboardScene | null
  /** Voice answers recorded during the interview, kept to replay and to score delivery. */
  voiceClips?: VoiceClip[]
  /** Target level + interviewer style chosen at the pick screen; drives the interviewer + report. */
  config: InterviewConfig
}

export const SESSION_STORAGE_KEY = 'deliveryCoach.sysdesign.session'

// Bring an arbitrary persisted/loaded state into a resumable shape, or null when there's
// nothing worth restoring. In-flight LLM work (a thinking turn, report generation) can't
// survive a reload/hydrate, so we land back on an interactive state the user can act on.
export function sanitize(input: unknown): SessionState | null {
  if (!input || typeof input !== 'object') return null
  const s = input as Partial<SessionState>
  // A fresh 'pick' (or anything without an active problem) has nothing to resume.
  if (!s.problemId || typeof s.problemId !== 'string') return null
  if (typeof s.currentIndex !== 'number' || s.currentIndex < 0 || s.currentIndex >= STAGES.length) return null
  if (!s.sessions || typeof s.sessions !== 'object') return null

  // Keep a completed report if we have one; otherwise drop back into the live interview.
  const phase: Phase = s.phase === 'report' && s.report ? 'report' : 'interview'

  return {
    id: typeof s.id === 'string' && s.id ? s.id : crypto.randomUUID(),
    createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
    completedAt: typeof s.completedAt === 'number' ? s.completedAt : undefined,
    phase,
    problemId: s.problemId,
    currentIndex: s.currentIndex,
    sessions: s.sessions as Record<string, StageSession>,
    completed: (s.completed as Record<string, Completion>) || {},
    thinking: false,
    report: s.report ?? null,
    error: null,
    attachments: Array.isArray(s.attachments) ? s.attachments : [],
    whiteboard:
      s.whiteboard && Array.isArray(s.whiteboard.elements) ? (s.whiteboard as WhiteboardScene) : null,
    voiceClips: Array.isArray(s.voiceClips)
      ? (s.voiceClips.filter((c) => c && typeof c.assetId === 'string') as VoiceClip[])
      : [],
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
    // The picker has nothing in flight — clear any prior save so a fresh visit starts clean.
    if (state.phase === 'pick') {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    } else {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state))
    }
  } catch {
    // localStorage may be unavailable (private mode) — the session simply won't persist.
  }
}
