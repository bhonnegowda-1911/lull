import { chatStructured } from '../llmClient'
import { DEFAULT_MODEL, GRADING_TEMPERATURE } from '../models'
import { FACETS, facetPrompt, type FacetAnswer, type FacetId, type Project } from '../../data/projects'
import type { BehavioralLevel, Score } from '../../types'

// Conversational, STAR-driven facet capture — the multi-turn successor to probe.ts. Instead of a
// one-shot "dig deeper", the coach interviews the candidate one question at a time, always aimed at
// the weakest STAR beat at the target-level bar, until all four beats clear the bar; then it
// synthesizes the final FacetAnswer. This is the capture-side mirror of the behavioral grader: it
// reuses the same STAR beats and the same level bars (followups.ts / probe.ts) — so "follow the
// same STAR method" is enforced by one rubric, not a parallel one. One LLM call per turn.

export interface FacetMessage {
  role: 'coach' | 'you'
  text: string
}

export interface FacetBeat {
  present: boolean
  score: Score
  note: string
}

export interface FacetBeats {
  situation: FacetBeat
  task: FacetBeat
  action: FacetBeat
  result: FacetBeat
}

export interface FacetTurnResult {
  /** STAR coverage of the conversation so far — drives the live S·T·A·R meter. */
  beats: FacetBeats
  /** 'ready' once every beat clears the bar and `draft` is synthesized. */
  status: 'probing' | 'ready'
  /** The coach's next question (one, targeting the weakest beat). Empty when ready. */
  next: string
  /** The synthesized STAR answer, present only when status is 'ready'. */
  draft: FacetAnswer | null
}

const LEVEL_BAR: Record<BehavioralLevel, string> = {
  junior: 'a junior bar (confirm basic ownership and clarity).',
  mid: 'a mid bar (the specific decisions and tradeoffs behind their choices).',
  senior:
    'a senior bar (scope, quantified impact, cross-team influence, and the tradeoffs they weighed; whether the work was really theirs vs. the team).',
  staff:
    'a staff bar (org-level scope, ambiguity navigated, strategic framing, second-order consequences, and why this was the highest-leverage thing to do).',
  principal: 'a principal bar (company-wide impact, setting direction for others, shaping strategy).',
}

const beatSchema = (beat: string) => ({
  type: 'object',
  description: `Coverage of the ${beat} beat in what the candidate has said so far.`,
  properties: {
    present: { type: 'boolean', description: `Is the ${beat} clearly established?` },
    score: { type: 'integer', enum: [1, 2, 3, 4, 5], description: '1 (absent/weak) to 5 (strong, at the bar)' },
    note: { type: 'string', description: 'One short reason for the score.' },
  },
  required: ['present', 'score', 'note'],
  additionalProperties: false,
})

const SCHEMA = {
  type: 'object',
  properties: {
    beats: {
      type: 'object',
      properties: {
        situation: beatSchema('Situation (context/problem)'),
        task: beatSchema('Task (their specific charge/goal)'),
        action: beatSchema('Action (what THEY personally did)'),
        result: beatSchema('Result (quantified outcome/impact)'),
      },
      required: ['situation', 'task', 'action', 'result'],
      additionalProperties: false,
    },
    ready: {
      type: 'boolean',
      description: 'True only when all four beats clear the target-level bar and no more probing is needed.',
    },
    next: {
      type: 'string',
      description:
        'When not ready: the ONE next question to ask, targeting the weakest beat, one sentence, grounded in what they said. Empty string when ready.',
    },
    draft: {
      type: 'object',
      description:
        'When ready: the synthesized STAR answer in the candidate\'s first-person voice, grounded ONLY in what they said (never invent metrics). Empty strings when not ready.',
      properties: {
        situation: { type: 'string' },
        task: { type: 'string' },
        action: { type: 'string' },
        result: { type: 'string' },
        text: { type: 'string', description: 'The four beats flattened into a tight 3-5 sentence STAR paragraph.' },
      },
      required: ['situation', 'task', 'action', 'result', 'text'],
      additionalProperties: false,
    },
  },
  required: ['beats', 'ready', 'next', 'draft'],
  additionalProperties: false,
}

function system(facetLabel: string, targetLevel: BehavioralLevel): string {
  return `You are a sharp interview coach helping a candidate build ONE behavioral answer, for the
"${facetLabel}" facet of a project, using the STAR method (Situation, Task, Action, Result). You are
interviewing them one question at a time.

Each turn: judge how well the conversation so far covers each STAR beat at ${LEVEL_BAR[targetLevel] ?? LEVEL_BAR.senior}
Then EITHER ask ONE pointed next question targeting the single weakest beat (prefer one incisive
question over several shallow ones; ground it in what they actually said; never write the answer for
them), OR — once all four beats clearly clear the bar — set ready=true and synthesize the final
answer in "draft".

Rules: Push hardest on ACTION ("what exactly did YOU do, vs. the team?") and RESULT (quantified
outcome). Never invent facts, names, or metrics the candidate did not give. When you synthesize,
write in their first-person voice, keep it tight (3-5 sentences in draft.text), and use only what
they told you.`
}

interface RawTurn {
  beats: FacetBeats
  ready: boolean
  next: string
  draft: FacetAnswer
}

/** Run one coaching turn over the facet conversation so far. */
export async function facetTurn({
  project,
  facetId,
  conversation,
  targetLevel = 'senior',
  signal,
}: {
  project: Pick<Project, 'title' | 'summary'>
  facetId: FacetId
  conversation: FacetMessage[]
  targetLevel?: BehavioralLevel
  signal?: AbortSignal
}): Promise<FacetTurnResult> {
  const facet = FACETS.find((f) => f.id === facetId)
  if (!facet) throw new Error(`Unknown facet: ${facetId}`)

  const transcript = conversation.map((m) => `${m.role === 'coach' ? 'COACH' : 'CANDIDATE'}: ${m.text}`).join('\n')
  const user = [
    `PROJECT: ${project.title || '(untitled)'}`,
    project.summary ? `WHAT WAS BUILT: ${project.summary}` : '',
    '',
    `FACET: ${facet.label}`,
    `CAPTURE PROMPT (target ${targetLevel}): ${facetPrompt(facet, targetLevel)}`,
    '',
    `CONVERSATION SO FAR:\n${transcript || '(none yet)'}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { parsed } = await chatStructured<RawTurn>({
    provider: 'anthropic',
    model: DEFAULT_MODEL,
    system: system(facet.label, targetLevel),
    user,
    schema: SCHEMA,
    maxTokens: 900,
    temperature: GRADING_TEMPERATURE,
    signal,
  })

  return {
    beats: parsed.beats,
    status: parsed.ready ? 'ready' : 'probing',
    next: parsed.next ?? '',
    draft: parsed.ready ? parsed.draft : null,
  }
}
