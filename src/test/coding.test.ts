import { describe, it, expect } from 'vitest'
import { STAGES, getStage, stageIndex, nextStage, FIRST_STAGE, LEVELS } from '../data/coding/stages'
import { PROBLEMS, getProblem, problemCatalog } from '../data/coding/problems'
import { candidateDecisions, type Turn } from '../lib/coding/conversation'
import { reviveSession, sanitize, type SessionState } from '../lib/coding/persistence'

describe('coding stages', () => {
  it('starts at clarify and ends at verify', () => {
    expect(FIRST_STAGE.id).toBe('clarify')
    expect(STAGES[STAGES.length - 1].id).toBe('verify')
  })

  it('every stage carries a full mid/senior/staff rubric', () => {
    for (const s of STAGES) {
      expect(s.levelRubric.mid).toBeTruthy()
      expect(s.levelRubric.senior).toBeTruthy()
      expect(s.levelRubric.staff).toBeTruthy()
    }
  })

  it('navigates stages in order and stops at the end', () => {
    expect(stageIndex('optimal')).toBe(2)
    expect(nextStage('clarify')!.id).toBe('bruteforce')
    expect(nextStage('verify')).toBeNull()
  })

  it('falls back to the first stage for unknown ids', () => {
    expect(getStage('nope').id).toBe(FIRST_STAGE.id)
  })

  it('escalation (curveballs) is enabled only on the optimal-approach stage', () => {
    expect(STAGES.filter((s) => s.escalate).map((s) => s.id)).toEqual(['optimal'])
  })

  it('levels run junior → staff', () => {
    expect(LEVELS).toEqual(['junior', 'mid', 'senior', 'staff'])
  })
})

describe('coding problems', () => {
  it('every problem has the hints used by the grader', () => {
    for (const p of PROBLEMS) {
      expect(p.statement).toBeTruthy()
      expect(p.hints.optimal).toBeTruthy()
      expect(p.hints.optimalComplexity).toBeTruthy()
      expect(p.examples.length).toBeGreaterThan(0)
    }
  })

  it('falls back to the first problem for unknown ids', () => {
    expect(getProblem('nope').id).toBe(PROBLEMS[0].id)
  })

  it('exposes a selector catalog whose ids all resolve back to real library problems', () => {
    const ids = new Set(PROBLEMS.map((p) => p.id))
    for (const c of problemCatalog()) expect(ids.has(c.id)).toBe(true)
  })
})

describe('coding conversation + persistence', () => {
  it('candidateDecisions keeps only candidate turns', () => {
    const transcript: Turn[] = [
      { role: 'interviewer', text: 'What is your approach?' },
      { role: 'candidate', text: 'Use a hash map.' },
      { role: 'candidate', text: 'O(n) time.' },
    ]
    expect(candidateDecisions(transcript)).toBe('Use a hash map. O(n) time.')
  })

  it('sanitize drops a fresh pick with no active problem', () => {
    expect(sanitize({ phase: 'pick', problemId: null })).toBeNull()
  })

  it('sanitize restores an in-progress session with its code + language', () => {
    const state: Partial<SessionState> = {
      id: 'x',
      phase: 'interview',
      problemId: 'two-sum',
      currentIndex: 3,
      sessions: { code: { transcript: [], coverage: null, aligned: false } },
      language: 'javascript',
      code: 'function f(){}',
    }
    const out = sanitize(state)
    expect(out?.problemId).toBe('two-sum')
    expect(out?.language).toBe('javascript')
    expect(out?.code).toBe('function f(){}')
    expect(out?.thinking).toBe(false)
  })

  it('reviveSession parses a stored blob', () => {
    expect(reviveSession('not json')).toBeNull()
  })
})
