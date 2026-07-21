import { describe, it, expect } from 'vitest'
import { buildFeedback } from '../lib/feedback'
import type { FillerResult, StarGrading } from '../types'

function llmResult(overrides: Partial<StarGrading> = {}): { raw: Partial<StarGrading> } {
  return {
    raw: {
      conforms: true,
      summary: 'Solid structure.',
      scores: { clarity: 4, structure: 4, impact: 3 },
      perBeat: {
        situation: { present: true, score: 4, note: 'Clear context.' },
        task: { present: true, score: 3, note: 'Goal stated.' },
        action: { present: true, score: 4, note: 'Concrete steps.' },
        result: { present: false, score: 1, note: 'No outcome stated.' },
        reflection: { present: true, score: 3, note: 'Brief takeaway at the end.' },
      },
      coachingNotes: [
        { title: 'Add a result', detail: 'Quantify the outcome.', severity: 'high' },
        { title: 'Trim setup', detail: 'Shorten the situation.', severity: 'low' },
        { title: 'Tighten task', detail: 'State the goal sooner.', severity: 'medium' },
      ],
      ...overrides,
    },
  }
}

function fillerResult(raw: Partial<FillerResult> = {}): { raw: Partial<FillerResult> } {
  return { raw: { total: 0, perMinute: 0, byWord: {}, ...raw } }
}

describe('buildFeedback', () => {
  it('ranks coaching notes by severity (high, medium, low)', () => {
    const fb = buildFeedback({ llm: llmResult(), filler: fillerResult() })
    const starNotes = fb.notes.filter((n) => n.source === 'star')
    expect(starNotes.map((n) => n.severity)).toEqual(['high', 'medium', 'low'])
  })

  it('flattens perBeat into ordered S/T/A/R/R beats', () => {
    const fb = buildFeedback({ llm: llmResult(), filler: fillerResult() })
    expect(fb.beats.map((b) => b.key)).toEqual(['situation', 'task', 'action', 'result', 'reflection'])
    expect(fb.beats[3]).toMatchObject({ label: 'Result', present: false, score: 1 })
    expect(fb.beats[4]).toMatchObject({ label: 'Reflection', present: true, score: 3 })
  })

  it('appends a high-severity filler note when rate is high', () => {
    const fb = buildFeedback({
      llm: llmResult(),
      filler: fillerResult({ total: 30, perMinute: 12 }),
    })
    const fillerNote = fb.notes.find((n) => n.source === 'filler')
    expect(fillerNote).toBeTruthy()
    expect(fillerNote!.severity).toBe('high')
  })

  it('omits the filler note when usage is negligible', () => {
    const fb = buildFeedback({
      llm: llmResult(),
      filler: fillerResult({ total: 1, perMinute: 1 }),
    })
    expect(fb.notes.find((n) => n.source === 'filler')).toBeUndefined()
  })

  it('surfaces filler totals and rate', () => {
    const fb = buildFeedback({
      llm: llmResult(),
      filler: fillerResult({ total: 8, perMinute: 5, byWord: { um: 5, like: 3 } }),
    })
    expect(fb.filler).toMatchObject({ total: 8, perMinute: 5 })
    expect(fb.filler.byWord).toEqual({ um: 5, like: 3 })
  })

  it('passes through the level signal when present', () => {
    const fb = buildFeedback({
      llm: llmResult({
        levelSignal: {
          level: 'senior',
          rationale: 'Drove cross-team work.',
          signals: ['scope'],
          toReachHigher: [],
        },
      }),
      filler: fillerResult(),
    })
    expect(fb.level).toMatchObject({ level: 'senior' })
    expect(fb.level!.signals).toEqual(['scope'])
  })

  it('does not crash on missing analyzer data', () => {
    const fb = buildFeedback({})
    expect(fb.conforms).toBe(false)
    expect(fb.beats).toEqual([])
    expect(fb.notes).toEqual([])
    expect(fb.filler.total).toBe(0)
    expect(fb.level).toBeNull()
  })
})
