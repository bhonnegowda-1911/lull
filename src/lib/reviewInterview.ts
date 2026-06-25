import { chatStructured } from './llmClient'
import {
  INTERVIEW_REVIEW_MODEL,
  INTERVIEW_REVIEW_SCHEMA,
  INTERVIEW_REVIEW_SYSTEM,
} from '../data/interviewReviewCriteria'
import type { InterviewReview, Transcript } from '../types'

// Grades a recorded interview from its transcript in one LLM call: the model classifies the round
// type and scores it against that bar (see interviewReviewCriteria). A long interview is a large
// prompt, so we give the model room (high effort + a generous max_tokens for the per-question
// breakdown) and run it on the REPORT tier (Opus).

export interface ReviewInterviewInput {
  transcript: Transcript
  /** Optional user-entered context (e.g. "Stripe — backend screen") to steer classification. */
  label?: string | null
  signal?: AbortSignal
}

function buildUserMessage({ transcript, label }: { transcript: Transcript; label?: string | null }): string {
  const lines: string[] = []
  if (label && label.trim()) {
    lines.push(`CANDIDATE'S NOTE ON THIS RECORDING (context only — verify against the transcript): ${label.trim()}`)
    lines.push('')
  }
  const dur = transcript.durationSec
  lines.push(dur ? `INTERVIEW TRANSCRIPT (~${Math.round(dur / 60)} min, ASR, no speaker labels):` : 'INTERVIEW TRANSCRIPT (ASR, no speaker labels):')
  lines.push(transcript.text?.trim() || '(empty transcript)')
  return lines.join('\n')
}

export async function reviewInterview({ transcript, label, signal }: ReviewInterviewInput): Promise<InterviewReview> {
  const { parsed } = await chatStructured<InterviewReview>({
    provider: 'anthropic',
    model: INTERVIEW_REVIEW_MODEL,
    system: INTERVIEW_REVIEW_SYSTEM,
    user: buildUserMessage({ transcript, label }),
    schema: INTERVIEW_REVIEW_SCHEMA,
    maxTokens: 6000,
    thinking: 'adaptive',
    effort: 'high',
    signal,
  })
  return parsed
}
