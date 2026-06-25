// Derivations over the raw metric event stream — all PURE so they're unit-tested without a browser
// or backend. These answer the three product questions:
//   1. Funnel: are users progressing toward offers? (outcome)
//   2. Calibration: does our fit score actually predict who passes? (credibility)
//   3. Practice validity: does practicing a mode predict passing that real round? (does it help?)
//
// Honesty notes baked into the API: every stat carries its `n`, because at small samples these are
// noise; and `practiceLift` is correlational, not causal (motivated users both practice AND pass) —
// a real causal claim needs a holdout, which the events alone can't give.

import type { MetricEvent, RoundResolvedEvent, SessionCompletedEvent } from './events'
import type { PracticeMode } from '../../data/rounds'

const LEVEL_ORDER = ['junior', 'mid', 'senior', 'staff', 'principal']
function levelOrdinal(level: string | null): number | null {
  const i = level ? LEVEL_ORDER.indexOf(level) : -1
  return i < 0 ? null : i + 1
}

function isRound(e: MetricEvent): e is RoundResolvedEvent {
  return e.type === 'round_resolved'
}
function isSession(e: MetricEvent): e is SessionCompletedEvent {
  return e.type === 'session_completed'
}

/** Pearson correlation (point-biserial when one side is a 0/1 outcome). Null if undefined. */
export function correlation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return null
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  if (dx === 0 || dy === 0) return null // no variance on one side
  return num / Math.sqrt(dx * dy)
}

// ---- 1. Funnel -----------------------------------------------------------

export interface FunnelStage {
  key: string
  label: string
  count: number
  /** Conversion from the previous stage, 0–1; null for the first stage. */
  fromPrev: number | null
}

const ADVANCED_STATUSES = new Set(['applied', 'active', 'offer', 'accepted', 'rejected', 'withdrawn'])
const OFFER_STATUSES = new Set(['offer', 'accepted'])

/** Stage-by-stage pipeline counts across all tracked applications, with step conversions. */
export function funnel(events: MetricEvent[]): FunnelStage[] {
  const tracked = new Set<string>()
  const applied = new Set<string>()
  const interviewing = new Set<string>()
  const passedAny = new Set<string>()
  const offered = new Set<string>()

  for (const e of events) {
    if (e.type === 'app_status') {
      tracked.add(e.jobId)
      if (ADVANCED_STATUSES.has(e.status)) applied.add(e.jobId)
      if (OFFER_STATUSES.has(e.status)) offered.add(e.jobId)
    } else if (isRound(e)) {
      tracked.add(e.jobId)
      applied.add(e.jobId) // a resolved round implies the application advanced
      interviewing.add(e.jobId)
      if (e.outcome === 'passed') passedAny.add(e.jobId)
    }
  }

  const stages: Array<{ key: string; label: string; set: Set<string> }> = [
    { key: 'tracked', label: 'Applications tracked', set: tracked },
    { key: 'applied', label: 'Applied', set: applied },
    { key: 'interviewing', label: 'Reached an interview', set: interviewing },
    { key: 'passed', label: 'Passed ≥1 round', set: passedAny },
    { key: 'offer', label: 'Offer', set: offered },
  ]
  return stages.map((s, i) => ({
    key: s.key,
    label: s.label,
    count: s.set.size,
    fromPrev: i === 0 ? null : stages[i - 1].set.size ? s.set.size / stages[i - 1].set.size : null,
  }))
}

// ---- 2. Round outcomes + fit calibration --------------------------------

export interface OutcomeStat {
  n: number
  passed: number
  passRate: number | null
}

function outcomeStat(rounds: RoundResolvedEvent[]): OutcomeStat {
  const n = rounds.length
  const passed = rounds.filter((r) => r.outcome === 'passed').length
  return { n, passed, passRate: n ? passed / n : null }
}

/** Overall real-round pass rate, plus a breakdown by the practice mode each round maps to. */
export function roundOutcomeStats(events: MetricEvent[]): {
  overall: OutcomeStat
  byMode: Partial<Record<Exclude<PracticeMode, null>, OutcomeStat>>
} {
  const rounds = events.filter(isRound)
  const byMode: Partial<Record<Exclude<PracticeMode, null>, OutcomeStat>> = {}
  for (const mode of ['behavioral', 'coding', 'sysdesign', 'build'] as const) {
    const subset = rounds.filter((r) => r.practiceMode === mode)
    if (subset.length) byMode[mode] = outcomeStat(subset)
  }
  return { overall: outcomeStat(rounds), byMode }
}

export interface CalibrationBucket {
  label: string
  /** Inclusive lower / exclusive upper bound of predicted fit score. */
  lo: number
  hi: number
  n: number
  /** Actual pass rate of rounds whose fit fell in this bucket — compare to the bucket's midpoint. */
  passRate: number | null
  /** Mean predicted fit in the bucket, so a reliability plot can use predicted vs actual. */
  meanPredicted: number | null
}

/**
 * Reliability table: bucket rounds by predicted fit score and report the ACTUAL pass rate per
 * bucket. A well-calibrated model has passRate ≈ bucket midpoint (e.g. an "80" passes ~80%).
 * Also returns the point-biserial correlation between fit score and pass/fail.
 */
export function fitCalibration(
  events: MetricEvent[],
  bucketSize = 20,
): { buckets: CalibrationBucket[]; correlation: number | null; n: number } {
  const scored = events.filter(isRound).filter((r) => r.fitScore != null)
  const buckets: CalibrationBucket[] = []
  for (let lo = 0; lo < 100; lo += bucketSize) {
    const hi = Math.min(100, lo + bucketSize)
    const inBucket = scored.filter((r) => r.fitScore! >= lo && (hi === 100 ? r.fitScore! <= hi : r.fitScore! < hi))
    buckets.push({
      label: `${lo}–${hi}`,
      lo,
      hi,
      n: inBucket.length,
      passRate: inBucket.length ? inBucket.filter((r) => r.outcome === 'passed').length / inBucket.length : null,
      meanPredicted: inBucket.length ? inBucket.reduce((a, r) => a + r.fitScore!, 0) / inBucket.length : null,
    })
  }
  const corr = correlation(
    scored.map((r) => r.fitScore!),
    scored.map((r) => (r.outcome === 'passed' ? 1 : 0)),
  )
  return { buckets, correlation: corr, n: scored.length }
}

// ---- 3. Practice validity (does practicing help?) -----------------------

export interface PracticeLift {
  mode: Exclude<PracticeMode, null>
  withPractice: OutcomeStat
  withoutPractice: OutcomeStat
  /** passRate(practiced) − passRate(not) — positive = practicing this mode tracked with passing. */
  lift: number | null
  /** Correlation between the pre-round practice LEVEL and pass/fail (null if too few leveled reps). */
  levelCorrelation: number | null
}

/**
 * For each mode, split resolved rounds by whether the user had completed a practice session of the
 * matching kind BEFORE that round, and compare pass rates. Correlational only — see file header.
 */
export function practiceLift(events: MetricEvent[]): PracticeLift[] {
  const sessions = events.filter(isSession)
  const out: PracticeLift[] = []

  for (const mode of ['behavioral', 'coding', 'sysdesign', 'build'] as const) {
    const rounds = events.filter(isRound).filter((r) => r.practiceMode === mode)
    if (!rounds.length) continue

    const priorSessions = sessions.filter((s) => s.kind === mode)
    const withP: RoundResolvedEvent[] = []
    const withoutP: RoundResolvedEvent[] = []
    const levelPairs: Array<[number, number]> = [] // [levelOrdinal, passed?1:0]

    for (const r of rounds) {
      const cutoff = r.roundDate ?? r.ts
      const before = priorSessions.filter((s) => s.ts <= cutoff)
      if (before.length) {
        withP.push(r)
        // Use the most recent leveled session before the round for the level→outcome correlation.
        const leveled = before.filter((s) => levelOrdinal(s.level) != null)
        const latest = leveled[leveled.length - 1]
        const ord = latest ? levelOrdinal(latest.level) : null
        if (ord != null) levelPairs.push([ord, r.outcome === 'passed' ? 1 : 0])
      } else {
        withoutP.push(r)
      }
    }

    out.push({
      mode,
      withPractice: outcomeStat(withP),
      withoutPractice: outcomeStat(withoutP),
      lift:
        withP.length && withoutP.length
          ? (withP.filter((r) => r.outcome === 'passed').length / withP.length) -
            (withoutP.filter((r) => r.outcome === 'passed').length / withoutP.length)
          : null,
      levelCorrelation: correlation(
        levelPairs.map((p) => p[0]),
        levelPairs.map((p) => p[1]),
      ),
    })
  }
  return out
}
