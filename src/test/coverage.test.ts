import { describe, expect, it } from 'vitest'
import { computeThemeCoverage, coveredThemeCount } from '../lib/stories/coverage'
import { emptyStory, STORY_THEMES, type Story } from '../data/stories'
import { emptyProject, type Project } from '../data/projects'

function storyWithThemes(id: string, themes: string[]): Story {
  return { ...emptyStory(id), themes }
}

describe('computeThemeCoverage', () => {
  it('counts stories tagged with a theme', () => {
    const stories = [storyWithThemes('a', ['Conflict']), storyWithThemes('b', ['Conflict', 'Execution'])]
    const cov = computeThemeCoverage(stories, [])
    expect(cov.find((c) => c.theme === 'Conflict')?.storyCount).toBe(2)
    expect(cov.find((c) => c.theme === 'Execution')?.storyCount).toBe(1)
    expect(cov.find((c) => c.theme === 'Teamwork')?.storyCount).toBe(0)
  })

  it('counts a project via a non-empty facet that maps to the theme', () => {
    // disagreeCommit maps to 'Conflict'; prioritization maps to 'Execution'.
    const p: Project = emptyProject('p1')
    p.facets.disagreeCommit = { situation: '', task: '', action: '', result: '', text: 'I pushed back with data.' }
    const cov = computeThemeCoverage([], [p])
    expect(cov.find((c) => c.theme === 'Conflict')?.projectCount).toBe(1)
    expect(cov.find((c) => c.theme === 'Execution')?.projectCount).toBe(0)
  })

  it('returns one entry per theme, with total = stories + projects', () => {
    const cov = computeThemeCoverage([storyWithThemes('a', ['Impact'])], [])
    // One entry per competency theme (themes === behavioral prompt categories).
    expect(cov).toHaveLength(STORY_THEMES.length)
    const impact = cov.find((c) => c.theme === 'Impact')!
    expect(impact.total).toBe(impact.storyCount + impact.projectCount)
  })
})

describe('coveredThemeCount', () => {
  it('counts only themes with at least one source', () => {
    const cov = computeThemeCoverage([storyWithThemes('a', ['Impact', 'Execution'])], [])
    expect(coveredThemeCount(cov)).toBe(2)
  })
})
