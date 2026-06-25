import { chatStructured } from '../llmClient'
import { DEFAULT_MODEL } from '../models'
import {
  DEFAULT_INTERVIEW_CONFIG,
  escalationEnabled,
  personaDirective,
  type InterviewConfig,
} from '../interview/persona'
import type { Stage } from '../../data/sysdesign/stages'
import type { Problem } from '../../data/sysdesign/problems'

// One interviewer turn for a single system-design stage. The engine is stateless: the
// caller passes the full stage transcript each turn and we serialize it into the user
// message (keeps llmClient unchanged — no multi-message support needed). The interviewer
// acknowledges briefly, probes with targeted follow-ups, and signals when the stage is
// sufficiently covered ("aligned"). It does NOT hand out scores mid-stage — leveling is
// computed once, at the end, by report.ts.

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
        'A brief, conversational interviewer response to what the candidate just said (1-2 sentences). Acknowledge or react; do not lecture.',
    },
    followUps: {
      type: 'array',
      description:
        'Up to 3 targeted follow-up questions that probe gaps or push prioritization, like a real interviewer. Empty array when the stage is sufficiently covered.',
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
        covered: {
          type: 'array',
          description: 'Points the candidate has handled well so far.',
          items: { type: 'string' },
        },
        missing: {
          type: 'array',
          description: 'Important points still missing or weak for this stage.',
          items: { type: 'string' },
        },
      },
      required: ['covered', 'missing'],
      additionalProperties: false,
    },
  },
  required: ['reply', 'followUps', 'aligned', 'coverage'],
  additionalProperties: false,
}

function systemPrompt(stage: Stage, problem: Problem, config: InterviewConfig): string {
  const escalation =
    stage.escalate && escalationEnabled(config.style)
      ? `
- ESCALATE when they're doing well: once they've handled the basics of this stage, raise the
  stakes with ONE realistic curveball to test how they adapt — a sudden 10x traffic spike, a
  regional outage, a hot/celebrity entity, or a new requirement. Introduce it naturally, then
  see if they evolve the design. This is how senior separates from staff; don't skip it for a
  strong candidate, but don't pile on more than a couple over the stage.`
      : ''

  return `You are an engineer conducting a system-design interview. You behave like a real
interviewer: you ask targeted follow-up questions and you do NOT do the candidate's thinking
for them or dump the answer.

${personaDirective(config)}

THE PROBLEM:
${problem.statement}

CURRENT STAGE: ${stage.label}
Goal of this stage: ${stage.goal}

What to probe for in this stage:
${stage.probeFor.map((p) => `- ${p}`).join('\n')}

Reference points a strong answer tends to hit for THIS problem (use to judge coverage —
do NOT read them out to the candidate):
${referenceFor(stage, problem)}

How to run the turn:
- React briefly to what they just said, then ask up to 3 follow-up questions that expose
  the most important gaps or push them to prioritize. Prefer ONE incisive question over
  three shallow ones.
- Mirror a real interview: stay at this stage's altitude, don't jump ahead to later stages.
- Use what the candidate established EARLIER in this interview (provided below). Hold them to
  it and connect stages — e.g. tie the design back to the NFRs or API they already chose.
- Set "aligned" to true ONLY when they've covered this stage well enough to move on. When
  aligned, congratulate briefly and leave followUps empty.
- Be honest. If an answer is thin or generic, push on it rather than accepting it.${escalation}
- Track coverage (covered / missing) for grading later. Do not reveal scores or levels.`
}

function referenceFor(stage: Stage, problem: Problem): string {
  const h = problem.hints
  const map: Record<string, string[] | undefined> = {
    functional: h.functionalReqs,
    nonfunctional: h.nonFunctionalReqs,
    entities: h.coreEntities,
    api: h.api,
    deepdives: h.deepDives,
  }
  const points = map[stage.id]
  const lines: string[] = []
  if (points?.length) lines.push(...points.map((p) => `- ${p}`))
  if (stage.id === 'deepdives' && h.traps?.length) {
    lines.push(...h.traps.map((t) => `- Common trap: ${t}`))
  }
  return lines.length ? lines.join('\n') : '- (Use your own judgment for this stage.)'
}

// Pull the candidate's own statements out of a stage transcript — what they actually
// decided, used to give later stages memory of earlier ones. Pure + tested.
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
    if (s.decisions) lines.push(`- ${s.label}: ${s.decisions}`)
    else lines.push(`- ${s.label}: (skipped)`)
  }
  lines.push('')
  return lines.join('\n')
}

// The stable, reused leading portion of the user turn — prior-stage context + the transcript so
// far. It's a prefix of the next turn's prefix (the transcript only grows), so the gateway caches
// it: turns after the first within a stage re-read it cheaply instead of re-sending at full price.
function buildCachePrefix(transcript: Turn[], priorStages: PriorStage[]): string {
  const lines: string[] = []
  const prior = priorContextSection(priorStages)
  if (prior) lines.push(prior)
  if (transcript.length) {
    lines.push('CONVERSATION SO FAR (this stage):')
    for (const turn of transcript) {
      const who = turn.role === 'candidate' ? 'CANDIDATE' : 'INTERVIEWER'
      lines.push(`${who}: ${turn.text}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// The volatile tail of the user turn: the candidate's latest message, plus the whiteboard note when
// an image is attached. Kept out of the cached prefix since it changes every turn.
function buildLatest(latest: string, hasWhiteboard: boolean): string {
  const lines: string[] = []
  if (hasWhiteboard) {
    lines.push(
      "The attached image is the candidate's current whiteboard for this design. Read it as part",
      'of their answer — the boxes/components, how they connect, and any labels — and probe it like',
      'a real interviewer (unlabeled arrows, missing components, bottlenecks).',
      '',
    )
  }
  lines.push(`CANDIDATE (just now): ${latest}`)
  return lines.join('\n')
}

export interface RunStageTurnArgs {
  problem: Problem
  stage: Stage
  transcript?: Turn[]
  priorStages?: PriorStage[]
  message: string
  /** Target level + interviewer style; defaults keep existing callers working. */
  config?: InterviewConfig
  /** Base64 PNG of the candidate's current whiteboard, so the interviewer can see the diagram. */
  whiteboardImage?: string | null
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
  whiteboardImage = null,
  model = DEFAULT_MODEL,
  signal,
}: RunStageTurnArgs): Promise<StageTurnResult> {
  const { parsed } = await chatStructured<Partial<StageTurnResult>>({
    provider: 'anthropic',
    model,
    system: systemPrompt(stage, problem, config),
    cachePrefix: buildCachePrefix(transcript, priorStages),
    user: buildLatest(message, Boolean(whiteboardImage)),
    images: whiteboardImage ? [whiteboardImage] : undefined,
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
