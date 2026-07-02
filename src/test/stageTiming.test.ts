import { describe, it, expect, vi, afterEach } from 'vitest'
import { enterStage, leaveStage, stageElapsedMs, formatDuration, pace } from '../lib/interview/stageTiming'

afterEach(() => vi.useRealTimers())

describe('stageTiming', () => {
  it('enter then leave banks the elapsed segment', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const entered = enterStage<{ transcript: unknown[]; enteredAt?: number; elapsedMs?: number }>({ transcript: [] })
    expect(entered.enteredAt).toBe(1_000_000)

    vi.setSystemTime(1_000_000 + 5_000)
    const left = leaveStage(entered)
    expect(left.elapsedMs).toBe(5_000)
    expect(left.enteredAt).toBeUndefined()
  })

  it('leave is idempotent and accumulates across segments', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    let s = enterStage<{ enteredAt?: number; elapsedMs?: number }>({})
    vi.setSystemTime(3_000)
    s = leaveStage(s)
    // Banked once; leaving again with no running clock changes nothing.
    expect(leaveStage(s).elapsedMs).toBe(3_000)

    // A second visit adds to the bank.
    s = enterStage(s)
    vi.setSystemTime(5_000)
    expect(leaveStage(s).elapsedMs).toBe(5_000)
  })

  it('stageElapsedMs includes the live segment while running', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const s = enterStage({ elapsedMs: 2_000 })
    expect(stageElapsedMs(s, 13_000)).toBe(5_000)
    expect(stageElapsedMs(undefined)).toBe(0)
    expect(stageElapsedMs({ elapsedMs: 4_000 }, 99)).toBe(4_000)
  })

  it('formatDuration renders compact m/s', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(48_000)).toBe('48s')
    expect(formatDuration(60_000)).toBe('1m')
    expect(formatDuration(252_000)).toBe('4m 12s')
  })

  it('pace buckets actual against the expected budget', () => {
    expect(pace(60_000, 4).status).toBe('under') // 1m vs 4m
    expect(pace(4 * 60_000, 4).status).toBe('under') // exactly on budget
    expect(pace(4.5 * 60_000, 4).status).toBe('on') // slightly over, within 1.25x
    expect(pace(7 * 60_000, 4).status).toBe('over') // 1.75x
    expect(pace(10 * 60_000, 4).status).toBe('way-over') // 2.5x
    expect(pace(99, undefined).ratio).toBeNull()
  })
})
