import { chatStructured } from './llmClient'
import { DEFAULT_MODEL } from './models'
import type { BehavioralLevel, Transcript } from '../types'

// Real interviewers probe. These two calls simulate that: generate follow-up questions
// tailored to what the candidate actually said, then briefly assess each spoken response.
//
// Interview realism: the interviewer is aware of the candidate's RESUME and holds them to a
// TARGET LEVEL bar (senior/staff). It does NOT see the story bank — only the resume and what they
// say in the room. The bar shapes how hard it probes and when it throws a curveball, mirroring the
// `escalate` pattern in the system-design stages.

const MODEL = DEFAULT_MODEL

export interface Followup {
  question: string
  rationale: string
}

const LEVEL_BAR: Record<BehavioralLevel, string> = {
  junior: 'a junior bar: confirm basic ownership and clarity.',
  mid: 'a mid bar: push for the specific decisions and tradeoffs behind their choices.',
  senior:
    'a senior bar: push on scope, quantified impact, cross-team influence, and the tradeoffs they weighed — and probe whether the work was really theirs vs. the team.',
  staff:
    'a staff bar: push on org-level scope, ambiguity navigated, strategic framing, and second-order consequences; make them justify why this was the highest-leverage thing to do.',
  principal:
    'a principal bar: push on company-wide impact, setting direction for others, and shaping strategy under deep ambiguity.',
}

function generateSystem(targetLevel: BehavioralLevel): string {
  return `You are a sharp interviewer running a behavioral interview. Given the question and the
candidate's spoken answer (and their resume, when provided), write 2-3 follow-up questions a strong
interviewer would actually ask next. Probe the weak or vague spots: their SPECIFIC personal role
("what exactly did YOU do?"), tradeoffs and alternatives they skipped, missing metrics or outcomes,
and self-awareness ("what would you do differently?"). Each follow-up is one sentence,
conversational, and grounded in something they actually said or in their resume. Do not re-ask the
original question.

Hold the candidate to ${LEVEL_BAR[targetLevel] ?? LEVEL_BAR.senior} ESCALATE when they're clearing
the bar: throw ONE realistic curveball that tests the next level up — a raised-stakes "what if the
scope had been 10x", a harder tradeoff, or a "what would have made this org-wide impact" — rather
than piling on shallow questions. You may reference their resume to probe (e.g. tie the story to a
role they list), but never assume facts beyond the resume and what they said.`
}

export const GENERATE_SCHEMA = {
  type: 'object',
  properties: {
    followups: {
      type: 'array',
      description: '2-3 tailored follow-up questions, sharpest first.',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The follow-up, one sentence.' },
          rationale: { type: 'string', description: 'Briefly, what this probes (for the candidate).' },
        },
        required: ['question', 'rationale'],
        additionalProperties: false,
      },
    },
  },
  required: ['followups'],
  additionalProperties: false,
}

/** Generate follow-up questions tailored to the candidate's answer, at the target-level bar. */
export async function generateFollowups({
  question,
  transcript,
  resume,
  targetLevel = 'senior',
  signal,
}: {
  question: string
  transcript: Transcript
  resume?: string
  targetLevel?: BehavioralLevel
  signal?: AbortSignal
}): Promise<Followup[]> {
  const user = [
    resume?.trim() ? `CANDIDATE RESUME (context — do not assume facts beyond it):\n${resume.trim()}\n` : '',
    `ORIGINAL QUESTION:\n${question}`,
    '',
    `CANDIDATE'S ANSWER:\n${transcript?.text || '(empty)'}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { parsed } = await chatStructured<{ followups?: Followup[] }>({
    provider: 'anthropic',
    model: MODEL,
    system: generateSystem(targetLevel),
    user,
    schema: GENERATE_SCHEMA,
    maxTokens: 600,
    signal,
  })
  return parsed.followups || []
}
