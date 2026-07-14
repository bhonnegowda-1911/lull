import { describe, expect, it } from 'vitest'
import { serializeGapAnswers } from '../lib/resume/gapReview'
import type { ParsedJob } from '../types'

// The LLM call isn't tested; this covers the pure serialization the reviewer sends.

const job: ParsedJob = {
  title: 'Senior Backend Engineer',
  company: 'StreamCo',
  seniority: 'senior',
  mustHaveSkills: [{ skill: 'Kafka', category: 'framework' }, { skill: 'Go', category: 'language' }],
  niceToHaveSkills: [],
  responsibilities: [],
  keywords: [],
}

describe('serializeGapAnswers', () => {
  it('includes the job, must-haves, and each answer with its requirement', () => {
    const out = serializeGapAnswers({
      job,
      answers: [
        { requirement: 'Kafka event streaming', note: 'Built a billing pipeline on Kafka' },
        { requirement: 'Go', note: 'Wrote services in Go' },
      ],
    })
    expect(out).toContain('Senior Backend Engineer @ StreamCo (senior)')
    expect(out).toContain('MUST-HAVES: Kafka, Go')
    expect(out).toContain('ANSWER 1')
    expect(out).toContain('Requirement: Kafka event streaming')
    expect(out).toContain('Built a billing pipeline on Kafka')
    expect(out).toContain('ANSWER 2')
  })

  it('marks a blank answer rather than dropping the slot', () => {
    const out = serializeGapAnswers({ job, answers: [{ requirement: 'Go', note: '' }] })
    expect(out).toContain("Candidate's answer: (blank)")
  })
})
