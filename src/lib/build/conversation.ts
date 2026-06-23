import { chatStructured } from '../llmClient'
import { DEFAULT_MODEL } from '../models'
import type { BuildStage } from '../../data/build/stages'
import type { BuildProblem } from '../../data/build/problems'

// One coach turn for a single Build-mode planning stage. The candidate implements the challenge
// OFFLINE; in here the coach pressure-tests how they PLAN and PRIORITIZE. Stateless, like the
// system-design engine: the caller passes the full stage transcript each turn. The coach reacts,
// probes the prioritization, and signals when the stage is covered ("aligned"). Leveling is
// computed once at the end by report.ts against the rubric dimensions — not here.

export type TurnRole = 'candidate' | 'interviewer'

export interface Turn {
  role: TurnRole
  text: string
}

export interface Coverage {
  covered: string[]
  missing: string[]
}

export interface BuildTurnResult {
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
        'A brief, conversational coach response to what the candidate just said (1-2 sentences). React and push their thinking; do not plan it for them.',
    },
    followUps: {
      type: 'array',
      description:
        'Up to 3 targeted prompts that pressure-test their prioritization or surface a gap. Empty array when this stage is sufficiently covered.',
      items: { type: 'string' },
    },
    aligned: {
      type: 'boolean',
      description:
        'True when the candidate has thought through this stage well enough to move on. When true, followUps should usually be empty.',
    },
    coverage: {
      type: 'object',
      description: 'A running snapshot of this stage, used later for grading.',
      properties: {
        covered: { type: 'array', description: 'Things the candidate has reasoned through well so far.', items: { type: 'string' } },
        missing: { type: 'array', description: 'Important prioritization points still missing or weak.', items: { type: 'string' } },
      },
      required: ['covered', 'missing'],
      additionalProperties: false,
    },
  },
  required: ['reply', 'followUps', 'aligned', 'coverage'],
  additionalProperties: false,
}

function referenceFor(stage: BuildStage, problem: BuildProblem): string {
  const h = problem.hints
  const map: Record<string, string[]> = {
    scope: h.scope,
    core: h.runningCore,
    approach: [...h.security, ...h.aiUsage],
  }
  const points = map[stage.id] || []
  const lines = points.map((p) => `- ${p}`)
  if (stage.id === 'approach' && h.traps?.length) {
    lines.push(...h.traps.map((t) => `- Common trap: ${t}`))
  }
  return lines.length ? lines.join('\n') : '- (Use your own judgment for this stage.)'
}

function systemPrompt(stage: BuildStage, problem: BuildProblem): string {
  const escalation = stage.escalate
    ? `
- ESCALATE when they're doing well: throw ONE realistic curveball to test their prioritization —
  a tempting rabbit hole, a new constraint, or "you have half the time you thought." See whether
  they re-prioritize cleanly. Don't pile on more than a couple.`
    : ''

  return `You are a sharp engineering coach helping a candidate PREPARE for a timed, AI-assisted
"design AND implement" challenge. The candidate will do the actual coding OFFLINE; your job here
is to pressure-test how they PLAN and PRIORITIZE under the time box. You are warm but rigorous,
you ask pointed questions, and you do NOT plan the solution for them or hand them the answer.

This mode grades PRIORITIZATION above all — scoping to something finishable and getting a
running core early matter most; flagging the security risk, code-quality plan, and how they'll
use the AI matter too. Reward ruthless, realistic prioritization over ambition.

THE CHALLENGE (they implement this offline, timed):
${problem.statement}
Language: ${problem.language}

CURRENT STAGE: ${stage.label}
Goal of this stage: ${stage.goal}

What to probe for in this stage:
${stage.probeFor.map((p) => `- ${p}`).join('\n')}

Reference points a well-prioritized plan tends to hit for THIS challenge (use to judge coverage —
do NOT read them out to the candidate):
${referenceFor(stage, problem)}

How to run the turn:
- React briefly, then ask up to 3 follow-ups that expose the most important prioritization gap.
  Prefer ONE incisive question over three shallow ones.
- Keep them honest about the clock: if their plan can't be built in the time box, push them to cut.
- Stay at this stage's altitude; don't jump ahead. Use what they established earlier and hold them to it.
- Set "aligned" to true ONLY when they've reasoned through this stage well; then acknowledge briefly
  and leave followUps empty.
- Be honest. If a plan is over-ambitious, vague, or skips the untrusted-code risk, push on it.${escalation}
- Track coverage (covered / missing) for grading later. Do not reveal scores or levels.`
}

export function candidateDecisions(transcript: Turn[] = []): string {
  return transcript
    .filter((t) => t.role === 'candidate')
    .map((t) => t.text)
    .join(' ')
    .trim()
}

function priorContextSection(priorStages: PriorStage[]): string {
  if (!priorStages?.length) return ''
  const lines = ['ESTABLISHED EARLIER IN THIS SESSION (hold the candidate to these):']
  for (const s of priorStages) {
    lines.push(s.decisions ? `- ${s.label}: ${s.decisions}` : `- ${s.label}: (skipped)`)
  }
  lines.push('')
  return lines.join('\n')
}

function buildUserMessage(transcript: Turn[], latest: string, priorStages: PriorStage[]): string {
  const lines: string[] = []
  const prior = priorContextSection(priorStages)
  if (prior) lines.push(prior)
  if (transcript.length) {
    lines.push('CONVERSATION SO FAR (this stage):')
    for (const turn of transcript) {
      lines.push(`${turn.role === 'candidate' ? 'CANDIDATE' : 'COACH'}: ${turn.text}`)
    }
    lines.push('')
  }
  lines.push(`CANDIDATE (just now): ${latest}`)
  return lines.join('\n')
}

export interface RunBuildTurnArgs {
  problem: BuildProblem
  stage: BuildStage
  transcript?: Turn[]
  priorStages?: PriorStage[]
  message: string
  model?: string
  signal?: AbortSignal
}

/** Run one coach turn for the Build mode. */
export async function runBuildTurn({
  problem,
  stage,
  transcript = [],
  priorStages = [],
  message,
  model = DEFAULT_MODEL,
  signal,
}: RunBuildTurnArgs): Promise<BuildTurnResult> {
  const { parsed } = await chatStructured<Partial<BuildTurnResult>>({
    provider: 'anthropic',
    model,
    system: systemPrompt(stage, problem),
    user: buildUserMessage(transcript, message, priorStages),
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
