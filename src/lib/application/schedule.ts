import { roundCatalog } from '../../data/rounds'
import type { Application, InterviewRoundInstance, RoundType } from '../../types'

// Pure date + pipeline helpers for application tracking and prep planning. Dates are local
// 'YYYY-MM-DD' strings (interview dates don't need a timezone-correct instant) so the math stays
// simple and testable without Date timezone surprises.

/** Local calendar date as 'YYYY-MM-DD'. */
export function toISODate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Add n days to a 'YYYY-MM-DD' string, returning a 'YYYY-MM-DD' string. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return toISODate(dt)
}

/** Whole calendar days from a → b (b - a). Negative if b is before a. */
export function daysBetween(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split('-').map(Number)
  const [by, bm, bd] = bISO.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** A short human label for how far off a date is: Today / Tomorrow / in N days / N days ago. */
export function relativeDay(iso: string, today = toISODate()): string {
  const n = daysBetween(today, iso)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n > 1) return `in ${n} days`
  if (n === -1) return 'Yesterday'
  return `${-n} days ago`
}

/** A fresh round instance of the given type, labelled from the catalog. */
export function newRound(type: RoundType): InterviewRoundInstance {
  return {
    id: crypto.randomUUID(),
    type,
    label: roundCatalog(type).label,
    topic: '',
    focusAreas: [],
    scheduledAt: null,
    scheduledTime: null,
    outcome: 'pending',
    prepPlan: null,
  }
}

/** The default loop a freshly-tracked application starts with — editable per company. */
const DEFAULT_LOOP: RoundType[] = ['recruiter', 'hiring_manager', 'onsite_loop']

export function emptyApplication(): Application {
  return {
    status: 'not_applied',
    rounds: DEFAULT_LOOP.map(newRound),
    fit: null,
    decisionNote: '',
  }
}

// ---- Interview sessions --------------------------------------------------
// A real onsite bundles several interviews (coding + system design + managerial) that happen together
// and are prepped together. The loop models this by grouping consecutive rounds: a session is a
// maximal run of adjacent rounds where each non-first member has `groupedWithPrev`. Unlock-on-pass is
// per session — all of the active session's rounds prep together, and the next session stays locked
// until the active one is fully passed (a fail blocks advance).

/** A group of one or more consecutive rounds prepped together. `id` is the first round's id. */
export interface RoundSession {
  id: string
  rounds: InterviewRoundInstance[]
}

/** Split the loop into sessions: a new session starts at the first round and at any round that isn't
 *  grouped with the one above it. Preserves order. */
export function sessionsOf(app: Application | null): RoundSession[] {
  if (!app) return []
  const sessions: RoundSession[] = []
  app.rounds.forEach((round, i) => {
    if (i === 0 || !round.groupedWithPrev) sessions.push({ id: round.id, rounds: [round] })
    else sessions[sessions.length - 1].rounds.push(round)
  })
  return sessions
}

const isDecided = (r: InterviewRoundInstance) => r.outcome === 'passed' || r.outcome === 'failed'
function sessionPassed(s: RoundSession): boolean {
  return s.rounds.every((r) => r.outcome === 'passed')
}

/**
 * The session currently being prepped: the first session that isn't fully passed (a session holding a
 * fail isn't fully passed, so it stays current and nothing after it unlocks). Null once every session
 * is passed.
 */
export function activeSession(app: Application | null): RoundSession | null {
  return sessionsOf(app).find((s) => !sessionPassed(s)) ?? null
}

/**
 * The rounds to prep right now: every still-undecided round of the active session, so a bundled onsite
 * unlocks all its interviews at once. Empty when the active session is fully decided (e.g. blocked by a
 * fail) or every session is passed.
 */
export function activeRounds(app: Application | null): InterviewRoundInstance[] {
  return (activeSession(app)?.rounds ?? []).filter((r) => !isDecided(r))
}

/**
 * The single active round — the first undecided round of the active session. Retained for callers that
 * want one representative round (summaries, metrics). Returns null once nothing is left to prep.
 */
export function activeRound(app: Application | null): InterviewRoundInstance | null {
  return activeRounds(app)[0] ?? null
}

/**
 * The next interview to prep for: the soonest round scheduled today-or-later that hasn't already
 * been passed/failed. Returns null when nothing upcoming is scheduled.
 */
export function nextInterview(app: Application | null, today = toISODate()): InterviewRoundInstance | null {
  if (!app) return null
  const upcoming = app.rounds
    .filter(
      (r) =>
        r.scheduledAt &&
        r.outcome !== 'passed' &&
        r.outcome !== 'failed' &&
        daysBetween(today, r.scheduledAt) >= 0,
    )
    .sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : 1))
  return upcoming[0] ?? null
}
