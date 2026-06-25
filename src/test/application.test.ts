import { describe, it, expect, vi } from 'vitest'
import {
  activeRound,
  activeRounds,
  activeSession,
  addDays,
  daysBetween,
  emptyApplication,
  newRound,
  nextInterview,
  relativeDay,
  sessionsOf,
  toISODate,
} from '../lib/application/schedule'
import { upcomingRounds } from '../lib/application/agenda'
import { activeInterviews, generateGlobalPrepPlan, prepInputSignature } from '../lib/application/globalPrepPlan'
import type { Application, JobDescription, RoundType, StageOutcome } from '../types'

// A deterministic stand-in for the LLM call: returns a two-day plan whose tasks reference interview
// numbers 1 and 2 (plus a general rest task), so we can assert dayIndex→date mapping and attribution.
vi.mock('../lib/llmClient', () => ({
  chatStructured: vi.fn(async () => ({
    parsed: {
      days: [
        { dayIndex: 1, focus: 'Kickoff', tasks: [{ interview: 1, round: 'recruiter', text: 'Acme task' }] },
        {
          dayIndex: 2,
          focus: 'Design',
          tasks: [
            { interview: 2, round: 'system_design', text: 'Globex task' },
            { interview: null, round: 'rest', text: 'Rest up' },
          ],
        },
      ],
    },
  })),
}))

describe('schedule date helpers', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-06-23', '2026-06-30')).toBe(7)
    expect(daysBetween('2026-06-30', '2026-06-23')).toBe(-7)
    expect(daysBetween('2026-06-23', '2026-06-23')).toBe(0)
  })

  it('labels relative days from a fixed today', () => {
    const today = '2026-06-23'
    expect(relativeDay('2026-06-23', today)).toBe('Today')
    expect(relativeDay('2026-06-24', today)).toBe('Tomorrow')
    expect(relativeDay('2026-06-28', today)).toBe('in 5 days')
    expect(relativeDay('2026-06-22', today)).toBe('Yesterday')
  })

  it('round-trips toISODate format', () => {
    expect(toISODate(new Date(2026, 5, 9))).toBe('2026-06-09') // zero-padded month + day
  })
})

// Build an application with an explicit loop of [type, scheduledAt, outcome, groupedWithPrev?] tuples.
function appWith(rounds: Array<[RoundType, string | null, StageOutcome, boolean?]>): Application {
  return {
    status: 'active',
    rounds: rounds.map(([type, scheduledAt, outcome, groupedWithPrev]) => ({ ...newRound(type), scheduledAt, outcome, groupedWithPrev })),
    fit: null,
    decisionNote: '',
  }
}

describe('emptyApplication', () => {
  it('seeds a default, editable loop of round instances', () => {
    const app = emptyApplication()
    expect(app.status).toBe('not_applied')
    expect(app.rounds.map((r) => r.type)).toEqual(['recruiter', 'hiring_manager', 'onsite_loop'])
    expect(app.rounds.every((r) => r.outcome === 'pending' && r.id)).toBe(true)
  })
})

describe('nextInterview', () => {
  const today = '2026-06-23'

  it('returns null when nothing is scheduled', () => {
    expect(nextInterview(emptyApplication(), today)).toBeNull()
    expect(nextInterview(null, today)).toBeNull()
  })

  it('picks the soonest upcoming, not-yet-decided round', () => {
    const app = appWith([
      ['recruiter', '2026-06-25', 'scheduled'],
      ['system_design', '2026-06-28', 'scheduled'],
    ])
    expect(nextInterview(app, today)!.type).toBe('recruiter')
  })

  it('ignores past dates and already-decided rounds', () => {
    expect(nextInterview(appWith([['recruiter', '2026-06-20', 'scheduled']]), today)).toBeNull() // past
    expect(nextInterview(appWith([['recruiter', '2026-06-25', 'passed']]), today)).toBeNull() // passed
  })
})

describe('sessionsOf', () => {
  it('makes each ungrouped round its own session', () => {
    const app = appWith([
      ['recruiter', null, 'pending'],
      ['hiring_manager', null, 'pending'],
    ])
    expect(sessionsOf(app).map((s) => s.rounds.length)).toEqual([1, 1])
  })

  it('groups a contiguous run of groupedWithPrev rounds into one session', () => {
    const app = appWith([
      ['recruiter', null, 'pending'],
      ['technical_screen', null, 'pending', true], // grouped with system_design below? no — grouped with recruiter
      ['system_design', null, 'pending', true],
      ['hiring_manager', null, 'pending'],
    ])
    // recruiter + technical_screen + system_design form one session; hiring_manager is its own.
    expect(sessionsOf(app).map((s) => s.rounds.map((r) => r.type))).toEqual([
      ['recruiter', 'technical_screen', 'system_design'],
      ['hiring_manager'],
    ])
  })

  it('ignores the flag on the first round (a session can\'t group upward with nothing)', () => {
    const app = appWith([
      ['recruiter', null, 'pending', true],
      ['hiring_manager', null, 'pending'],
    ])
    expect(sessionsOf(app)).toHaveLength(2)
  })
})

describe('session gating (unlock-on-pass, per session)', () => {
  it('activeRound is the first undecided round of the active session', () => {
    const app = appWith([
      ['recruiter', '2026-06-25', 'passed'],
      ['hiring_manager', null, 'pending'],
      ['onsite_loop', null, 'pending'],
    ])
    expect(activeRound(app)!.type).toBe('hiring_manager')
  })

  it('unlocks every interview in a bundled onsite session together', () => {
    const app = appWith([
      ['recruiter', '2026-06-25', 'passed'],
      ['technical_screen', '2026-06-30', 'scheduled'],
      ['system_design', '2026-06-30', 'scheduled', true],
      ['hiring_manager', '2026-06-30', 'scheduled', true],
    ])
    // The whole onsite session is active; all three interviews prep together.
    expect(activeRounds(app).map((r) => r.type)).toEqual(['technical_screen', 'system_design', 'hiring_manager'])
  })

  it('keeps the next session locked until every interview in the active session passes', () => {
    const partly = appWith([
      ['technical_screen', '2026-06-30', 'passed'],
      ['system_design', '2026-06-30', 'scheduled', true], // still pending
      ['hiring_manager', '2026-07-05', 'scheduled'], // next session
    ])
    // Active session still has system_design undecided → next session (hiring_manager) not active.
    expect(activeSession(partly)!.rounds.map((r) => r.type)).toEqual(['technical_screen', 'system_design'])
    expect(activeRounds(partly).map((r) => r.type)).toEqual(['system_design'])

    const cleared = appWith([
      ['technical_screen', '2026-06-30', 'passed'],
      ['system_design', '2026-06-30', 'passed', true],
      ['hiring_manager', '2026-07-05', 'scheduled'],
    ])
    expect(activeRounds(cleared).map((r) => r.type)).toEqual(['hiring_manager'])
  })

  it('a failed interview in the active session blocks advance', () => {
    const app = appWith([
      ['recruiter', '2026-06-25', 'failed'],
      ['hiring_manager', null, 'pending'],
    ])
    // The recruiter session isn't fully passed, so it stays active with nothing left to prep.
    expect(activeSession(app)!.rounds.map((r) => r.type)).toEqual(['recruiter'])
    expect(activeRounds(app)).toEqual([])
    expect(activeRound(app)).toBeNull()
  })

  it('returns null/empty once every session is passed', () => {
    const app = appWith([
      ['recruiter', '2026-06-25', 'passed'],
      ['hiring_manager', '2026-06-28', 'passed'],
    ])
    expect(activeSession(app)).toBeNull()
    expect(activeRound(app)).toBeNull()
    expect(activeRound(null)).toBeNull()
  })
})

// A job with a single active round, scheduled on `scheduledAt`. Defaults make it an in-flight
// interview that feeds the global plan; pass overrides to vary the signature inputs.
function jobWith(opts: {
  id: string
  company?: string
  type?: RoundType
  scheduledAt: string | null
  outcome?: StageOutcome
  topic?: string
  focusAreas?: string[]
  status?: Application['status']
}): JobDescription {
  const { id, company = 'Co', type = 'recruiter', scheduledAt, outcome = 'scheduled', topic, focusAreas, status = 'active' } = opts
  const round = { ...newRound(type), scheduledAt, outcome, topic: topic ?? '', focusAreas: focusAreas ?? [] }
  return {
    id, title: `${company} role`, company, rawText: '', parsed: null,
    problemPicks: [], codingPicks: [], behavioralPicks: [], recruiterPicks: [],
    application: { status, rounds: [round], fit: null, decisionNote: '' },
  }
}

describe('upcomingRounds', () => {
  const today = '2026-06-23'

  it('lists the next upcoming round per company, soonest first', () => {
    const a = jobWith({ id: 'a', company: 'Acme', type: 'recruiter', scheduledAt: '2026-06-28' })
    const b = jobWith({ id: 'b', company: 'Globex', type: 'system_design', scheduledAt: '2026-06-25' })
    expect(upcomingRounds([a, b], today).map((u) => u.company)).toEqual(['Globex', 'Acme'])
  })
})

describe('activeInterviews', () => {
  it('takes each in-flight job\'s scheduled active round, soonest first', () => {
    const a = jobWith({ id: 'a', company: 'Acme', scheduledAt: '2026-06-28' })
    const b = jobWith({ id: 'b', company: 'Globex', scheduledAt: '2026-06-25' })
    expect(activeInterviews([a, b]).map((i) => i.company)).toEqual(['Globex', 'Acme'])
  })

  it('excludes undated rounds and terminal applications', () => {
    const undated = jobWith({ id: 'a', scheduledAt: null })
    const rejected = jobWith({ id: 'b', scheduledAt: '2026-06-25', status: 'rejected' })
    expect(activeInterviews([undated, rejected])).toEqual([])
  })

  it('contributes every dated interview of a bundled onsite session', () => {
    const onsite: JobDescription = {
      id: 'a', title: 'Acme role', company: 'Acme', rawText: '', parsed: null,
      problemPicks: [], codingPicks: [], behavioralPicks: [], recruiterPicks: [],
      application: {
        status: 'active',
        rounds: [
          { ...newRound('technical_screen'), scheduledAt: '2026-06-30', outcome: 'scheduled' },
          { ...newRound('system_design'), scheduledAt: '2026-07-01', outcome: 'scheduled', groupedWithPrev: true },
          { ...newRound('hiring_manager'), scheduledAt: '2026-07-01', outcome: 'scheduled', groupedWithPrev: true },
        ],
        fit: null, decisionNote: '',
      },
    }
    expect(activeInterviews([onsite]).map((i) => i.round.type)).toEqual(['technical_screen', 'system_design', 'hiring_manager'])
  })
})

describe('prepInputSignature', () => {
  it('is stable across edits that do not affect prep inputs (e.g. company name)', () => {
    const a = jobWith({ id: 'a', company: 'Acme', scheduledAt: '2026-06-28' })
    const renamed = { ...a, company: 'Acme Corp', title: 'Acme Corp role' }
    expect(prepInputSignature([renamed])).toBe(prepInputSignature([a]))
  })

  it('changes when a round date, outcome, or focus areas change', () => {
    const base = jobWith({ id: 'a', scheduledAt: '2026-06-28' })
    const sig = prepInputSignature([base])
    expect(prepInputSignature([jobWith({ id: 'a', scheduledAt: '2026-06-29' })])).not.toBe(sig)
    expect(prepInputSignature([jobWith({ id: 'a', scheduledAt: '2026-06-28', outcome: 'pending' })])).not.toBe(sig)
    expect(prepInputSignature([jobWith({ id: 'a', scheduledAt: '2026-06-28', focusAreas: ['sharding'] })])).not.toBe(sig)
  })

  it('changes when an interview is added or removed', () => {
    const a = jobWith({ id: 'a', scheduledAt: '2026-06-28' })
    const b = jobWith({ id: 'b', company: 'Globex', scheduledAt: '2026-06-25' })
    expect(prepInputSignature([a, b])).not.toBe(prepInputSignature([a]))
  })
})

describe('generateGlobalPrepPlan', () => {
  it('maps dayIndex forward from today, attributes tasks to interviews, and stamps the signature', async () => {
    const today = toISODate()
    const acme = jobWith({ id: 'a', company: 'Acme', type: 'recruiter', scheduledAt: addDays(today, 1) })
    const globex = jobWith({ id: 'b', company: 'Globex', type: 'system_design', scheduledAt: addDays(today, 2) })
    const jobs = [acme, globex]

    const plan = await generateGlobalPrepPlan(jobs)

    // dayIndex 1 = today, counting forward.
    expect(plan.days.map((d) => d.date)).toEqual([today, addDays(today, 1)])
    // interview number → company attribution (sorted soonest-first: 1 = Acme, 2 = Globex).
    expect(plan.days[0].tasks[0].company).toBe('Acme')
    expect(plan.days[1].tasks[0].company).toBe('Globex')
    // A general (interview=null) task carries no company attribution.
    expect(plan.days[1].tasks[1].company).toBeUndefined()
    // The plan records the signature it was built from, so the UI can detect staleness.
    expect(plan.signature).toBe(prepInputSignature(jobs))
  })

  it('returns an empty plan when nothing is scheduled', async () => {
    const plan = await generateGlobalPrepPlan([jobWith({ id: 'a', scheduledAt: null })])
    expect(plan.days).toEqual([])
  })
})
