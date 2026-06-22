import { describe, it, expect } from 'vitest'
import {
  levelOrdinal,
  ordinalLabel,
  mean,
  trendDirection,
  buildLevelSeries,
  behavioralScore,
  scoreFromLevel,
  type Point,
} from '../features/progress/trends'
import { rankFromScore, xpForScore, levelFromXp, summarizeGame } from '../features/progress/game'
import type { SessionSummary } from '../lib/sessionStore'

function summary(over: Partial<SessionSummary>): SessionSummary {
  return {
    id: 'x',
    kind: 'behavioral',
    status: 'completed',
    title: null,
    level: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    ...over,
  }
}

describe('levelOrdinal', () => {
  it('maps the ladder 1-based and is case-insensitive', () => {
    expect(levelOrdinal('junior')).toBe(1)
    expect(levelOrdinal('Senior')).toBe(3)
    expect(levelOrdinal('principal')).toBe(5)
  })
  it('returns null for missing or unknown levels', () => {
    expect(levelOrdinal(null)).toBeNull()
    expect(levelOrdinal('wizard')).toBeNull()
  })
})

describe('ordinalLabel', () => {
  it('rounds to the nearest level name', () => {
    expect(ordinalLabel(2)).toBe('mid')
    expect(ordinalLabel(2.6)).toBe('senior')
  })
})

describe('mean', () => {
  it('averages, or null when empty', () => {
    expect(mean([2, 4])).toBe(3)
    expect(mean([])).toBeNull()
  })
})

describe('trendDirection', () => {
  const pts = (vals: number[]): Point[] => vals.map((value, t) => ({ t, value }))
  it('reads first→last for higher-is-better', () => {
    expect(trendDirection(pts([2, 3]))).toBe('up')
    expect(trendDirection(pts([3, 2]))).toBe('down')
  })
  it('flips sense when lower is better (e.g. filler rate)', () => {
    expect(trendDirection(pts([5, 2]), true)).toBe('up')
    expect(trendDirection(pts([2, 5]), true)).toBe('down')
  })
  it('is flat for <2 points or no change', () => {
    expect(trendDirection(pts([4]))).toBe('flat')
    expect(trendDirection(pts([3, 3]))).toBe('flat')
  })
})

describe('buildLevelSeries', () => {
  it('orders oldest→newest and drops ungraded rows', () => {
    const series = buildLevelSeries([
      summary({ level: 'senior', completed_at: '2026-02-01T00:00:00.000Z' }),
      summary({ level: null, completed_at: '2026-01-15T00:00:00.000Z' }),
      summary({ level: 'mid', completed_at: '2026-01-01T00:00:00.000Z' }),
    ])
    expect(series.map((p) => p.value)).toEqual([2, 3])
  })
  it('falls back to created_at when completed_at is null', () => {
    const series = buildLevelSeries([summary({ level: 'staff', completed_at: null })])
    expect(series).toHaveLength(1)
    expect(series[0].value).toBe(4)
  })
})

describe('scoreFromLevel', () => {
  it('normalizes within a mode ladder (junior→0, top→100)', () => {
    expect(scoreFromLevel(1, 4)).toBe(0)
    expect(scoreFromLevel(4, 4)).toBe(100)
    expect(scoreFromLevel(3, 5)).toBe(50)
  })
})

describe('behavioralScore', () => {
  it('weights STAR with a filler penalty', () => {
    expect(behavioralScore(5, 0)).toBe(100) // perfect STAR, no filler
    expect(behavioralScore(1, 15)).toBe(0) // floor STAR, heavy filler
  })
  it('uses whichever signal is present, null if neither', () => {
    expect(behavioralScore(3, null)).toBe(50) // STAR only
    expect(behavioralScore(null, 15)).toBe(0) // filler only
    expect(behavioralScore(null, null)).toBeNull()
  })
})

describe('xpForScore', () => {
  it('has a completion floor and a skill bonus (20..100)', () => {
    expect(xpForScore(0)).toBe(20)
    expect(xpForScore(100)).toBe(100)
    expect(xpForScore(50)).toBe(60)
  })
})

describe('levelFromXp', () => {
  it('walks the rising curve (200, then +100 per level)', () => {
    expect(levelFromXp(0).level).toBe(1)
    expect(levelFromXp(199).level).toBe(1)
    expect(levelFromXp(200).level).toBe(2)
    expect(levelFromXp(500).level).toBe(3) // 200 + 300
  })
  it('reports progress into the current level', () => {
    const info = levelFromXp(300) // level 2, 100 into a 300-wide level
    expect(info.level).toBe(2)
    expect(info.into).toBe(100)
    expect(info.toNext).toBe(200)
  })
})

describe('rankFromScore', () => {
  it('maps 0–100 onto the 15-rung Bronze→Diamond ladder', () => {
    expect(rankFromScore(0).label).toBe('Bronze III')
    expect(rankFromScore(100).label).toBe('Diamond I')
    expect(rankFromScore(50).label).toBe('Gold II')
  })
})

describe('summarizeGame', () => {
  const pts = (vals: number[]): Point[] => vals.map((value, t) => ({ t, value }))
  it('is null with no sessions', () => {
    expect(summarizeGame([])).toBeNull()
  })
  it('accumulates XP and surfaces a rising rank', () => {
    const g = summarizeGame(pts([10, 20, 30, 60, 70, 80]))!
    expect(g.totalXp).toBeGreaterThan(0)
    expect(g.rankDir).toBe('up') // recent window outranks the prior one
  })
})
