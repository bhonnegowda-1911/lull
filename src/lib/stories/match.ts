import type { Story } from '../../data/stories'

// Pick which bank stories are relevant to a given behavioral prompt, by theme overlap. Pure and
// unit-tested. Story themes use the same vocabulary as prompt categories (see data/stories.ts), so
// a story is a candidate for a prompt when its themes include that prompt's category. The grader
// is then handed these candidates to decide which the candidate actually told (and whether a
// different one would have been stronger).

export interface MatchOptions {
  /** Only consider confirmed stories (default true) — drafts aren't trustworthy ground truth yet. */
  confirmedOnly?: boolean
  /** Cap how many candidates to pass to the grader (keeps the prompt lean). */
  limit?: number
}

export function matchStories(
  promptCategory: string,
  stories: Story[],
  { confirmedOnly = true, limit = 5 }: MatchOptions = {},
): Story[] {
  const pool = confirmedOnly ? stories.filter((s) => s.status === 'confirmed') : stories
  const onTheme = pool.filter((s) => s.themes.includes(promptCategory))
  return onTheme.slice(0, limit)
}
