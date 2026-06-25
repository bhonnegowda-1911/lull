import { chatStructured } from './llmClient'
import { GEN_MODEL } from './models'
import type { BehavioralLevel, InterviewerPersona, Transcript } from '../types'

// Real interviewers probe. These two calls simulate that: generate follow-up questions
// tailored to what the candidate actually said, then briefly assess each spoken response.
//
// Interview realism: the interviewer is aware of the candidate's RESUME and holds them to a
// TARGET LEVEL bar (senior/staff). It does NOT see the story bank — only the resume and what they
// say in the room. The bar shapes how hard it probes and when it throws a curveball, mirroring the
// `escalate` pattern in the system-design stages.
//
// PERSONA matters: a recruiter screen is NOT a technical interview. When the round persona is
// 'recruiter', follow-ups stay on motivation/career/fit/logistics and never go technical — the gap
// that made recruiter practice feel unrealistic. Hiring-manager/peer personas probe at the bar.

const MODEL = GEN_MODEL

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

// Recruiter screens are non-technical: a recruiter probes motivation, fit, and logistics — never
// system design or "what exactly did you build". This persona prompt keeps the practice realistic.
function recruiterSystem(): string {
  return `You are a friendly, experienced RECRUITER running a first phone screen — NOT a technical
interviewer and NOT the hiring manager. Given the question and the candidate's spoken answer (and
their resume, when provided), write 2-3 follow-up questions a real recruiter would actually ask next.

A recruiter screens for FIT and LOGISTICS, conversationally and warmly. Probe things like: what
draws them to THIS company/role and what they're looking for next; their career narrative and what
kind of work they enjoy and want more (or less) of; a HIGH-LEVEL sense of scope and seniority (no
technical depth); and practical logistics — timeline/availability, location or remote, compensation
expectations, notice period, visa/work authorization if relevant.

Hard rules: NEVER ask technical follow-ups — no system design, no "what exactly did you build", no
deep tradeoffs, metrics interrogation, or "what would you do differently" engineering probes. Keep
each follow-up to one sentence, warm and conversational, grounded in what they said or their resume.
Do not re-ask the original question.`
}

function behavioralSystem(targetLevel: BehavioralLevel, persona: InterviewerPersona): string {
  const who =
    persona === 'peer'
      ? 'a peer engineer running a behavioral / project deep-dive'
      : 'the hiring manager running a behavioral interview'
  return `You are a sharp interviewer — ${who}. Given the question and the
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

function generateSystem(targetLevel: BehavioralLevel, persona: InterviewerPersona): string {
  return persona === 'recruiter' ? recruiterSystem() : behavioralSystem(targetLevel, persona)
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
  persona = 'hiring_manager',
  interviewerContext,
  signal,
}: {
  question: string
  transcript: Transcript
  resume?: string
  targetLevel?: BehavioralLevel
  /** Who is asking — a recruiter never asks technical follow-ups. Defaults to a hiring manager. */
  persona?: InterviewerPersona
  /** First-hand intel about this interviewer — bias the follow-ups toward what they focus on. */
  interviewerContext?: string
  signal?: AbortSignal
}): Promise<Followup[]> {
  const user = [
    resume?.trim() ? `CANDIDATE RESUME (context — do not assume facts beyond it):\n${resume.trim()}\n` : '',
    interviewerContext?.trim()
      ? `WHAT THE CANDIDATE KNOWS ABOUT THIS INTERVIEWER (bias your follow-ups toward what they focus on; stay in persona):\n${interviewerContext.trim()}\n`
      : '',
    `ORIGINAL QUESTION:\n${question}`,
    '',
    `CANDIDATE'S ANSWER:\n${transcript?.text || '(empty)'}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { parsed } = await chatStructured<{ followups?: Followup[] }>({
    provider: 'anthropic',
    model: MODEL,
    system: generateSystem(targetLevel, persona),
    user,
    schema: GENERATE_SCHEMA,
    maxTokens: 600,
    signal,
  })
  return parsed.followups || []
}
