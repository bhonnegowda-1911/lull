import { describe, expect, it } from 'vitest'
import { resumeToMarkdown, serializeSources, ungroundedBullets } from '../lib/resume/generate'
import { DEFAULT_PROFILE, emptyStory, type Story } from '../data/stories'
import { emptyProject, type Project } from '../data/projects'
import type { GeneratedResume } from '../types'

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

describe('resumeToMarkdown', () => {
  it('renders header, skills, and bullets with metrics', () => {
    const resume: GeneratedResume = {
      header: { headline: 'Backend engineer who ships', targetRole: 'Senior Backend' },
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
    expect(md).toContain('# Backend engineer who ships')
    expect(md).toContain('**Languages:** Go, Python')
    expect(md).toContain('- Cut billing latency (p99 800ms → 480ms)')
  })
})

describe('ungroundedBullets', () => {
  const resume: GeneratedResume = {
    header: { headline: 'h', targetRole: 'r' },
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
