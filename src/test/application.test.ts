import { describe, it, expect, vi, beforeEach } from 'vitest'
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

// Stub the banks so pick IDs resolve to predictable titles/labels without depending on the real
// question banks, and stub the LLM so the planner is deterministic: tests default to a rejected call
// (exercising the deterministic fallback), and the LLM-path test overrides it with a canned plan.
vi.mock('../data/prompts', () => ({ getPrompt: (id: string) => ({ label: `Prompt ${id}` }) }))
vi.mock('../data/sysdesign/problems', () => ({ getProblem: (id: string) => ({ title: `SysDesign ${id}` }) }))
vi.mock('../data/coding/problems', () => ({ getProblem: (id: string) => ({ title: `Coding ${id}` }) }))
vi.mock('../lib/llmClient', () => ({ chatStructured: vi.fn() }))

import { chatStructured } from '../lib/llmClient'
const mockChat = vi.mocked(chatStructured)

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
  const today = '2026-06-23'

  it('takes each in-flight job\'s scheduled active round, soonest first', () => {
    const a = jobWith({ id: 'a', company: 'Acme', scheduledAt: '2026-06-28' })
    const b = jobWith({ id: 'b', company: 'Globex', scheduledAt: '2026-06-25' })
    expect(activeInterviews([a, b], today).map((i) => i.company)).toEqual(['Globex', 'Acme'])
  })

  it('excludes undated rounds and terminal applications', () => {
    const undated = jobWith({ id: 'a', scheduledAt: null })
    const rejected = jobWith({ id: 'b', scheduledAt: '2026-06-25', status: 'rejected' })
    expect(activeInterviews([undated, rejected], today)).toEqual([])
  })

  it('excludes interviews whose date is already in the past (keeps today)', () => {
    const past = jobWith({ id: 'a', company: 'Acme', scheduledAt: '2026-06-20' })
    const onToday = jobWith({ id: 'b', company: 'Globex', scheduledAt: today })
    const future = jobWith({ id: 'c', company: 'Initech', scheduledAt: '2026-06-28' })
    expect(activeInterviews([past, onToday, future], today).map((i) => i.company)).toEqual(['Globex', 'Initech'])
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
    expect(activeInterviews([onsite], today).map((i) => i.round.type)).toEqual(['technical_screen', 'system_design', 'hiring_manager'])
  })
})

describe('prepInputSignature', () => {
  const today = '2026-06-23'

  it('is stable across edits that do not affect prep inputs (e.g. company name)', () => {
    const a = jobWith({ id: 'a', company: 'Acme', scheduledAt: '2026-06-28' })
    const renamed = { ...a, company: 'Acme Corp', title: 'Acme Corp role' }
    expect(prepInputSignature([renamed], today)).toBe(prepInputSignature([a], today))
  })

  it('changes when a round date, outcome, or focus areas change', () => {
    const base = jobWith({ id: 'a', scheduledAt: '2026-06-28' })
    const sig = prepInputSignature([base], today)
    expect(prepInputSignature([jobWith({ id: 'a', scheduledAt: '2026-06-29' })], today)).not.toBe(sig)
    expect(prepInputSignature([jobWith({ id: 'a', scheduledAt: '2026-06-28', outcome: 'pending' })], today)).not.toBe(sig)
    expect(prepInputSignature([jobWith({ id: 'a', scheduledAt: '2026-06-28', focusAreas: ['sharding'] })], today)).not.toBe(sig)
  })

  it('changes when an interview is added or removed', () => {
    const a = jobWith({ id: 'a', scheduledAt: '2026-06-28' })
    const b = jobWith({ id: 'b', company: 'Globex', scheduledAt: '2026-06-25' })
    expect(prepInputSignature([a, b], today)).not.toBe(prepInputSignature([a], today))
  })

  it('drops an interview once its date has passed, so a since-completed plan reads as stale', () => {
    const a = jobWith({ id: 'a', scheduledAt: '2026-06-28' })
    const before = prepInputSignature([a], '2026-06-23')
    const after = prepInputSignature([a], '2026-06-29')
    expect(after).not.toBe(before)
  })
})

describe('generateGlobalPrepPlan', () => {
  const pick = (problemId: string) => ({ problemId, confidence: 'high' as const, rationale: 'r' })
  const prompt = (promptId: string) => ({ promptId, confidence: 'high' as const, rationale: 'r' })

  // Default: the LLM call fails, so these exercise the deterministic fallback. The LLM-path test below
  // overrides mockChat with a canned plan.
  beforeEach(() => {
    mockChat.mockReset()
    mockChat.mockRejectedValue(new Error('no backend'))
  })

  it('spreads an interview\'s saved questions across its run-up, front-loaded, closing with a timed mock', async () => {
    const today = toISODate()
    const acme = jobWith({ id: 'a', company: 'Acme', type: 'technical_screen', scheduledAt: addDays(today, 3) })
    acme.codingPicks = [pick('c1'), pick('c2'), pick('c3')]

    const plan = await generateGlobalPrepPlan([acme])

    // dayIndex 1 = today, out to the interview day (4 days).
    expect(plan.days.map((d) => d.date)).toEqual([today, addDays(today, 1), addDays(today, 2), addDays(today, 3)])
    // The saved picks become tasks verbatim (with time-boxes), one per run-up day, in order.
    expect(plan.days[0].tasks[0]).toMatchObject({ text: 'Solve: Coding c1', minutes: 30, company: 'Acme', roundLabel: 'Technical screen', done: false })
    expect(plan.days[1].tasks[0].text).toBe('Solve: Coding c2')
    expect(plan.days[2].tasks[0].text).toBe('Solve: Coding c3')
    // The interview day itself is reserved for the timed mock.
    expect(plan.days[3].tasks[0]).toMatchObject({ text: 'Full timed mock: Technical screen', minutes: 45 })
    // The plan records the signature it was built from, so the UI can detect staleness.
    expect(plan.signature).toBe(prepInputSignature([acme]))
  })

  it('deep-links each task to the page where it is practiced', async () => {
    const today = toISODate()
    const coding = jobWith({ id: 'a', type: 'technical_screen', scheduledAt: addDays(today, 2) })
    coding.codingPicks = [pick('c1')]
    const recruiter = jobWith({ id: 'b', type: 'recruiter', scheduledAt: addDays(today, 2) })
    recruiter.recruiterPicks = [prompt('r1')]

    const tasks = (await generateGlobalPrepPlan([coding, recruiter])).days.flatMap((d) => d.tasks)
    const codingSolve = tasks.find((t) => t.text === 'Solve: Coding c1')
    const recruiterRehearse = tasks.find((t) => t.text.startsWith('Rehearse:'))

    expect(codingSolve?.link).toEqual({ to: '/practice/coding', state: { startProblemId: 'c1' } })
    expect(recruiterRehearse?.link).toEqual({ to: '/practice/behavioral', state: { startPromptId: 'r1', jobId: 'b', persona: 'recruiter' } })
    // The timed mock links to its practice mode too.
    expect(tasks.find((t) => t.text === 'Full timed mock: Technical screen')?.link).toEqual({ to: '/practice/coding' })
  })

  it('interleaves parallel interviews and attributes every task to its company', async () => {
    const today = toISODate()
    const acme = jobWith({ id: 'a', company: 'Acme', type: 'system_design', scheduledAt: addDays(today, 2) })
    acme.problemPicks = [pick('p1')]
    const globex = jobWith({ id: 'b', company: 'Globex', type: 'behavioral', scheduledAt: addDays(today, 2) })
    globex.behavioralPicks = [prompt('b1')]

    const plan = await generateGlobalPrepPlan([acme, globex])
    const companies = plan.days.flatMap((d) => d.tasks.map((t) => t.company))
    expect(new Set(companies)).toEqual(new Set(['Acme', 'Globex']))
    // Every task is attributed — no orphan tasks.
    expect(plan.days.flatMap((d) => d.tasks).every((t) => !!t.company)).toBe(true)
  })

  it('falls back to one grounding review task when a round has no saved picks', async () => {
    const today = toISODate()
    const job = jobWith({ id: 'a', company: 'Acme', type: 'take_home', scheduledAt: addDays(today, 1), topic: 'Design doc' })

    const plan = await generateGlobalPrepPlan([job])
    const tasks = plan.days.flatMap((d) => d.tasks)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ text: 'Review Take-home assignment: Design doc', minutes: 30, company: 'Acme' })
  })

  it('uses the LLM plan: resolves saved-question codes to exact titles + links, and keeps tailored tasks', async () => {
    const today = toISODate()
    const acme = jobWith({ id: 'a', company: 'Acme', type: 'technical_screen', scheduledAt: addDays(today, 2) })
    acme.codingPicks = [pick('c1')] // becomes code Q1, and the mock becomes M1

    mockChat.mockResolvedValue({
      parsed: {
        days: [
          {
            dayIndex: 1,
            tasks: [
              // References a saved question by code → app supplies the canonical title + deep-link.
              { interview: 1, ref: 'Q1', text: 'whatever the model calls it', minutes: 40 },
              // A tailored, model-authored task (ref null) → attributed + linked to the application.
              { interview: 1, ref: null, text: 'Form a POV on Acme’s architecture for the CTO', minutes: 30 },
            ],
          },
          { dayIndex: 2, tasks: [{ interview: 1, ref: 'M1', text: 'mock', minutes: 45 }] },
        ],
      },
    } as never)

    const plan = await generateGlobalPrepPlan([acme])
    expect(mockChat).toHaveBeenCalledOnce()
    const day1 = plan.days[0].tasks

    // Coded task: canonical title + deep-link win over the model's text; LLM's minutes are kept.
    expect(day1[0]).toMatchObject({ text: 'Solve: Coding c1', minutes: 40, company: 'Acme', link: { to: '/practice/coding', state: { startProblemId: 'c1' } } })
    // Tailored task: kept as authored, attributed, and linked to the application.
    expect(day1[1]).toMatchObject({ text: 'Form a POV on Acme’s architecture for the CTO', minutes: 30, company: 'Acme', link: { to: '/app/a' } })
    // The mock code resolves to the canonical mock task.
    expect(plan.days[1].tasks[0]).toMatchObject({ text: 'Full timed mock: Technical screen', minutes: 45 })
  })

  it('returns an empty plan when nothing is scheduled', async () => {
    const plan = await generateGlobalPrepPlan([jobWith({ id: 'a', scheduledAt: null })])
    expect(plan.days).toEqual([])
  })
})
