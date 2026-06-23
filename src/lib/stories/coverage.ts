import { STORY_THEMES, type Story } from '../../data/stories'
import { FACETS, facetText, type Project } from '../../data/projects'

// Theme coverage: for each of the fixed competency themes (STORY_THEMES === the behavioral prompt
// categories), how much ground truth covers it — confirmed stories tagged with the theme, plus
// projects with a non-empty facet that maps to it. This is the same theme→category logic
// matchStories/matchProjects use to pull ground truth into a rep, aggregated so gaps are visible.
// Pure, so it's unit-tested.

export interface ThemeCoverage {
  theme: string
  storyCount: number
  projectCount: number
  /** storyCount + projectCount — 0 means an uncovered gap. */
  total: number
}

export function computeThemeCoverage(stories: Story[], projects: Project[]): ThemeCoverage[] {
  return STORY_THEMES.map((theme) => {
    const storyCount = stories.filter((s) => s.themes.includes(theme)).length
    const facetIds = FACETS.filter((f) => f.categories.includes(theme)).map((f) => f.id)
    const projectCount = projects.filter((p) =>
      facetIds.some((id) => facetText(p.facets?.[id]).trim().length > 0),
    ).length
    return { theme, storyCount, projectCount, total: storyCount + projectCount }
  })
}

/** How many of the themes have at least one source covering them. */
export function coveredThemeCount(coverage: ThemeCoverage[]): number {
  return coverage.filter((c) => c.total > 0).length
}
