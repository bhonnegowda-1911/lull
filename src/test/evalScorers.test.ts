import { describe, expect, it } from 'vitest'
import {
  numericTokens,
  numericHallucinations,
  identityPreserved,
  inventedSkillCategories,
  requirementCoverage,
  gapMarkersMissing,
  usesGapFillSource,
  overClaimedTerms,
} from '../evals/scorers'
import type { GeneratedResume, ParsedJob } from '../types'

// The deterministic (offline) eval scorers. These are the hard-failure layer — they must never green
// on a fabrication, so they're worth their own tests.

function resume(bullets: GeneratedResume['experience'][number]['bullets']): GeneratedResume {
  return {
    header: { name: 'Priya Nair', title: 'Senior Backend Engineer', contact: 'priya.nair@example.com · San Francisco' },
    summary: 'Backend engineer.',
    skills: [{ category: 'Languages', items: ['Go'] }],
    experience: [{ company: 'PayForge', role: 'Senior Backend Engineer', dates: '2021–present', bullets }],
  }
}

const job: ParsedJob = {
  title: 'Senior Backend Engineer',
  company: 'StreamCo',
  seniority: 'senior',
  mustHaveSkills: [{ skill: 'Kafka', category: 'framework' }, { skill: 'Go', category: 'language' }],
  niceToHaveSkills: [],
  responsibilities: [],
  keywords: ['Kafka', 'streaming'],
}

describe('numericTokens', () => {
  it('extracts reader-visible metrics', () => {
    expect(numericTokens('cut p99 to 480ms and processed 2M events, up 40%')).toEqual(expect.arrayContaining(['480ms', '2m', '40%']))
  })
})

describe('numericHallucinations', () => {
  it('flags a metric present in no source', () => {
    const r = resume([{ text: 'Processed 5M events/day', sourceStoryId: 's1', sourceProjectId: null, sourceResume: false, metric: '5M events/day' }])
    const bad = numericHallucinations(r, 'source mentions 2M events/day only')
    expect(bad).toContain('5m')
  })
  it('passes when every metric traces to a source', () => {
    const r = resume([{ text: 'Processed 2M events/day', sourceStoryId: 's1', sourceProjectId: null, sourceResume: false, metric: '2M events/day' }])
    expect(numericHallucinations(r, 'story: 2M events/day')).toEqual([])
  })
})

describe('identityPreserved', () => {
  const r = resume([])
  it('true when name + contact appear in the source resume', () => {
    expect(identityPreserved(r, 'Priya Nair — priya.nair@example.com — San Francisco')).toBe(true)
  })
  it('false when the contact was invented', () => {
    expect(identityPreserved(r, 'Priya Nair, based somewhere')).toBe(false)
  })
})

describe('inventedSkillCategories', () => {
  it('flags a category not in the source resume', () => {
    const r = { ...resume([]), skills: [{ category: 'Leadership', items: ['Mentoring'] }] }
    expect(inventedSkillCategories(r, 'Skills\nLanguages: Go')).toEqual(['Leadership'])
  })
  it('allows the sanctioned AI / Developer Tools category', () => {
    const r = { ...resume([]), skills: [{ category: 'AI / Developer Tools', items: ['Claude (AI-assisted coding)'] }] }
    expect(inventedSkillCategories(r, 'Skills\nLanguages: Go')).toEqual([])
  })
})

describe('requirementCoverage', () => {
  it('is the fraction of JD terms present in the resume', () => {
    const r = resume([{ text: 'Built Kafka pipelines in Go', sourceStoryId: 's1', sourceProjectId: null, sourceResume: false }])
    // terms: kafka, go, kafka, streaming → unique hits kafka+go present, streaming absent
    expect(requirementCoverage(r, job)).toBeCloseTo(3 / 4)
  })
})

describe('gap-fill scorers', () => {
  const withGap = resume([{ text: 'Ran billing on EKS across 40 nodes', sourceStoryId: 'gapfill-0', sourceProjectId: null, sourceResume: false }])
  it('gapMarkersMissing returns markers not surfaced', () => {
    expect(gapMarkersMissing(withGap, ['EKS'])).toEqual([])
    expect(gapMarkersMissing(withGap, ['Istio'])).toEqual(['Istio'])
  })
  it('usesGapFillSource detects a gapfill-cited bullet', () => {
    expect(usesGapFillSource(withGap)).toBe(true)
    expect(usesGapFillSource(resume([{ text: 'x', sourceStoryId: 's1', sourceProjectId: null, sourceResume: false }]))).toBe(false)
  })
})

describe('overClaimedTerms', () => {
  it('flags an unsupported term that leaked into the resume', () => {
    const r = resume([{ text: 'Led machine learning platform', sourceStoryId: 's1', sourceProjectId: null, sourceResume: false }])
    expect(overClaimedTerms(r, ['machine learning', 'PhD'])).toEqual(['machine learning'])
  })
})
