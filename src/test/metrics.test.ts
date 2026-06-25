import { describe, expect, it } from 'vitest'
import { correlation, funnel, fitCalibration, roundOutcomeStats, practiceLift } from '../lib/metrics/compute'
import type { MetricEvent } from '../lib/metrics/events'

// The metrics CAPTURE (events.ts) touches localStorage and isn't unit-tested; these cover the pure
// derivations that turn the raw event stream into the funnel, calibration, and validity stats.

let seq = 0
function round(p: Partial<Extract<MetricEvent, { type: 'round_resolved' }>> = {}): MetricEvent {
  return {
    id: `r${seq++}`,
    ts: p.ts ?? '2026-02-01T00:00:00.000Z',
    type: 'round_resolved',
    jobId: p.jobId ?? 'job-1',
    roundId: p.roundId ?? `round-${seq}`,
    roundType: p.roundType ?? 'system_design',
    practiceMode: p.practiceMode ?? 'sysdesign',
    outcome: p.outcome ?? 'passed',
    roundDate: p.roundDate ?? null,
    fitScore: p.fitScore ?? null,
    fitVerdict: p.fitVerdict ?? null,
  }
}
function session(p: Partial<Extract<MetricEvent, { type: 'session_completed' }>> = {}): MetricEvent {
  return { id: `s${seq++}`, ts: p.ts ?? '2026-01-01T00:00:00.000Z', type: 'session_completed', kind: p.kind ?? 'sysdesign', level: p.level ?? null }
}
function status(jobId: string, s: Extract<MetricEvent, { type: 'app_status' }>['status']): MetricEvent {
  return { id: `a${seq++}`, ts: '2026-01-15T00:00:00.000Z', type: 'app_status', jobId, status: s }
}

describe('correlation', () => {
  it('is +1 for a perfectly increasing relationship and null without variance', () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
    expect(correlation([1, 2, 3], [1, 1, 1])).toBeNull()
    expect(correlation([1], [1])).toBeNull() // too few points
  })
})

describe('funnel', () => {
  it('counts distinct applications at each stage with step conversion', () => {
    const events = [
      status('job-1', 'applied'),
      status('job-2', 'applied'),
      round({ jobId: 'job-1', outcome: 'passed' }), // job-1 interviewed + passed
      status('job-1', 'offer'),
    ]
    const f = funnel(events)
    const by = Object.fromEntries(f.map((s) => [s.key, s.count]))
    expect(by.applied).toBe(2)
    expect(by.interviewing).toBe(1)
    expect(by.passed).toBe(1)
    expect(by.offer).toBe(1)
    // applied → interviewing is 1 of 2
    expect(f.find((s) => s.key === 'interviewing')!.fromPrev).toBeCloseTo(0.5)
  })
})

describe('roundOutcomeStats', () => {
  it('reports overall and per-mode pass rates', () => {
    const events = [
      round({ practiceMode: 'sysdesign', outcome: 'passed' }),
      round({ practiceMode: 'sysdesign', outcome: 'failed' }),
      round({ practiceMode: 'coding', outcome: 'passed' }),
    ]
    const s = roundOutcomeStats(events)
    expect(s.overall).toMatchObject({ n: 3, passed: 2 })
    expect(s.overall.passRate).toBeCloseTo(2 / 3)
    expect(s.byMode.sysdesign).toMatchObject({ n: 2, passed: 1 })
    expect(s.byMode.coding!.passRate).toBe(1)
  })
})

describe('fitCalibration', () => {
  it('buckets rounds by predicted fit and reports actual pass rate per bucket', () => {
    const events = [
      round({ fitScore: 85, outcome: 'passed' }),
      round({ fitScore: 82, outcome: 'passed' }),
      round({ fitScore: 15, outcome: 'failed' }),
      round({ fitScore: 10, outcome: 'passed' }),
      round({ fitScore: 50 }), // null outcome? no — outcome defaults 'passed'; fits 40-60 bucket
    ]
    const c = fitCalibration(events, 20)
    expect(c.n).toBe(5)
    const hi = c.buckets.find((b) => b.lo === 80)!
    expect(hi.n).toBe(2)
    expect(hi.passRate).toBe(1)
    const lo = c.buckets.find((b) => b.lo === 0)!
    expect(lo.n).toBe(2)
    expect(lo.passRate).toBeCloseTo(0.5)
    // higher fit → more likely to pass, so correlation should be positive
    expect(c.correlation).not.toBeNull()
    expect(c.correlation!).toBeGreaterThan(0)
  })

  it('ignores rounds with no fit score', () => {
    expect(fitCalibration([round({ fitScore: null })]).n).toBe(0)
  })
})

describe('practiceLift', () => {
  it('splits rounds by whether a matching practice session preceded them', () => {
    const events = [
      session({ kind: 'sysdesign', ts: '2026-01-01T00:00:00.000Z', level: 'senior' }),
      // practiced before this round (round dated after the session)
      round({ practiceMode: 'sysdesign', roundDate: '2026-02-01', outcome: 'passed' }),
      // no session before this one (round dated before any session would be — use early roundDate)
      round({ practiceMode: 'sysdesign', roundDate: '2025-12-01', outcome: 'failed' }),
    ]
    const lift = practiceLift(events).find((l) => l.mode === 'sysdesign')!
    expect(lift.withPractice.n).toBe(1)
    expect(lift.withPractice.passRate).toBe(1)
    expect(lift.withoutPractice.n).toBe(1)
    expect(lift.withoutPractice.passRate).toBe(0)
    expect(lift.lift).toBe(1) // 1.0 − 0.0
  })

  it('omits modes with no resolved rounds', () => {
    expect(practiceLift([session({ kind: 'coding' })])).toEqual([])
  })
})
