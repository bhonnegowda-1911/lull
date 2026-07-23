import { chatStructured } from '../llmClient'
import { COACHING_EXTRAS_PROMPT, COACHING_EXTRAS_SCHEMA } from '../../data/criteria'
import { DEFAULT_MODEL } from '../models'
import type { Story } from '../../data/stories'
import type { Project } from '../../data/projects'
import type { JobFit, ParsedJob, StoryFidelity, Transcript } from '../../types'
import { jobBlock, projectsBlock, storiesBlock } from './llmAnalyzer'

// Coaching-mode / job-mode extras: the content critique against the candidate's true stories
// (storyFidelity) and the company/JD fit (jobFit). These need real ground truth / a target job, so
// unlike the spoken script (which runs on every coaching grade — see scriptAnalyzer) this call only
// fires when that input exists. Separate from the STAR grade because the combined constrained-decoding
// grammar exceeds the gateway's size limit. Runs in parallel with the grade; best-effort — a failure
// here must never fail the graded result.

export interface ExtrasInput {
  question: string
  transcript: Transcript
  stories?: Story[]
  projects?: Project[]
  job?: ParsedJob | null
  signal?: AbortSignal
}

export interface CoachingExtras {
  storyFidelity?: StoryFidelity
  jobFit?: JobFit
}

// Returns null when there's nothing to produce (no ground truth and no target job) or on failure.
export async function generateCoachingExtras({
  question,
  transcript,
  stories,
  projects,
  job,
  signal,
}: ExtrasInput): Promise<CoachingExtras | null> {
  const hasGroundTruth = Boolean(stories?.length || projects?.length)
  if (!hasGroundTruth && !job) return null

  const lines: string[] = []
  lines.push(`INTERVIEW QUESTION:\n${question || '(none provided)'}`)
  lines.push('')
  lines.push('SPOKEN ANSWER:')
  lines.push(transcript?.text || '(empty transcript)')
  if (stories?.length) {
    lines.push('')
    lines.push(storiesBlock(stories))
  }
  if (projects?.length) {
    lines.push('')
    lines.push(projectsBlock(projects))
  }
  if (job) {
    lines.push('')
    lines.push(jobBlock(job))
  }

  try {
    const { parsed } = await chatStructured<CoachingExtras>({
      provider: 'anthropic',
      model: DEFAULT_MODEL,
      system: COACHING_EXTRAS_PROMPT,
      user: lines.join('\n'),
      schema: COACHING_EXTRAS_SCHEMA,
      maxTokens: 2500,
      signal,
    })
    const extras: CoachingExtras = {}
    if (parsed.storyFidelity) extras.storyFidelity = parsed.storyFidelity
    if (parsed.jobFit) extras.jobFit = parsed.jobFit
    return Object.keys(extras).length ? extras : null
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    console.warn('[extras] coaching-extras generation failed:', (e as Error)?.message)
    return null
  }
}
