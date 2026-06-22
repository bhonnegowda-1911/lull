// Progress = the north-star feature: "am I improving over reps?" We turn the durable session
// history into comparable numeric series per mode. Levels (junior→principal) map to an ordinal
// so they can be plotted; behavioral sessions also carry fine-grained delivery metrics
// (filler/min, STAR scores) pulled from their payload.
//
// The pure helpers (ordinal mapping, series building, trend direction) are split from the
// async loader so they can be unit-tested without a backend.

import { listSessions, getSession, type SessionKind, type SessionSummary } from '../../lib/sessionStore'
import type { BehavioralPayload } from '../../components/BehavioralView'

// Unified ladder across modes. Sysdesign/build top out at 'staff'; behavioral adds 'principal'.
export const LEVEL_ORDER = ['junior', 'mid', 'senior', 'staff', 'principal'] as const
export type LevelName = (typeof LEVEL_ORDER)[number]
export const MAX_LEVEL = LEVEL_ORDER.length

/** 1-based ordinal for a level string, or null if unknown/missing. */
export function levelOrdinal(level: string | null | undefined): number | null {
  if (!level) return null
  const i = LEVEL_ORDER.indexOf(level.toLowerCase() as LevelName)
  return i >= 0 ? i + 1 : null
}

/** Nearest level name for an ordinal value (used to label chart ticks). */
export function ordinalLabel(n: number): string {
  return LEVEL_ORDER[Math.round(n) - 1] ?? '—'
}

export function mean(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export interface Point {
  /** epoch ms, for ordering / axis */
  t: number
  value: number
}

export type Direction = 'up' | 'down' | 'flat'

/**
 * First-to-last movement of a series. `lowerIsBetter` flips the sense so that, e.g., a falling
 * filler rate reads as improvement. Returns 'flat' for <2 points or no change.
 */
export function trendDirection(points: Point[], lowerIsBetter = false): Direction {
  if (points.length < 2) return 'flat'
  const delta = points[points.length - 1].value - points[0].value
  if (delta === 0) return 'flat'
  const improving = lowerIsBetter ? delta < 0 : delta > 0
  return improving ? 'up' : 'down'
}

/** Timestamp a summary should be plotted at: completion time, falling back to creation. */
function summaryTime(s: SessionSummary): number {
  return Date.parse(s.completed_at ?? s.created_at)
}

/** Ordinal level series for a set of summaries, oldest→newest, skipping ungraded rows. */
export function buildLevelSeries(summaries: SessionSummary[]): Point[] {
  return summaries
    .map((s) => ({ t: summaryTime(s), level: levelOrdinal(s.level) }))
    .filter((p): p is { t: number; level: number } => p.level != null && !Number.isNaN(p.t))
    .sort((a, b) => a.t - b.t)
    .map((p) => ({ t: p.t, value: p.level }))
}

export interface ModeTrend {
  kind: SessionKind
  count: number
  level: Point[]
  /** 0–100 performance score per session, oldest→newest — drives XP & rank (see game.ts). */
  score: Point[]
  /** behavioral only */
  fillerPerMin?: Point[]
  /** behavioral only: mean of present STAR scores (clarity/structure/impact) */
  starAvg?: Point[]
}

const MODES: SessionKind[] = ['behavioral', 'sysdesign', 'build']

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// Each mode's top of ladder, for normalizing a level→score (sysdesign/build cap at staff).
const MODE_MAX_LEVEL: Record<string, number> = { behavioral: MAX_LEVEL, sysdesign: 4, build: 4 }

/** Map a level ordinal to 0–100 within a mode's ladder (junior→0, top→100). */
export function scoreFromLevel(ord: number, maxOrd: number): number {
  if (maxOrd <= 1) return 100
  return clamp(((ord - 1) / (maxOrd - 1)) * 100, 0, 100)
}

/**
 * Behavioral per-session score: STAR quality (1–5 → 0–100) weighted with a filler-rate
 * penalty (0/min → full, ≥15/min → 0). Uses whichever signals are present; null if neither.
 */
export function behavioralScore(starAvg: number | null, perMinute: number | null): number | null {
  const star = starAvg != null ? ((starAvg - 1) / 4) * 100 : null
  const filler = perMinute != null ? clamp(1 - perMinute / 15, 0, 1) * 100 : null
  if (star == null && filler == null) return null
  if (star == null) return filler as number
  if (filler == null) return star
  return 0.7 * star + 0.3 * filler
}

/**
 * Load completed sessions and shape them into per-mode trends. Behavioral payloads are fetched
 * individually for their delivery metrics; everything degrades to [] if the backend is offline.
 */
export async function loadProgress(): Promise<ModeTrend[]> {
  const all = await listSessions({ status: 'completed' })
  const byKind = new Map<SessionKind, SessionSummary[]>()
  for (const s of all) {
    const list = byKind.get(s.kind) ?? []
    list.push(s)
    byKind.set(s.kind, list)
  }

  const trends: ModeTrend[] = []
  for (const kind of MODES) {
    const rows = byKind.get(kind) ?? []
    if (rows.length === 0) continue
    const level = buildLevelSeries(rows)
    const trend: ModeTrend = { kind, count: rows.length, level, score: [] }
    if (kind === 'behavioral') {
      const m = await behavioralMetrics(rows)
      trend.fillerPerMin = m.fillerPerMin
      trend.starAvg = m.starAvg
      trend.score = m.score
    } else {
      const maxOrd = MODE_MAX_LEVEL[kind] ?? MAX_LEVEL
      trend.score = level.map((p) => ({ t: p.t, value: scoreFromLevel(p.value, maxOrd) }))
    }
    trends.push(trend)
  }
  return trends
}

/** Pull filler/min and average STAR score per behavioral session, oldest→newest. */
async function behavioralMetrics(
  rows: SessionSummary[],
): Promise<{ fillerPerMin: Point[]; starAvg: Point[]; score: Point[] }> {
  const records = await Promise.all(rows.map((r) => getSession<BehavioralPayload>(r.id)))
  const fillerPerMin: Point[] = []
  const starAvg: Point[] = []
  const score: Point[] = []
  for (const rec of records) {
    if (!rec?.payload?.session) continue
    const t = Date.parse(rec.completed_at ?? rec.created_at)
    if (Number.isNaN(t)) continue
    const { filler, feedback } = rec.payload.session
    const perMinute = filler && typeof filler.perMinute === 'number' ? filler.perMinute : null
    if (perMinute != null) fillerPerMin.push({ t, value: perMinute })
    const scores = feedback?.scores ? Object.values(feedback.scores).filter((n) => typeof n === 'number') : []
    const avg = mean(scores)
    if (avg != null) starAvg.push({ t, value: avg })
    const s = behavioralScore(avg, perMinute)
    if (s != null) score.push({ t, value: s })
  }
  fillerPerMin.sort((a, b) => a.t - b.t)
  starAvg.sort((a, b) => a.t - b.t)
  score.sort((a, b) => a.t - b.t)
  return { fillerPerMin, starAvg, score }
}
