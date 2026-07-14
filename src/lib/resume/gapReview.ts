import { chatStructured } from '../llmClient'
import { GAP_REVIEW_CRITERIA } from '../../data/resumeCriteria'
import type { ParsedJob } from '../../types'

// Coach the candidate's gap-fill answers before generation: flag answers that lack a metric where the
// requirement expects impact, or that are too vague, and return follow-up questions. Non-blocking —
// the UI shows these as nudges (see journey/GapFiller.tsx). One structured LLM call. Prompt + schema
// live in resumeCriteria.ts (GAP_REVIEW_CRITERIA).

/** One gap answer to review: the JD requirement and the candidate's typed note. */
export interface GapAnswer {
  requirement: string
  note: string
}

/** The review of a single answer, aligned back to its requirement. */
export interface GapReview {
  requirement: string
  sufficient: boolean
  needsQuantification: boolean
  tooVague: boolean
  followups: string[]
}

/** Serialize the JD context + the answers to review. Pure, so it's unit-tested. Only non-empty
 *  answers are worth reviewing; callers should filter, but we guard here too. */
export function serializeGapAnswers({ job, answers }: { job: ParsedJob; answers: GapAnswer[] }): string {
  const jobLine = `TARGET JOB: ${job.title}${job.company ? ` @ ${job.company}` : ''} (${job.seniority})`
  const must = job.mustHaveSkills.length ? `MUST-HAVES: ${job.mustHaveSkills.map((s) => s.skill).join(', ')}` : ''
  const block = answers
    .map((a, i) => `ANSWER ${i + 1}\n  Requirement: ${a.requirement || '(unspecified)'}\n  Candidate's answer: ${a.note.trim() || '(blank)'}`)
    .join('\n\n')
  return [jobLine, must, '', block].filter(Boolean).join('\n')
}

/** Review each non-empty gap answer for quantification + specificity. Returns one review per answer
 *  passed in (empty answers are dropped before the call, so map results back by requirement). */
export async function reviewGapAnswers({
  job,
  answers,
  signal,
}: {
  job: ParsedJob
  answers: GapAnswer[]
  signal?: AbortSignal
}): Promise<GapReview[]> {
  const toReview = answers.filter((a) => a.note.trim())
  if (!toReview.length) return []
  const { parsed } = await chatStructured<{ reviews: GapReview[] }>({
    provider: 'anthropic',
    model: GAP_REVIEW_CRITERIA.model,
    system: GAP_REVIEW_CRITERIA.systemPrompt,
    user: serializeGapAnswers({ job, answers: toReview }),
    schema: GAP_REVIEW_CRITERIA.schema,
    maxTokens: 1200,
    signal,
  })
  return parsed.reviews ?? []
}
