import { describe, expect, it } from 'vitest'
import { gapFillsToStories, resumeFileName, resumeToMarkdown, serializeSources, serializeTailoringTargets, trimResumeToOnePage, ungroundedBullets } from '../lib/resume/generate'
import { DEFAULT_PROFILE, emptyStory, type Story } from '../data/stories'
import { emptyProject, type Project } from '../data/projects'
import type { GeneratedResume, ResumeFit } from '../types'

// The LLM call in generate.ts isn't tested; these cover the pure source-serialization, the markdown
// rendering used for export + re-scoring, and the provenance grounding check.

function sampleStory(): Story {
  const s = emptyStory('story-1')
  s.title = 'Cut billing latency 40%'
  s.star = { situation: 'Slow batch', task: 'Speed it up', actions: ['Rewrote pipeline'], result: 'p99 dropped', takeaway: 'Design the failure path first' }
  s.impact = { metrics: ['p99 800ms → 480ms'], ownership: 'i', blastRadius: 'team' }
  return s
}

function sampleProject(): Project {
  const p = emptyProject('proj-1')
  p.title = 'Event-driven billing'
  p.summary = 'Rewrote billing to events'
  p.facets.technicalDepth = { situation: '', task: '', action: '', result: '', text: 'Sharded the ledger' }
  return p
}

describe('serializeSources', () => {
  it('emits story and project ids the model must cite as provenance', () => {
    const out = serializeSources({
      profile: { ...DEFAULT_PROFILE, roles: [{ company: 'Acme', title: 'Senior Eng' }] },
      stories: [sampleStory()],
      projects: [sampleProject()],
    })
    expect(out).toContain('id=story-1')
    expect(out).toContain('id=proj-1')
    expect(out).toContain('Senior Eng @ Acme')
    expect(out).toContain('p99 800ms → 480ms')
    expect(out).toContain('Sharded the ledger') // non-empty facet text is included
  })

  it('handles an empty bank without throwing', () => {
    const out = serializeSources({ profile: DEFAULT_PROFILE, stories: [], projects: [] })
    expect(out).toContain('(no stories)')
    expect(out).toContain('(no projects)')
    expect(out).toContain('(no resume on file)')
  })

  it('includes the existing resume text as a source', () => {
    const out = serializeSources({
      profile: { ...DEFAULT_PROFILE, resumeText: 'Senior Eng at Acme, 2021–present. Cut billing latency 40%.' },
      stories: [],
      projects: [],
    })
    expect(out).toContain('EXISTING RESUME')
    expect(out).toContain('Cut billing latency 40%')
  })
})

describe('serializeTailoringTargets', () => {
  const fit: ResumeFit = {
    fitScore: 62,
    verdict: 'plausible',
    seniorityMatch: { jdLevel: 'senior', resumeImpliedLevel: 'senior', assessment: 'match', note: '' },
    requirementCoverage: [
      { requirement: 'Kubernetes at scale', status: 'covered', evidence: 'Ran EKS', severity: 'high' },
      { requirement: 'Kafka event streaming', status: 'partial', evidence: null, severity: 'high' },
      { requirement: 'Go', status: 'missing', evidence: null, severity: 'medium' },
    ],
    keywordCoverage: { matched: ['AWS'], missing: ['Kafka', 'gRPC'], coveragePct: 40 },
    quantifiedImpact: { score: 3, note: '' },
    gaps: [
      { title: 'Streaming pipelines', detail: 'Your billing project used events', severity: 'high', fixable: 'add_story' },
      { title: 'Owns SLOs', detail: 'Likely done but not shown', severity: 'medium', fixable: 'reword' },
      { title: 'PhD required', detail: 'No advanced degree', severity: 'low', fixable: 'genuine_gap' },
    ],
    strengths: [],
    summary: '',
  }

  it('lists under-evidenced requirements and missing keywords to surface', () => {
    const out = serializeTailoringTargets(fit)
    expect(out).toContain('Kafka, gRPC') // missing keywords
    expect(out).toContain('Kafka event streaming') // partial requirement
    expect(out).toContain('Go') // missing requirement
    expect(out).not.toContain('Kubernetes at scale') // already covered — not a target
  })

  it('separates closeable gaps from genuine gaps it must not fabricate', () => {
    const out = serializeTailoringTargets(fit)
    expect(out).toContain('(add_story) Streaming pipelines')
    expect(out).toContain('(reword) Owns SLOs')
    expect(out).toContain('GENUINE gaps')
    expect(out).toContain('PhD required')
  })
})

describe('gapFillsToStories', () => {
  it('turns answered gaps into grounded stories and drops empty ones', () => {
    const out = gapFillsToStories([
      { requirement: 'Kafka event streaming', note: 'Built a 2M events/day billing pipeline on Kafka' },
      { requirement: 'Go', note: '   ' }, // blank — skipped
      { requirement: 'Owns SLOs', note: 'Defined and owned the checkout SLO' },
    ])
    expect(out).toHaveLength(2)
    expect(out[0].id).toBe('gapfill-0')
    expect(out[0].title).toBe('Kafka event streaming')
    expect(out[0].star.situation).toContain('2M events/day')
    // index is preserved from the original gap position, so ids stay stable/checkable
    expect(out[1].id).toBe('gapfill-2')
    expect(out[1].title).toBe('Owns SLOs')
  })

  it('produces stories serializeSources emits with citable ids', () => {
    const stories = gapFillsToStories([{ requirement: 'gRPC APIs', note: 'Shipped internal gRPC services' }])
    const out = serializeSources({ profile: DEFAULT_PROFILE, stories, projects: [] })
    expect(out).toContain('id=gapfill-0')
    expect(out).toContain('Shipped internal gRPC services')
  })
})

describe('resumeToMarkdown', () => {
  it('renders header, skills, and bullets with metrics', () => {
    const resume: GeneratedResume = {
      header: { name: 'Ada Lovelace', title: 'Senior Backend Engineer', contact: 'ada@example.com · NYC' },
      summary: 'Builds reliable systems.',
      skills: [{ category: 'Languages', items: ['Go', 'Python'] }],
      experience: [
        {
          company: 'Acme',
          role: 'Senior Eng',
          dates: '2021–present',
          bullets: [{ text: 'Cut billing latency', sourceStoryId: 'story-1', sourceProjectId: null, sourceResume: false, metric: 'p99 800ms → 480ms' }],
        },
      ],
    }
    const md = resumeToMarkdown(resume)
    expect(md).toContain('# Ada Lovelace')
    expect(md).toContain('_Senior Backend Engineer_')
    expect(md).toContain('ada@example.com · NYC')
    expect(md).toContain('**Languages:** Go, Python')
    expect(md).toContain('- Cut billing latency (p99 800ms → 480ms)')
  })
})

describe('trimResumeToOnePage', () => {
  const bullet = (text: string) => ({ text, sourceStoryId: null, sourceProjectId: null, sourceResume: true })
  const role = (n: number) => ({
    company: `Co${n}`,
    role: `Role ${n}`,
    dates: '',
    bullets: Array.from({ length: 10 }, (_, i) => bullet(`r${n} b${i}`)),
  })
  const base = (roles: number): GeneratedResume => ({
    header: { name: 'n', title: 't', contact: 'c' },
    summary: 's',
    skills: [],
    experience: Array.from({ length: roles }, (_, i) => role(i)),
  })

  it('caps the most recent role at 5 bullets and older roles at 3', () => {
    const out = trimResumeToOnePage(base(3))
    expect(out.experience[0].bullets).toHaveLength(5)
    expect(out.experience[1].bullets).toHaveLength(3)
    expect(out.experience[2].bullets).toHaveLength(3)
  })

  it('enforces a hard overall ceiling of 15 bullets', () => {
    const out = trimResumeToOnePage(base(8))
    const total = out.experience.reduce((n, e) => n + e.bullets.length, 0)
    expect(total).toBe(15) // 5 + 3 + 3 + 3 + 1, then 0 for the rest
    expect(out.experience[4].bullets).toHaveLength(1)
    expect(out.experience[5].bullets).toHaveLength(0)
  })

  it('keeps the model’s bullet order and never lengthens a short role', () => {
    const r = base(1)
    r.experience[0].bullets = [bullet('a'), bullet('b')]
    const out = trimResumeToOnePage(r)
    expect(out.experience[0].bullets.map((b) => b.text)).toEqual(['a', 'b'])
  })
})

describe('resumeFileName', () => {
  it('slugifies the name into a safe .pdf filename', () => {
    expect(resumeFileName({ header: { name: 'Ada B. Lovelace!', title: '', contact: '' }, summary: '', skills: [], experience: [] })).toBe(
      'ada-b-lovelace-resume.pdf',
    )
    expect(resumeFileName({ header: { name: '', title: '', contact: '' }, summary: '', skills: [], experience: [] })).toBe('resume.pdf')
  })
})

describe('ungroundedBullets', () => {
  const resume: GeneratedResume = {
    header: { name: 'n', title: 't', contact: 'c' },
    summary: '',
    skills: [],
    experience: [
      {
        company: 'Acme',
        role: 'Eng',
        dates: '',
        bullets: [
          { text: 'grounded in a story', sourceStoryId: 'story-1', sourceProjectId: null, sourceResume: false },
          { text: 'grounded in a project', sourceStoryId: null, sourceProjectId: 'proj-1', sourceResume: false },
          { text: 'reused from resume', sourceStoryId: null, sourceProjectId: null, sourceResume: true },
          { text: 'invented bullet', sourceStoryId: 'ghost', sourceProjectId: null, sourceResume: false },
        ],
      },
    ],
  }

  it('flags only bullets that trace to no story, project, or the resume', () => {
    const bad = ungroundedBullets(resume, { storyIds: new Set(['story-1']), projectIds: new Set(['proj-1']) })
    expect(bad).toEqual(['invented bullet'])
  })
})
