import { describe, it, expect } from 'vitest'
import {
  levelOrdinal,
  ordinalLabel,
  mean,
  trendDirection,
  buildLevelSeries,
  type Point,
} from '../features/progress/trends'
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
