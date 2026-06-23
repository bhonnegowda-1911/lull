import { describe, it, expect } from 'vitest'
import { STAGES, getStage, stageIndex, nextStage, FIRST_STAGE, LEVELS } from '../data/sysdesign/stages'
import { PROBLEMS, getProblem, DEFAULT_PROBLEM, problemCatalog } from '../data/sysdesign/problems'
import { candidateDecisions, type Turn } from '../lib/sysdesign/conversation'
import { reviveSession, sanitize, type SessionState } from '../lib/sysdesign/persistence'

describe('system-design stages', () => {
  it('starts at functional requirements and ends at deep dives', () => {
    expect(FIRST_STAGE.id).toBe('functional')
    expect(STAGES[STAGES.length - 1].id).toBe('deepdives')
  })

  it('every stage carries a full mid/senior/staff rubric', () => {
    for (const s of STAGES) {
      expect(s.levelRubric.mid).toBeTruthy()
      expect(s.levelRubric.senior).toBeTruthy()
      expect(s.levelRubric.staff).toBeTruthy()
    }
  })

  it('navigates stages in order and stops at the end', () => {
    expect(stageIndex('entities')).toBe(2)
    expect(nextStage('functional')!.id).toBe('nonfunctional')
    expect(nextStage('deepdives')).toBeNull()
  })

  it('falls back to the first stage for unknown ids', () => {
    expect(getStage('nope').id).toBe(FIRST_STAGE.id)
  })

  it('only the data-flow stage is optional', () => {
    const optional = STAGES.filter((s) => s.optional).map((s) => s.id)
    expect(optional).toEqual(['dataflow'])
  })

  it('escalation (curveballs) is enabled only on high-level design and deep dives', () => {
    const escalating = STAGES.filter((s) => s.escalate).map((s) => s.id)
    expect(escalating).toEqual(['highlevel', 'deepdives'])
  })

  it('levels run junior → staff', () => {
    expect(LEVELS).toEqual(['junior', 'mid', 'senior', 'staff'])
  })
})

describe('system-design problems', () => {
  it('every problem has stage hints used by the grader', () => {
    for (const p of PROBLEMS) {
      expect(p.statement).toBeTruthy()
      expect(p.hints.functionalReqs.length).toBeGreaterThan(0)
      expect(p.hints.deepDives.length).toBeGreaterThan(0)
    }
  })

  it('falls back to the default problem for unknown ids', () => {
    expect(getProblem('nope').id).toBe(DEFAULT_PROBLEM.id)
  })

  it('exposes a selector catalog whose ids all resolve back to real library problems', () => {
    const catalog = problemCatalog()
    expect(catalog.length).toBe(PROBLEMS.length)
    for (const c of catalog) {
      expect(c.id).toBeTruthy()
      expect(c.statement).toBeTruthy()
      // The JD selector only returns catalog ids; each must resolve to that exact problem.
      expect(getProblem(c.id).id).toBe(c.id)
    }
  })

  it('includes the code-execution problem the selector needs for untrusted-execution domains', () => {
    expect(PROBLEMS.some((p) => p.id === 'code-execution')).toBe(true)
  })
})

describe('cross-stage memory', () => {
  it('extracts only the candidate statements from a transcript', () => {
    const transcript: Turn[] = [
      { role: 'candidate', text: 'Use REST.' },
      { role: 'interviewer', text: 'Why REST?' },
      { role: 'candidate', text: 'Simple CRUD, public API.' },
    ]
    expect(candidateDecisions(transcript)).toBe('Use REST. Simple CRUD, public API.')
  })

  it('returns an empty string for an empty or interviewer-only transcript', () => {
    expect(candidateDecisions([])).toBe('')
    expect(candidateDecisions([{ role: 'interviewer', text: 'Hi' }])).toBe('')
  })
})

describe('session persistence (resume + hydrate)', () => {
  const base: SessionState = {
    id: 'sess-1',
    createdAt: 1_700_000_000_000,
    phase: 'interview',
    problemId: PROBLEMS[0].id,
    currentIndex: 1,
    sessions: { [STAGES[0].id]: { transcript: [{ role: 'candidate', text: 'Use REST.' }], coverage: null, aligned: false } },
    completed: { [STAGES[0].id]: 'done' },
    thinking: false,
    report: null,
    error: null,
    attachments: ['asset-1'],
  }

  it('round-trips an in-progress interview (id/attachments preserved)', () => {
    const revived = reviveSession(JSON.stringify(base))
    expect(revived?.id).toBe('sess-1')
    expect(revived?.problemId).toBe(base.problemId)
    expect(revived?.currentIndex).toBe(1)
    expect(revived?.sessions[STAGES[0].id].transcript).toHaveLength(1)
    expect(revived?.completed[STAGES[0].id]).toBe('done')
    expect(revived?.attachments).toEqual(['asset-1'])
  })

  it('drops in-flight LLM state so the user lands on something actionable', () => {
    const revived = reviveSession(JSON.stringify({ ...base, phase: 'reporting', thinking: true, error: 'boom' }))
    expect(revived?.phase).toBe('interview')
    expect(revived?.thinking).toBe(false)
    expect(revived?.error).toBeNull()
  })

  it('keeps a finished report but falls back to interview if the report is missing', () => {
    expect(reviveSession(JSON.stringify({ ...base, phase: 'report', report: { foo: 1 } }))?.phase).toBe('report')
    expect(reviveSession(JSON.stringify({ ...base, phase: 'report', report: null }))?.phase).toBe('interview')
  })

  it('sanitize hydrates a backend payload and mints an id when one is missing', () => {
    const { id: _omit, ...noId } = base
    const restored = sanitize(noId)
    expect(restored).not.toBeNull()
    expect(typeof restored?.id).toBe('string')
    expect(restored?.id.length).toBeGreaterThan(0)
  })

  it('returns null when there is nothing worth resuming', () => {
    expect(reviveSession(null)).toBeNull()
    expect(reviveSession('not json')).toBeNull()
    expect(sanitize(null)).toBeNull()
    expect(reviveSession(JSON.stringify({ ...base, problemId: null }))).toBeNull()
    expect(reviveSession(JSON.stringify({ ...base, currentIndex: 999 }))).toBeNull()
  })
})
