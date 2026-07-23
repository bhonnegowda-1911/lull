import type { JsonSchema } from '../lib/llmClient'
import { DEFAULT_MODEL } from '../lib/models'

// Grading criteria are DATA, not code. Swapping STAR for PREP/SBI later is a new
// object here — no analyzer changes. `schema` is a JSON Schema passed to the LLM via
// output_config.format so the response is constrained to this shape.

export interface Criteria {
  id: string
  label: string
  model: string
  systemPrompt: string
  schema: JsonSchema
  /** Output token budget for the grade. The STAR schema is large — and coaching mode (stories) and
   *  job-fit add whole sub-objects — so this needs real headroom, or the JSON truncates and fails to
   *  parse. Omit to use the gateway default (1500), which is too small for this schema. */
  maxTokens?: number
}

const SCORE_ENUM = [1, 2, 3, 4, 5]

function beatSchema(description: string): JsonSchema {
  return {
    type: 'object',
    description,
    properties: {
      present: { type: 'boolean', description: 'Was this beat clearly present?' },
      score: { type: 'integer', enum: SCORE_ENUM, description: '1 (absent/weak) to 5 (strong)' },
      note: { type: 'string', description: 'One specific, actionable observation.' },
    },
    required: ['present', 'score', 'note'],
    additionalProperties: false,
  }
}

export const STAR_CRITERIA: Criteria = {
  id: 'star',
  label: 'STAR method',
  model: DEFAULT_MODEL,
  // STAR grade + level signal + coaching notes. The coaching-mode/job-mode extras (storyFidelity,
  // jobFit, spokenScript) are a SEPARATE call — see COACHING_EXTRAS_SCHEMA — because folding them in
  // pushed the compiled grammar past the gateway's size limit. 1500 (the default) truncates this and
  // breaks JSON parsing; give it generous headroom.
  maxTokens: 3500,
  systemPrompt: `You are an expert interview-delivery coach. You grade how well a spoken
answer follows the STAR(R) method — Situation, Task, Action, Result, and Reflection — and
how clear and impactful the delivery is.

The five beats:
- Situation: the candidate sets the scene and gives the necessary details of the example.
- Task: the candidate's specific responsibility in that situation.
- Action: the exact steps the candidate took to address it (their decisions, "I" not "we").
- Result: the outcomes or results of those actions, ideally quantified.
- Reflection: the candidate ties the answer together — reflecting on the situation, what
  their actions achieved, and what they learned or would do differently. Grade this beat like
  the others: present + score + a specific note. A strong answer closes with a brief, genuine
  reflection; a weak one just stops at the result with no takeaway. Don't reward a tacked-on
  cliché ("I learned teamwork is important") — reward a real, specific insight.

You will receive:
- The interview question being answered.
- A transcript of the candidate's spoken answer.
- A locally computed filler-word summary (total and per-minute rate).

Grade strictly and consistently against the STAR rubric. For each beat, decide whether it
was present and score it 1-5. Provide concrete, specific coaching notes tied to what the
candidate actually said — quote or paraphrase their words. You may reference the filler
data in your coaching, but do not recompute it. Be honest and specific rather than
encouraging for its own sake.

In addition to STAR, infer the SENIORITY LEVEL this specific answer signals, on the
engineering ladder: junior, mid, senior, staff, principal. Judge by the scope and impact
of the work, the ambiguity navigated, the degree of autonomy and ownership, the breadth of
influence (self → team → org), and the depth of judgment shown — NOT by job titles the
candidate mentions. This is the level the STORY demonstrates, not a verdict on the person.
Give a one or two sentence rationale and list the concrete signals (or missing signals)
that drove the call. When the answer is too thin to tell, choose the lowest level the
evidence supports and say what's missing to read higher.

Then coach the candidate UP. For the next one or two levels above the level this answer
demonstrates (the realistic stretch targets), give 2-3 concrete, specific things they could
add or change in THIS answer to make it read at that level — e.g. broader or cross-org scope,
larger and quantified business impact, navigating more ambiguity, strategic framing, driving
through influence, setting direction for others, or raising the stakes of the decision. Tie
the guidance to their actual story, not generic advice. If the answer already signals
principal, return an empty list.

Pay special attention to two delivery habits and grade them explicitly and honestly:
1. LEADS WITH THE OUTCOME — did the candidate state the result/headline up front (in the
   first sentence or two), or did they bury it and make the listener wait? Reward a clear
   "bottom line up front"; penalize a slow build-up to the payoff.
2. DETAIL ALTITUDE — did they stay at the altitude of decisions and impact, or over-index
   on background, setup, and technical minutiae? Classify the tendency as too_much (rambling
   / too in-the-weeds), balanced, or too_little (too vague, no substance). Most candidates
   err toward too_much.
Be specific and direct about these two — they are common, fixable habits.`,
  schema: {
    type: 'object',
    properties: {
      conforms: {
        type: 'boolean',
        description: 'Does the answer broadly follow the STAR structure?',
      },
      perBeat: {
        type: 'object',
        properties: {
          situation: beatSchema('Sets the context/background.'),
          task: beatSchema('States the goal or responsibility.'),
          action: beatSchema('Describes specific steps the candidate took.'),
          result: beatSchema('States the outcome, ideally quantified.'),
          reflection: beatSchema('Ties it together: reflects on what the actions achieved and what was learned.'),
        },
        required: ['situation', 'task', 'action', 'result', 'reflection'],
        additionalProperties: false,
      },
      scores: {
        type: 'object',
        properties: {
          clarity: { type: 'integer', enum: SCORE_ENUM, description: 'How clear and easy to follow.' },
          structure: { type: 'integer', enum: SCORE_ENUM, description: 'How well-organized as STAR.' },
          impact: { type: 'integer', enum: SCORE_ENUM, description: 'How compelling/convincing.' },
        },
        required: ['clarity', 'structure', 'impact'],
        additionalProperties: false,
      },
      summary: {
        type: 'string',
        description: 'Two or three sentences summarizing the delivery overall.',
      },
      deliveryHabits: {
        type: 'object',
        description: 'Two high-leverage delivery habits, graded explicitly.',
        properties: {
          leadsWithOutcome: {
            type: 'object',
            properties: {
              present: { type: 'boolean', description: 'Did they state the outcome up front?' },
              score: { type: 'integer', enum: SCORE_ENUM, description: '1 (buried) to 5 (clear BLUF).' },
              note: { type: 'string', description: 'Specific observation; quote their opening if useful.' },
            },
            required: ['present', 'score', 'note'],
            additionalProperties: false,
          },
          detailAltitude: {
            type: 'object',
            properties: {
              tendency: {
                type: 'string',
                enum: ['too_much', 'balanced', 'too_little'],
                description: 'Did they over-index on detail, stay balanced, or stay too vague?',
              },
              score: { type: 'integer', enum: SCORE_ENUM, description: '1 (poor altitude) to 5 (right altitude).' },
              note: { type: 'string', description: 'Where they over- or under-detailed.' },
            },
            required: ['tendency', 'score', 'note'],
            additionalProperties: false,
          },
        },
        required: ['leadsWithOutcome', 'detailAltitude'],
        additionalProperties: false,
      },
      levelSignal: {
        type: 'object',
        description: 'Seniority level this answer demonstrates (not a verdict on the person).',
        properties: {
          level: {
            type: 'string',
            enum: ['junior', 'mid', 'senior', 'staff', 'principal'],
            description: 'The level the scope/impact/ownership/influence in the story signals.',
          },
          rationale: {
            type: 'string',
            description: 'One or two sentences explaining the level call.',
          },
          signals: {
            type: 'array',
            description: 'Concrete signals (or missing signals) that drove the call.',
            items: { type: 'string' },
          },
          toReachHigher: {
            type: 'array',
            description:
              'For the next 1-2 levels above the demonstrated one, what to add or change in THIS answer to signal that level. Empty if already at principal.',
            items: {
              type: 'object',
              properties: {
                level: {
                  type: 'string',
                  enum: ['mid', 'senior', 'staff', 'principal'],
                  description: 'The higher level this guidance targets.',
                },
                guidance: {
                  type: 'array',
                  description: '2-3 concrete, story-specific changes to read at this level.',
                  items: { type: 'string' },
                },
              },
              required: ['level', 'guidance'],
              additionalProperties: false,
            },
          },
        },
        required: ['level', 'rationale', 'signals', 'toReachHigher'],
        additionalProperties: false,
      },
      coachingNotes: {
        type: 'array',
        description: 'Ranked, specific improvements. Most important first.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short label for the issue.' },
            detail: { type: 'string', description: 'Specific, actionable guidance.' },
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['title', 'detail', 'severity'],
          additionalProperties: false,
        },
      },
    },
    required: ['conforms', 'perBeat', 'scores', 'summary', 'deliveryHabits', 'levelSignal', 'coachingNotes'],
    additionalProperties: false,
  },
}

export const DEFAULT_CRITERIA = STAR_CRITERIA

// ---- Coaching-mode side calls (separate from the grade) ------------------
// The spoken script, storyFidelity, and jobFit were originally sub-objects on the STAR grade schema,
// but that schema's compiled constrained-decoding grammar grew past the gateway's size limit
// ("compiled grammar is too large"). They live in their own smaller calls so every grammar stays
// under the limit. Both run in parallel with the grade — see scriptAnalyzer / extrasAnalyzer +
// pipeline — and their results are merged back onto the StarGrading the UI consumes.

// SPOKEN SCRIPT — runs on EVERY coaching-mode grade. It is built from the candidate's OWN answer
// (tighten and reorder what they actually said into a strong verbatim version), so it never depends
// on the story bank; true stories/projects, when present, only enrich and correct it. `spokenScript`
// is required, so the model always returns it.
export const SPOKEN_SCRIPT_PROMPT = `You are an expert interview-delivery coach. You are given a
behavioral interview question and a transcript of the candidate's spoken answer. When available, you
are also given the candidate's TRUE stories/projects (ground truth).

Don't just tell them HOW to deliver — hand them the WORDS. Write "spokenScript": 4-7 verbatim,
first-person lines ("I ...") the candidate could say out loud, in order, to deliver a strong version
of THIS answer: lead with the outcome/result, claim their ownership, name the key decision, quantify
the impact, and close with a genuine one-line reflection. Each entry is the polished spoken words
themselves — natural, tight, roughly one breath each — NOT a paraphrase, a label, or "you should…"
advice.

Build the script primarily from what the candidate ACTUALLY SAID — reorder it to lead with impact,
sharpen vague phrasing, turn "we" into "I" where they owned the work, and cut filler. If TRUE
stories/projects are provided, use their real numbers, scope, and decisions to strengthen and correct
the lines. Never invent facts that aren't supported by the answer or the ground truth; if a number is
genuinely unknown, phrase the line so the candidate can drop theirs in (e.g. "I cut that by roughly
X%"). Always return a usable script.`

export const SPOKEN_SCRIPT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    spokenScript: {
      type: 'array',
      description: 'Verbatim, first-person lines the candidate should say, in order.',
      items: { type: 'string' },
    },
  },
  required: ['spokenScript'],
  additionalProperties: false,
}

// CONTENT + JD FIT — runs only when true stories/projects and/or a target job are present.
export const COACHING_EXTRAS_PROMPT = `You are an expert interview-delivery coach. You are given a
behavioral interview question, a transcript of the candidate's spoken answer, and — depending on the
session — the candidate's TRUE stories/projects (ground truth) and/or a TARGET JOB. Produce up to two
things. Omit either whose inputs are absent.

CONTENT COACHING — "storyFidelity" (only when "CANDIDATE'S TRUE STORIES" or "CANDIDATE'S TRUE
PROJECTS" are provided): compare how they TOLD the answer against what actually happened. Name the
matched story/project (matchedStoryTitle); list where the telling UNDERSOLD the real scope/impact
(underSold — use the project facets, e.g. they owned it org-wide but said "we"); list concrete impact
in the ground truth OMITTED from the telling (omittedImpact); flag solo work framed as "we"/team
(misattributedToTeam); and if a DIFFERENT provided story/project fits this question better, name it
(betterExampleTitle). Use ONLY the provided ground truth — never invent facts. If none is provided,
OMIT storyFidelity entirely.

JD / COMPANY FIT — "jobFit" (only when a "TARGET JOB" is provided): echo the company; score 1-5 how
well THIS answer lands for THIS role's bar; list the JD must-haves/keywords the answer genuinely
EVIDENCED (mustHavesHit) and the relevant ones it could have surfaced but DIDN'T (mustHavesMissed);
list the company values / behavioral signals the answer demonstrated (valuesSignaled) — apply what
you know about how this named company evaluates behavioral answers (its leadership principles / stated
values), but never fabricate a value the answer doesn't support. Keep "note" to one or two sentences
on the fit and the single highest-leverage thing to add. If no TARGET JOB is provided, OMIT jobFit.`

export const COACHING_EXTRAS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    storyFidelity: {
      type: 'object',
      description: "Content critique vs. the candidate's true stories. Omit entirely if no true stories provided.",
      properties: {
        matchedStoryTitle: { type: 'string', description: 'Title of the provided story the answer was telling; empty string if none.' },
        underSold: { type: 'array', description: 'Where the telling sold the work short.', items: { type: 'string' } },
        omittedImpact: { type: 'array', description: 'Concrete impact left out of the telling.', items: { type: 'string' } },
        misattributedToTeam: { type: 'array', description: 'Spots where solo work was framed as "we"/team.', items: { type: 'string' } },
        betterExampleTitle: { type: 'string', description: 'A stronger provided story for this question; empty string if none.' },
        note: { type: 'string', description: 'One or two sentence overall content note.' },
      },
      required: ['matchedStoryTitle', 'underSold', 'omittedImpact', 'misattributedToTeam', 'betterExampleTitle', 'note'],
      additionalProperties: false,
    },
    jobFit: {
      type: 'object',
      description: 'Fit of this answer to the target company/JD bar. Omit entirely if no TARGET JOB provided.',
      properties: {
        company: { type: 'string', description: 'The target company this answer was graded against.' },
        score: { type: 'integer', description: '1 (off-target for this role) to 5 (strong fit).' },
        mustHavesHit: { type: 'array', description: 'JD must-haves the answer evidenced.', items: { type: 'string' } },
        mustHavesMissed: { type: 'array', description: "Relevant JD must-haves it could have surfaced but didn't.", items: { type: 'string' } },
        valuesSignaled: { type: 'array', description: 'Company values the answer demonstrated.', items: { type: 'string' } },
        note: { type: 'string', description: 'One or two sentences: the fit and the highest-leverage add.' },
      },
      required: ['company', 'score', 'mustHavesHit', 'mustHavesMissed', 'valuesSignaled', 'note'],
      additionalProperties: false,
    },
  },
  required: [],
  additionalProperties: false,
}
