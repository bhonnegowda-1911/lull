import { chatStructured } from '../llmClient'
import { RESUME_FIT_CRITERIA } from '../../data/resumeCriteria'
import type { Story } from '../../data/stories'
import type { ParsedJob, ResumeFit } from '../../types'

// Score a resume against a parsed job. The candidate's story-bank titles + themes are passed in so
// the grader can mark a gap 'add_story' when a story already covers it — closing the loop to the
// rest of the app. Prompt + schema are data (resumeCriteria.ts). One LLM call.

// A stable fingerprint of the inputs that determine a fit result: the resume, the parsed JD, and the
// story titles/themes the grader sees. Persisted alongside a cached run so the UI can reuse it when
// nothing changed and flag it stale (re-check) when it did — mirrors prepInputSignature. djb2 keeps
// the stored string tiny instead of hoarding the whole resume on the application row.
export function fitInputSignature({
  resumeText,
  job,
  stories = [],
}: {
  resumeText: string
  job: ParsedJob
  stories?: Story[]
}): string {
  const payload = JSON.stringify({
    resume: resumeText.trim(),
    job,
    stories: stories.map((s) => ({ title: s.title, themes: s.themes })),
  })
  let h = 5381
  for (let i = 0; i < payload.length; i++) h = ((h << 5) + h + payload.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

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
    // Opus 4.7 rejects `temperature` — omit it (steer via prompt instead).
    signal,
  })
  return parsed
}
