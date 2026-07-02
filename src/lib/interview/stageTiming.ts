// Per-stage wall-clock timing for a practice interview, shared across the coding, system-design, and
// build modes (their StageSession shapes all match StageClock structurally). A stage's clock starts
// when it becomes current (`enterStage`) and is banked into `elapsedMs` when the candidate leaves it
// (`leaveStage`). The final report compares the banked time against the stage's `minutes` budget so a
// candidate can see "expected vs. took" per step.

export interface StageClock {
  /** Wall-clock ms when the live clock started; absent ⇒ the clock is not running. */
  enteredAt?: number
  /** Time already banked for this stage across prior live segments. */
  elapsedMs?: number
}

const now = () => Date.now()

/** Start (or restart, on resume) the live clock for a stage as it becomes current. */
export function enterStage<T extends StageClock>(s: T): T {
  return { ...s, enteredAt: now() }
}

/** Bank the running segment into `elapsedMs` and stop the clock. Idempotent if not running. */
export function leaveStage<T extends StageClock>(s: T): T {
  if (s.enteredAt == null) return s
  const elapsedMs = (s.elapsedMs ?? 0) + Math.max(0, now() - s.enteredAt)
  const next = { ...s, elapsedMs }
  delete next.enteredAt
  return next
}

/** Total time for a stage: banked plus the live segment if the clock is still running. */
export function stageElapsedMs(s: StageClock | undefined, at: number = now()): number {
  if (!s) return 0
  const live = s.enteredAt != null ? Math.max(0, at - s.enteredAt) : 0
  return (s.elapsedMs ?? 0) + live
}

// On resume/reload, the away-time shouldn't count: restart the current stage's clock (keeping its
// banked `elapsedMs`) and defensively stop any other stage's clock (their time was banked on ADVANCE).
// A completed session (its report already exists) is left untouched so History shows the real times.
export function resumeClocks<T extends StageClock>(
  sessions: Record<string, T>,
  currentStageId: string | undefined,
  inProgress: boolean,
): Record<string, T> {
  if (!inProgress) return sessions
  const out: Record<string, T> = {}
  for (const [id, s] of Object.entries(sessions)) {
    if (id === currentStageId) {
      out[id] = enterStage(s)
    } else {
      // Already banked on ADVANCE; clear any leftover clock WITHOUT banking the stale away-gap.
      const stopped = { ...s }
      delete stopped.enteredAt
      out[id] = stopped
    }
  }
  return out
}

/** Compact human duration: "48s", "4m 12s", "1m". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}m`
  return `${m}m ${s}s`
}

export type PaceStatus = 'under' | 'on' | 'over' | 'way-over'

export interface Pace {
  status: PaceStatus
  /** actual / expected, or null when there's no expected budget. */
  ratio: number | null
}

/** Bucket actual vs. the stage's expected-minute budget for a colored pace chip. */
export function pace(actualMs: number, expectedMin: number | undefined): Pace {
  if (!expectedMin || expectedMin <= 0) return { status: 'on', ratio: null }
  const ratio = actualMs / (expectedMin * 60_000)
  const status: PaceStatus = ratio <= 1 ? 'under' : ratio <= 1.25 ? 'on' : ratio <= 2 ? 'over' : 'way-over'
  return { status, ratio }
}
