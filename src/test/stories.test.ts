import { describe, it, expect } from 'vitest'
import { matchStories } from '../lib/stories/match'
import { emptyStory, STORY_THEMES, type Story } from '../data/stories'

// Build a story with overrides on top of the blank template.
function makeStory(over: Partial<Story>): Story {
  return { ...emptyStory(over.id ?? Math.random().toString(36).slice(2)), ...over }
}

describe('story themes vocabulary', () => {
  it('mirrors the behavioral prompt categories', () => {
    // matchStories relies on story.themes using the same vocabulary as prompt.category.
    expect(STORY_THEMES).toContain('Conflict')
    expect(STORY_THEMES.length).toBeGreaterThan(0)
  })
})

describe('matchStories', () => {
  const conflictConfirmed = makeStory({ id: 'a', themes: ['Conflict'], status: 'confirmed' })
  const conflictDraft = makeStory({ id: 'b', themes: ['Conflict'], status: 'draft' })
  const leadershipConfirmed = makeStory({ id: 'c', themes: ['Leadership & influence'], status: 'confirmed' })
  const multiTheme = makeStory({ id: 'd', themes: ['Conflict', 'Execution'], status: 'confirmed' })
  const all = [conflictConfirmed, conflictDraft, leadershipConfirmed, multiTheme]

  it('returns confirmed stories whose themes include the prompt category', () => {
    const ids = matchStories('Conflict', all).map((s) => s.id)
    expect(ids).toContain('a')
    expect(ids).toContain('d')
    expect(ids).not.toContain('c') // different theme
  })

  it('excludes drafts by default (only confirmed stories are trustworthy ground truth)', () => {
    const ids = matchStories('Conflict', all).map((s) => s.id)
    expect(ids).not.toContain('b')
  })

  it('can include drafts when confirmedOnly is false', () => {
    const ids = matchStories('Conflict', all, { confirmedOnly: false }).map((s) => s.id)
    expect(ids).toContain('b')
  })

  it('returns an empty array when nothing matches the category', () => {
    expect(matchStories('Growth & feedback', all)).toEqual([])
  })

  it('respects the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => makeStory({ id: `s${i}`, themes: ['Conflict'], status: 'confirmed' }))
    expect(matchStories('Conflict', many, { limit: 3 })).toHaveLength(3)
  })
})
