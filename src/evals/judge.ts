import { chatStructured } from '../lib/llmClient'
import { resumeToMarkdown } from '../lib/resume/generate'
import { RESUME_MODEL } from '../lib/models'
import type { GeneratedResume } from '../types'

// L3 of the eval: an LLM judge for the qualities deterministic checks can't see — did the tailored
// resume keep the candidate's own summary voice, avoid buzzword inflation, and actually lean toward
// the JD without fabricating? Judges against the candidate's ORIGINAL resume so "preserved voice" is
// checkable. Scores are 1–5; treat <4 as a soft failure worth reading the notes on.

export interface ResumeJudgement {
  voicePreserved: number
  buzzwordFree: number
  tailored: number
  grounded: number
  notes: string
}

const JUDGE_SYSTEM = `You are a meticulous resume-quality judge. You are given a candidate's ORIGINAL
resume and a GENERATED tailored resume plus the target job. Score the generated resume 1–5 on each
axis, being strict — reserve 5 for genuinely excellent:
- voicePreserved: does the summary keep the candidate's own wording/voice from the original (not a
  generic synthesized paragraph)? 5 = clearly their voice, lightly tailored; 1 = replaced wholesale.
- buzzwordFree: free of empty buzzword stacking ("battle-tested", "results-driven", "0 to 1")? 5 =
  plain and concrete; 1 = LinkedIn-headline soup.
- tailored: does it lead with and echo the JD's real requirements using the candidate's actual
  experience? 5 = sharply targeted; 1 = ignores the JD.
- grounded: does every claim look supportable by the original resume (no invented employers, titles,
  or metrics)? 5 = fully grounded; 1 = clearly fabricated.
Explain the lowest score in one sentence in notes.`

const SCHEMA = {
  type: 'object',
  properties: {
    voicePreserved: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    buzzwordFree: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    tailored: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    grounded: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    notes: { type: 'string' },
  },
  required: ['voicePreserved', 'buzzwordFree', 'tailored', 'grounded', 'notes'],
  additionalProperties: false,
}

export async function judgeResume(args: {
  original: string
  generated: GeneratedResume
  jobText: string
  signal?: AbortSignal
}): Promise<ResumeJudgement> {
  const user = [
    `TARGET JOB:\n${args.jobText}`,
    '',
    `ORIGINAL RESUME:\n${args.original}`,
    '',
    `GENERATED RESUME:\n${resumeToMarkdown(args.generated)}`,
  ].join('\n')
  const { parsed } = await chatStructured<ResumeJudgement>({
    provider: 'anthropic',
    model: RESUME_MODEL,
    system: JUDGE_SYSTEM,
    user,
    schema: SCHEMA,
    maxTokens: 600,
    signal: args.signal,
  })
  return parsed
}
