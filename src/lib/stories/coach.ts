import { chatStructured } from '../llmClient'
import { DEFAULT_MODEL } from '../models'
import { STORY_THEMES, emptyStory, type BlastRadius, type Ownership, type Story } from '../../data/stories'
import type { BehavioralLevel, ParsedJob, Score } from '../../types'

// Conversational story builder — the story-bank mirror of the project-facet coach (lib/projects/
// facetChat.ts). Instead of capturing ONE facet, it interviews the candidate to assemble a whole
// interview-grade STAR story: it pushes on Action ownership ("you", not "the team") and a quantified
// Result, insists on a crisp takeaway (the "so what"), and — once the story clears the target-level
// bar — synthesizes the full Story (title, STAR + takeaway, metrics, ownership/blast radius, themes,
// and the level the work demonstrates). The accepted story then feeds resume generation, job
// matching, and behavioral grading, all of which already read the story bank. One LLM call per turn.

export interface StoryMessage {
  role: 'coach' | 'you'
  text: string
}

export interface StoryBeat {
  present: boolean
  score: Score
  note: string
}

// Live coverage for the S·T·A·R meter, plus the takeaway (the story's point) tracked alongside.
export interface StoryBeats {
  situation: StoryBeat
  task: StoryBeat
  action: StoryBeat
  result: StoryBeat
  takeaway: StoryBeat
}

export interface StoryTurnResult {
  beats: StoryBeats
  status: 'probing' | 'ready'
  /** The coach's next question (one, targeting the weakest beat or an un-probed theme). Empty when ready. */
  next: string
  /** The competency themes the conversation genuinely supports so far — drives the live themes meter. */
  themesCovered: string[]
  /** The coach's honest read of the level the story currently demonstrates (or 'unclear'). */
  assessedLevel: string
  /** When a job is provided: JD requirements still worth mining. Empty otherwise. */
  jobEvidenceGaps: string[]
  /** The synthesized story, present only when status is 'ready'. */
  draft: Story | null
}

const LEVELS: BehavioralLevel[] = ['junior', 'mid', 'senior', 'staff', 'principal']
const OWNERSHIP: Ownership[] = ['i', 'we', 'mixed']
const BLAST: BlastRadius[] = ['self', 'team', 'org']

const LEVEL_BAR: Record<BehavioralLevel, string> = {
  junior: 'a junior bar (confirm basic ownership and clarity).',
  mid: 'a mid bar (the specific decisions and tradeoffs behind their choices).',
  senior:
    'a senior bar (scope, quantified impact, cross-team influence, and the tradeoffs they weighed; whether the work was really theirs vs. the team).',
  staff:
    'a staff bar (org-level scope, ambiguity navigated, strategic framing, second-order consequences, and why this was the highest-leverage thing to do).',
  principal: 'a principal bar (company-wide impact, setting direction for others, shaping strategy).',
}

// The distinguishing markers to actively PROBE at each target level — the depth/altitude that
// separates one level from the next, beyond the breadth of the competency themes. Mirrors the
// staff/senior framing already encoded in the project facet prompts (data/projects.ts).
const LEVEL_SIGNALS: Record<BehavioralLevel, string> = {
  junior:
    'clear ownership of their piece, that they followed through to done, and what they learned ramping up.',
  mid: 'the specific technical decisions and tradeoffs behind their choices, and that they executed independently without hand-holding.',
  senior:
    'real scope and quantified impact; the tradeoffs they weighed and why their call was right; whether the work was genuinely THEIRS vs. the team; and where they influenced peers or raised the bar beyond their own assigned tasks.',
  staff:
    'org-level scope (impact beyond their own team); why this was the HIGHEST-LEVERAGE thing to do vs. alternatives, and what they chose NOT to do; the second-order consequences they reasoned about (cost, failure modes, long-term evolution); how they MULTIPLIED others (set direction others executed, paved a path, unblocked many); influence without authority across teams they did not control; and how the work tied to a business/strategic outcome.',
  principal:
    'company-wide impact; setting technical direction others followed; shaping strategy across multiple orgs; and outcomes that outlasted any single project.',
}

const beatSchema = (beat: string) => ({
  type: 'object',
  description: `Coverage of the ${beat} in what the candidate has said so far.`,
  properties: {
    present: { type: 'boolean', description: `Is the ${beat} clearly established?` },
    score: { type: 'integer', enum: [1, 2, 3, 4, 5], description: '1 (absent/weak) to 5 (strong, at the bar)' },
    note: { type: 'string', description: 'One short reason for the score.' },
  },
  required: ['present', 'score', 'note'],
  additionalProperties: false,
})

export const SCHEMA = {
  type: 'object',
  properties: {
    beats: {
      type: 'object',
      properties: {
        situation: beatSchema('Situation (context/problem)'),
        task: beatSchema('Task (their specific charge/goal)'),
        action: beatSchema('Action (what THEY personally did)'),
        result: beatSchema('Result (quantified outcome/impact)'),
        takeaway: beatSchema('Takeaway (the crisp "so what" / what they learned)'),
      },
      required: ['situation', 'task', 'action', 'result', 'takeaway'],
      additionalProperties: false,
    },
    themesCovered: {
      type: 'array',
      items: { type: 'string', enum: STORY_THEMES },
      description:
        'The competency themes the conversation so far GENUINELY supports (real evidence given, not merely plausible). Grows as the candidate reveals more dimensions.',
    },
    assessedLevel: {
      type: 'string',
      description:
        "Your HONEST read of the level this story currently demonstrates: one of junior/mid/senior/staff/principal, or 'unclear' early on. Judge by scope/leverage/influence actually shown — do NOT inflate to the target level.",
    },
    jobEvidenceGaps: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Only when a TARGET JOB is provided: concrete JD requirements/keywords the candidate plausibly relates to but the story does not yet evidence — what is still worth mining for this job. Empty array when no job, or when nothing real is left to mine.',
    },
    ready: {
      type: 'boolean',
      description:
        'True only when STAR clears the target-level bar (quantified Result + clear takeaway) AND you have explored the competency dimensions this experience plausibly supports (not just STAR).',
    },
    next: {
      type: 'string',
      description:
        'When not ready: the ONE next question, one sentence, grounded in what they said — targeting EITHER the weakest STAR beat OR a competency dimension the experience likely involves but you have not explored yet (conflict, teamwork, cross-functional/stakeholders, ambiguity, influence, prioritization, growth/feedback, failure). Empty string when ready.',
    },
    draft: {
      type: 'object',
      description:
        "When ready: the synthesized story in the candidate's first-person voice, grounded ONLY in what they said (never invent metrics, names, or companies). Empty/zero values when not ready.",
      properties: {
        title: { type: 'string', description: 'Short, impact-oriented title (e.g. "Cut billing latency 40%").' },
        situation: { type: 'string' },
        task: { type: 'string' },
        actions: { type: 'array', items: { type: 'string' }, description: 'What THEY personally did, one action per item.' },
        result: { type: 'string' },
        takeaway: { type: 'string', description: 'The one-line "so what" / lesson.' },
        metrics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Real numbers only, as baseline→delta where possible (e.g. "p99 800ms → 480ms"). Never invented.',
        },
        ownership: { type: 'string', enum: OWNERSHIP, description: "'i' if solo, 'we' if shared, 'mixed'." },
        blastRadius: { type: 'string', enum: BLAST, description: 'Scope of impact: self, team, or org.' },
        themes: {
          type: 'array',
          items: { type: 'string', enum: STORY_THEMES },
          description: 'Every behavioral category this story genuinely answers (should match themesCovered). Tag all that are truly supported, not just the headline one.',
        },
        level: { type: 'string', enum: LEVELS, description: 'The highest level the work genuinely demonstrates.' },
      },
      required: ['title', 'situation', 'task', 'actions', 'result', 'takeaway', 'metrics', 'ownership', 'blastRadius', 'themes', 'level'],
      additionalProperties: false,
    },
  },
  required: ['beats', 'themesCovered', 'assessedLevel', 'jobEvidenceGaps', 'ready', 'next', 'draft'],
  additionalProperties: false,
}

function system(targetLevel: BehavioralLevel, hasJob: boolean): string {
  return `You are a sharp interview coach helping a candidate build ONE rich behavioral STORY from a
real experience, using the STAR method (Situation, Task, Action, Result) plus a closing Takeaway (the
"so what" / what they learned). You interview them one question at a time.

A real project answers MANY interview questions, not one. Your job is not just to get a clean STAR —
it is to MINE the experience for every competency dimension an interviewer would probe, so this one
story can later answer many prompts. The competency themes are: ${STORY_THEMES.join(', ')}.

LEVEL SIGNAL — target is ${targetLevel.toUpperCase()}. Beyond breadth, actively probe for the markers
that distinguish this level: ${LEVEL_SIGNALS[targetLevel] ?? LEVEL_SIGNALS.senior}
Judge against ${LEVEL_BAR[targetLevel] ?? LEVEL_BAR.senior} Be HONEST in assessedLevel: read the level
the story actually demonstrates from the scope/leverage/influence shown — if it doesn't reach the
target, say so plainly in your next question ("this reads as senior, not staff, because …") and do
NOT inflate. Mining for a level never means fabricating; if the work genuinely wasn't at that level,
record the true level and move on.
${hasJob ? `
TARGET JOB — a parsed job description is provided. Also probe for evidence the story could provide
toward this job's must-haves and keywords (only what's genuinely true — never coach them to claim a
skill they don't have). List concrete JD requirements still worth mining in jobEvidenceGaps.
` : ''}
Each turn: judge each STAR beat, which themes are now genuinely supported (themesCovered), and the
level the story currently reads as (assessedLevel). Then ask ONE pointed next question (incisive,
grounded in what they said, never writing the answer for them) targeting whichever is weakest:
  • a STAR beat, OR
  • a competency dimension the experience PLAUSIBLY involves but you haven't explored (deadline →
    prioritization; multiple teams → cross-functional & stakeholders; a resisted call → conflict &
    influence; unfamiliar problem → ambiguity & growth; something broke → failure & recovery), OR
  • a ${targetLevel}-level signal above that the story hints at but hasn't established${hasJob ? ', OR\n  • a JD requirement the story could evidence but hasn\'t' : ''}.
If the candidate says a dimension genuinely wasn't a factor, accept it and move on — never force it.

Set ready=true and synthesize the full story in "draft" only when STAR clears the bar (quantified
Result + crisp takeaway) AND you have explored the competency dimensions and the ${targetLevel}-level
signals this experience plausibly supports${hasJob ? ' AND addressed the job-relevant angles' : ''}.

Rules: Push hard on ACTION ("what exactly did YOU do, vs. the team?") and RESULT (a real, quantified
outcome — baseline AND after). Never invent facts, names, companies, or metrics. When you synthesize:
write in their first-person voice, capture the cross-cutting angles in the actions, tag EVERY theme
the story genuinely answers (match themesCovered), and set "level" to the highest level the work
honestly demonstrates (match assessedLevel).`
}

interface RawDraft {
  title: string
  situation: string
  task: string
  actions: string[]
  result: string
  takeaway: string
  metrics: string[]
  ownership: Ownership
  blastRadius: BlastRadius
  themes: string[]
  level: BehavioralLevel
}

interface RawTurn {
  beats: StoryBeats
  themesCovered: string[]
  assessedLevel: string
  jobEvidenceGaps: string[]
  ready: boolean
  next: string
  draft: RawDraft
}

/** Assemble a full Story (draft status) from the coach's synthesized output. */
function storyFromDraft(raw: RawDraft, id: string): Story {
  const base = emptyStory(id)
  return {
    ...base,
    title: raw.title?.trim() || '',
    star: {
      situation: raw.situation ?? '',
      task: raw.task ?? '',
      actions: Array.isArray(raw.actions) ? raw.actions.filter(Boolean) : [],
      result: raw.result ?? '',
      takeaway: raw.takeaway ?? '',
    },
    impact: {
      metrics: Array.isArray(raw.metrics) ? raw.metrics.filter(Boolean) : [],
      ownership: OWNERSHIP.includes(raw.ownership) ? raw.ownership : 'i',
      blastRadius: BLAST.includes(raw.blastRadius) ? raw.blastRadius : 'team',
    },
    themes: Array.isArray(raw.themes) ? raw.themes.filter((t) => STORY_THEMES.includes(t)) : [],
    trueCeilingLevel: LEVELS.includes(raw.level) ? raw.level : null,
  }
}

/** Run one coaching turn over the story conversation so far. */
export async function storyTurn({
  conversation,
  targetLevel = 'senior',
  job,
  draftId,
  signal,
}: {
  conversation: StoryMessage[]
  targetLevel?: BehavioralLevel
  /** A parsed target job to mine the story toward — its must-haves/keywords are probed for. */
  job?: ParsedJob | null
  /** Id the synthesized Story should carry once ready. */
  draftId: string
  signal?: AbortSignal
}): Promise<StoryTurnResult> {
  const transcript = conversation.map((m) => `${m.role === 'coach' ? 'COACH' : 'CANDIDATE'}: ${m.text}`).join('\n')
  const jobSection = job
    ? [
        '',
        'TARGET JOB (mine the story toward these, only where genuinely true):',
        `  Title: ${job.title}${job.company ? ` @ ${job.company}` : ''} (${job.seniority})`,
        job.mustHaveSkills.length ? `  Must-haves: ${job.mustHaveSkills.map((s) => s.skill).join(', ')}` : '',
        job.keywords.length ? `  Keywords: ${job.keywords.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : ''
  const user = [
    `TARGET LEVEL: ${targetLevel}`,
    `ALLOWED THEMES: ${STORY_THEMES.join(', ')}`,
    jobSection,
    '',
    `CONVERSATION SO FAR:\n${transcript || '(none yet)'}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { parsed } = await chatStructured<RawTurn>({
    provider: 'anthropic',
    model: DEFAULT_MODEL,
    system: system(targetLevel, Boolean(job)),
    user,
    schema: SCHEMA,
    maxTokens: 1800, // headroom for a long "ready" turn (full draft + 5 beat notes + level/job reads)
    signal,
  })

  return {
    beats: parsed.beats,
    status: parsed.ready ? 'ready' : 'probing',
    next: parsed.next ?? '',
    themesCovered: Array.isArray(parsed.themesCovered) ? parsed.themesCovered.filter((t) => STORY_THEMES.includes(t)) : [],
    assessedLevel: parsed.assessedLevel ?? '',
    jobEvidenceGaps: Array.isArray(parsed.jobEvidenceGaps) ? parsed.jobEvidenceGaps : [],
    draft: parsed.ready ? storyFromDraft(parsed.draft, draftId) : null,
  }
}
