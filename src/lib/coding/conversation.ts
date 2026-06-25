import { chatStructured } from '../llmClient'
import { DEFAULT_MODEL } from '../models'
import {
  DEFAULT_INTERVIEW_CONFIG,
  escalationEnabled,
  personaDirective,
  type InterviewConfig,
} from '../interview/persona'
import type { CodingStage } from '../../data/coding/stages'
import type { CodingProblem } from '../../data/coding/problems'

// One interviewer turn for a single coding-interview stage. The engine is stateless, mirroring the
// system-design engine (src/lib/sysdesign/conversation.ts): the caller passes the full stage
// transcript each turn and we serialize it into the user message. The interviewer acknowledges
// briefly, probes with targeted follow-ups, and signals when the stage is sufficiently covered
// ("aligned"). It does NOT hand out scores mid-stage — leveling is computed once, at the end, by
// report.ts. Crucially, it NEVER writes the candidate's code or dumps the optimal answer.

export type TurnRole = 'candidate' | 'interviewer'

export interface Turn {
  role: TurnRole
  text: string
}

export interface Coverage {
  covered: string[]
  missing: string[]
}

export interface StageTurnResult {
  reply: string
  followUps: string[]
  aligned: boolean
  coverage: Coverage
}

export interface PriorStage {
  label: string
  decisions: string
}

export const TURN_SCHEMA = {
  type: 'object',
  properties: {
    reply: {
      type: 'string',
      description:
        'A brief, conversational interviewer response to what the candidate just said (1-2 sentences). Acknowledge or react; do not lecture or write code for them.',
    },
    followUps: {
      type: 'array',
      description:
        'Up to 3 targeted follow-up questions that probe gaps (complexity, an edge case, the key insight), like a real interviewer. Empty array when the stage is sufficiently covered.',
      items: { type: 'string' },
    },
    aligned: {
      type: 'boolean',
      description:
        'True when the candidate has covered this stage well enough to move on. When true, followUps should usually be empty.',
    },
    coverage: {
      type: 'object',
      description: 'A running snapshot of this stage, used later for grading.',
      properties: {
        covered: { type: 'array', description: 'Points the candidate has handled well so far.', items: { type: 'string' } },
        missing: { type: 'array', description: 'Important points still missing or weak for this stage.', items: { type: 'string' } },
      },
      required: ['covered', 'missing'],
      additionalProperties: false,
    },
  },
  required: ['reply', 'followUps', 'aligned', 'coverage'],
  additionalProperties: false,
}

function systemPrompt(stage: CodingStage, problem: CodingProblem, config: InterviewConfig): string {
  const escalation =
    stage.escalate && escalationEnabled(config.style)
      ? `
- ESCALATE when they're doing well: once they've nailed the optimal approach, raise the bar with ONE
  realistic curveball — a tighter constraint (must be O(1) space, streaming input, the array is huge
  and can't fit in memory) or a variant — and see if they adapt. This is how senior separates from
  staff; don't pile on more than one or two.`
      : ''

  return `You are an engineer conducting a coding (DSA) interview — the kind of focused
algorithmic screen used as a technical screen. You behave like a real interviewer: you ask targeted
follow-ups and you do NOT do the candidate's thinking for them, write their code, or read out the
optimal solution.

${personaDirective(config)}

THE PROBLEM:
${problem.statement}

CURRENT STAGE: ${stage.label}
Goal of this stage: ${stage.goal}

What to probe for in this stage:
${stage.probeFor.map((p) => `- ${p}`).join('\n')}

Reference points a strong answer tends to hit for THIS problem (use to judge coverage — do NOT read
them out to the candidate):
${referenceFor(stage, problem)}

How to run the turn:
- React briefly to what they just said, then ask up to 3 follow-ups that expose the most important
  gap or push them to be precise. Prefer ONE incisive question over three shallow ones.
- Stay at THIS stage's altitude — don't jump ahead (e.g. don't push for code during the approach
  stage, and during the code stage focus on correctness/bugs over re-deriving the approach).
- In the IMPLEMENT stage the candidate's message contains their CODE. Read it: point out bugs, missed
  cases, or unclear structure with targeted questions; never rewrite it for them.
- Hold them to what they established earlier (provided below) — e.g. tie the code back to the approach
  and complexity they committed to.
- Set "aligned" to true ONLY when they've covered this stage well enough to move on; then congratulate
  briefly and leave followUps empty.
- Be honest. If an approach is wrong or a complexity claim is off, push on it rather than accepting it.${escalation}
- Track coverage (covered / missing) for grading later. Do not reveal scores or levels.`
}

function referenceFor(stage: CodingStage, problem: CodingProblem): string {
  const h = problem.hints
  const lines: string[] = []
  switch (stage.id) {
    case 'clarify':
      lines.push(...h.clarifications.map((c) => `- Good to clarify: ${c}`))
      break
    case 'bruteforce':
      lines.push(`- Baseline: ${h.bruteForce}`)
      break
    case 'optimal':
      lines.push(`- Optimal: ${h.optimal}`, `- Target complexity: ${h.optimalComplexity}`)
      break
    case 'code':
      lines.push(`- Implements: ${h.optimal}`, ...h.traps.map((t) => `- Common bug: ${t}`))
      break
    case 'verify':
      lines.push(...h.edgeCases.map((e) => `- Edge case: ${e}`), `- Final complexity: ${h.optimalComplexity}`)
      break
  }
  return lines.length ? lines.join('\n') : '- (Use your own judgment for this stage.)'
}

// Pull the candidate's own statements out of a stage transcript — what they actually decided, used to
// give later stages memory of earlier ones. Pure + mirrors the sysdesign helper.
export function candidateDecisions(transcript: Turn[] = []): string {
  return transcript
    .filter((t) => t.role === 'candidate')
    .map((t) => t.text)
    .join(' ')
    .trim()
}

function priorContextSection(priorStages: PriorStage[]): string {
  if (!priorStages?.length) return ''
  const lines = ['ESTABLISHED EARLIER IN THIS INTERVIEW (hold the candidate to these):']
  for (const s of priorStages) {
    lines.push(s.decisions ? `- ${s.label}: ${s.decisions}` : `- ${s.label}: (skipped)`)
  }
  lines.push('')
  return lines.join('\n')
}

// Stable, reused leading portion of the user turn (prior-stage context + transcript so far). The
// gateway caches it so turns after the first within a stage re-read it cheaply. The volatile latest
// message is sent separately.
function buildCachePrefix(transcript: Turn[], priorStages: PriorStage[]): string {
  const lines: string[] = []
  const prior = priorContextSection(priorStages)
  if (prior) lines.push(prior)
  if (transcript.length) {
    lines.push('CONVERSATION SO FAR (this stage):')
    for (const turn of transcript) {
      lines.push(`${turn.role === 'candidate' ? 'CANDIDATE' : 'INTERVIEWER'}: ${turn.text}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export interface RunStageTurnArgs {
  problem: CodingProblem
  stage: CodingStage
  transcript?: Turn[]
  priorStages?: PriorStage[]
  message: string
  /** Target level + interviewer style; defaults keep existing callers working. */
  config?: InterviewConfig
  model?: string
  signal?: AbortSignal
}

/** Run one interviewer turn. */
export async function runStageTurn({
  problem,
  stage,
  transcript = [],
  priorStages = [],
  message,
  config = DEFAULT_INTERVIEW_CONFIG,
  model = DEFAULT_MODEL,
  signal,
}: RunStageTurnArgs): Promise<StageTurnResult> {
  const { parsed } = await chatStructured<Partial<StageTurnResult>>({
    provider: 'anthropic',
    model,
    system: systemPrompt(stage, problem, config),
    cachePrefix: buildCachePrefix(transcript, priorStages),
    user: `CANDIDATE (just now): ${message}`,
    schema: TURN_SCHEMA,
    signal,
  })

  return {
    reply: parsed.reply || '',
    followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
    aligned: Boolean(parsed.aligned),
    coverage: parsed.coverage || { covered: [], missing: [] },
  }
}
