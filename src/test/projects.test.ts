import { describe, it, expect } from 'vitest'
import {
  FACETS,
  emptyProject,
  facetPrompt,
  facetsForCategory,
  matchProjects,
  toFacetAnswer,
  type FacetAnswer,
  type FacetId,
  type Project,
} from '../data/projects'

// Facets are now FacetAnswer objects; tests still pass the convenient string form, normalized here.
function makeProject(
  over: Partial<Omit<Project, 'facets'>> & { id: string; facets?: Partial<Record<FacetId, string | FacetAnswer>> },
): Project {
  const base = emptyProject(over.id)
  const facets = { ...base.facets }
  if (over.facets) {
    for (const k of Object.keys(over.facets) as FacetId[]) facets[k] = toFacetAnswer(over.facets[k])
  }
  return { ...base, ...over, facets }
}

describe('facet template', () => {
  it('every facet maps to at least one prompt category and has a senior prompt', () => {
    for (const f of FACETS) {
      expect(f.categories.length).toBeGreaterThan(0)
      expect(f.prompts.senior).toBeTruthy()
    }
  })

  it('disagree & commit answers the Conflict category', () => {
    expect(facetsForCategory('Conflict')).toContain('disagreeCommit')
  })
})

describe('facetPrompt', () => {
  const ownership = FACETS.find((f) => f.id === 'ownership')!

  it('returns the level-specific prompt when present', () => {
    expect(facetPrompt(ownership, 'staff')).toBe(ownership.prompts.staff)
    expect(facetPrompt(ownership, 'mid')).toBe(ownership.prompts.mid)
  })

  it('falls back to the senior prompt when a level has none', () => {
    const otherHard = FACETS.find((f) => f.id === 'otherHardParts')!
    // otherHardParts defines no principal prompt → falls back to senior
    expect(otherHard.prompts.principal).toBeUndefined()
    expect(facetPrompt(otherHard, 'principal')).toBe(otherHard.prompts.senior)
  })
})

describe('emptyProject', () => {
  it('has every facet present and blank', () => {
    const p = emptyProject('x')
    for (const f of FACETS) {
      expect(p.facets[f.id].text).toBe('')
    }
    expect(p.targetLevelAtCapture).toBeNull()
  })
})

describe('matchProjects', () => {
  const ownsImpact = makeProject({ id: 'a', facets: { ownership: 'Owned billing end-to-end, org-wide' } })
  const hasConflict = makeProject({ id: 'b', facets: { disagreeCommit: 'Pushed back on the deadline' } })
  const blankOwnership = makeProject({ id: 'c', facets: { ownership: '   ' } }) // whitespace = empty
  const all = [ownsImpact, hasConflict, blankOwnership]

  it('returns projects with a non-empty facet mapped to the category', () => {
    const ids = matchProjects('Impact', all).map((p) => p.id) // Impact ← ownership/technicalDepth
    expect(ids).toContain('a')
    expect(ids).not.toContain('b')
  })

  it('skips projects whose relevant facet is blank or whitespace', () => {
    expect(matchProjects('Impact', [blankOwnership])).toEqual([])
  })

  it('matches the Conflict category via the disagreeCommit facet', () => {
    expect(matchProjects('Conflict', all).map((p) => p.id)).toEqual(['b'])
  })

  it('respects the limit', () => {
    const many = Array.from({ length: 8 }, (_, i) => makeProject({ id: `p${i}`, facets: { ownership: 'mine' } }))
    expect(matchProjects('Impact', many, 3)).toHaveLength(3)
  })
})
