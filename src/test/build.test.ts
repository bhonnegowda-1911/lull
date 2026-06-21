import { describe, it, expect } from 'vitest'
import { BUILD_STAGES, getBuildStage, FIRST_BUILD_STAGE } from '../data/build/stages'
import { RUBRIC, getDimension, dimensionLabel } from '../data/build/rubric'
import { BUILD_PROBLEMS, getBuildProblem, DEFAULT_BUILD_PROBLEM } from '../data/build/problems'
import { candidateDecisions, type Turn } from '../lib/build/conversation'
import { reviveSession, sanitize, type BuildSessionState } from '../lib/build/persistence'

describe('build planning stages', () => {
  it('runs scope → core → approach', () => {
    expect(FIRST_BUILD_STAGE.id).toBe('scope')
    expect(BUILD_STAGES.map((s) => s.id)).toEqual(['scope', 'core', 'approach'])
  })

  it('curveballs are enabled on the running-core and approach stages', () => {
    expect(BUILD_STAGES.filter((s) => s.escalate).map((s) => s.id)).toEqual(['core', 'approach'])
  })

  it('falls back to the first stage for unknown ids', () => {
    expect(getBuildStage('nope').id).toBe(FIRST_BUILD_STAGE.id)
  })
})

describe('build rubric (the grading dimensions)', () => {
  it('grades the five named dimensions', () => {
    expect(RUBRIC.map((d) => d.id)).toEqual(['scoping', 'running-core', 'security', 'code-quality', 'ai-usage'])
  })

  it('weights scoping and a running core as the primary (prioritization) dimensions', () => {
    expect(RUBRIC.filter((d) => d.weight === 'primary').map((d) => d.id)).toEqual(['scoping', 'running-core'])
  })

  it('every dimension carries a full mid/senior/staff rubric', () => {
    for (const d of RUBRIC) {
      expect(d.levels.mid).toBeTruthy()
      expect(d.levels.senior).toBeTruthy()
      expect(d.levels.staff).toBeTruthy()
    }
  })

  it('resolves dimension labels (used by the shared report renderer)', () => {
    expect(dimensionLabel('scoping')).toBe(getDimension('scoping')!.label)
    expect(dimensionLabel('unknown')).toBe('unknown')
  })
})

describe('build problems', () => {
  it('every problem has the prioritization hints used by the coach/grader', () => {
    for (const p of BUILD_PROBLEMS) {
      expect(p.statement).toBeTruthy()
      expect(p.language).toBeTruthy()
      expect(p.hints.scope.length).toBeGreaterThan(0)
      expect(p.hints.runningCore.length).toBeGreaterThan(0)
      expect(p.hints.security.length).toBeGreaterThan(0)
      expect(p.hints.aiUsage.length).toBeGreaterThan(0)
      expect(p.hints.traps.length).toBeGreaterThan(0)
    }
  })

  it('falls back to the default problem for unknown ids', () => {
    expect(getBuildProblem('nope').id).toBe(DEFAULT_BUILD_PROBLEM.id)
  })
})

describe('build cross-stage memory', () => {
  it('extracts only the candidate statements from a transcript', () => {
    const transcript: Turn[] = [
      { role: 'candidate', text: 'One language, sync.' },
      { role: 'interviewer', text: 'What runs first?' },
      { role: 'candidate', text: 'A walking skeleton end-to-end.' },
    ]
    expect(candidateDecisions(transcript)).toBe('One language, sync. A walking skeleton end-to-end.')
  })
})

describe('build session persistence (resume + hydrate)', () => {
  const base: BuildSessionState = {
    id: 'build-1',
    createdAt: 1_700_000_000_000,
    phase: 'session',
    problemId: BUILD_PROBLEMS[0].id,
    currentIndex: 2,
    sessions: {
      [BUILD_STAGES[0].id]: { transcript: [{ role: 'candidate', text: 'Scope it.' }], coverage: null, aligned: true },
    },
    completed: { [BUILD_STAGES[0].id]: true },
    thinking: false,
    report: null,
    error: null,
  }

  it('round-trips an in-progress planning session', () => {
    const revived = reviveSession(JSON.stringify(base))
    expect(revived?.id).toBe('build-1')
    expect(revived?.currentIndex).toBe(2)
    expect(revived?.completed[BUILD_STAGES[0].id]).toBe(true)
  })

  it('drops in-flight LLM state so the user lands on something actionable', () => {
    const revived = reviveSession(JSON.stringify({ ...base, phase: 'reporting', thinking: true, error: 'boom' }))
    expect(revived?.phase).toBe('session')
    expect(revived?.thinking).toBe(false)
    expect(revived?.error).toBeNull()
  })

  it('keeps a finished report but falls back to the live session if it is missing', () => {
    expect(reviveSession(JSON.stringify({ ...base, phase: 'report', report: { foo: 1 } }))?.phase).toBe('report')
    expect(reviveSession(JSON.stringify({ ...base, phase: 'report', report: null }))?.phase).toBe('session')
  })

  it('returns null when there is nothing worth resuming', () => {
    expect(sanitize(null)).toBeNull()
    expect(reviveSession(JSON.stringify({ ...base, problemId: null }))).toBeNull()
    expect(reviveSession(JSON.stringify({ ...base, currentIndex: 999 }))).toBeNull()
  })
})
