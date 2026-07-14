import { describe, expect, it } from 'vitest'
import { resumeToDocxBlob } from '../lib/resume/docx'
import type { GeneratedResume } from '../types'

// Smoke test: the docx builder uses a fair bit of the `docx` API (numbering, tab stops, borders); this
// asserts a real .docx is produced without throwing, catching API misuse that types alone won't.

const resume: GeneratedResume = {
  header: { name: 'Ada Lovelace', title: 'Senior Backend Engineer', contact: 'ada@example.com · NYC' },
  summary: 'Backend engineer who ships reliable payment systems.',
  skills: [{ category: 'Languages', items: ['Go', 'Python'] }],
  experience: [
    {
      company: 'Acme',
      role: 'Senior Engineer',
      dates: '2021–present',
      bullets: [
        { text: 'Cut billing latency', sourceStoryId: 's1', sourceProjectId: null, sourceResume: false, metric: 'p99 800ms → 300ms' },
        { text: 'Led the payments rewrite', sourceStoryId: null, sourceProjectId: null, sourceResume: true },
      ],
    },
  ],
}

describe('resumeToDocxBlob', () => {
  it('produces a non-empty .docx blob', async () => {
    const blob = await resumeToDocxBlob(resume)
    expect(blob.size).toBeGreaterThan(0)
  })

  it('handles a sparse resume (no title/contact/skills) without throwing', async () => {
    const bare: GeneratedResume = { header: { name: 'Jane', title: '', contact: '' }, summary: '', skills: [], experience: [] }
    const blob = await resumeToDocxBlob(bare)
    expect(blob.size).toBeGreaterThan(0)
  })
})
