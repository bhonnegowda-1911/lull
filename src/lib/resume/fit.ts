import { chatStructured } from '../llmClient'
import { GRADING_TEMPERATURE } from '../models'
import { RESUME_FIT_CRITERIA } from '../../data/resumeCriteria'
import type { Story } from '../../data/stories'
import type { ParsedJob, ResumeFit } from '../../types'

// Score a resume against a parsed job. The candidate's story-bank titles + themes are passed in so
// the grader can mark a gap 'add_story' when a story already covers it — closing the loop to the
// rest of the app. Prompt + schema are data (resumeCriteria.ts). One LLM call.

export async function analyzeResumeFit({
  resumeText,
  job,
  stories = [],
  signal,
}: {
  resumeText: string
  job: ParsedJob
  stories?: Story[]
  signal?: AbortSignal
}): Promise<ResumeFit> {
  const storyBank = stories.length
    ? `CANDIDATE STORY BANK (titles + themes — use to mark gaps 'add_story' when one covers it):\n` +
      stories.map((s) => `- ${s.title}${s.themes.length ? ` [${s.themes.join(', ')}]` : ''}`).join('\n')
    : 'CANDIDATE STORY BANK: (empty)'

  const user = [
    `TARGET JOB (parsed):\n${JSON.stringify(job, null, 2)}`,
    '',
    `CANDIDATE RESUME:\n${resumeText.trim() || '(no resume on file)'}`,
    '',
    storyBank,
  ].join('\n')

  const { parsed } = await chatStructured<ResumeFit>({
    provider: 'anthropic',
    model: RESUME_FIT_CRITERIA.model,
    system: RESUME_FIT_CRITERIA.systemPrompt,
    user,
    schema: RESUME_FIT_CRITERIA.schema,
    maxTokens: 2500,
    temperature: GRADING_TEMPERATURE,
    signal,
  })
  return parsed
}
