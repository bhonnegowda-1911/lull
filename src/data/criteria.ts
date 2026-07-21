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
  // Full STAR grade + level signal + coaching notes, plus optional storyFidelity/jobFit sub-objects.
  // 1500 (the default) truncates this and breaks JSON parsing; give it generous headroom.
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
Be specific and direct about these two — they are common, fixable habits.

CONTENT COACHING (only when "CANDIDATE'S TRUE STORIES" or "CANDIDATE'S TRUE PROJECTS" are
provided): you also have the candidate's own ground truth — their stories and the richer projects
behind them (captured across facets like ownership, influence, ambiguity, prioritization). Compare
how they TOLD the answer against what actually happened, and fill "storyFidelity": name the matched
story or project; list where the telling UNDERSOLD the real scope/impact (use the project facets —
e.g. they owned it org-wide but said "we"); list concrete impact present in the ground truth but
OMITTED from the telling; flag solo work framed as "we"/team (misattributedToTeam); and if a
DIFFERENT provided story/project is a stronger fit for this question, name it in betterExampleTitle.
Use ONLY the provided ground truth — do not invent facts. If none is provided, OMIT storyFidelity
entirely.

JD / COMPANY FIT (only when a "TARGET JOB" is provided): a behavioral answer is also judged against
the specific company and role. Fill "jobFit": echo the company; score 1-5 how well THIS answer lands
for THIS role's bar; list the JD must-haves/keywords the answer genuinely EVIDENCED (mustHavesHit)
and the relevant ones it could have surfaced for this role but DIDN'T (mustHavesMissed); and list the
company's values / behavioral signals the answer demonstrated (valuesSignaled) — apply what you know
about how this named company evaluates behavioral answers (e.g. its leadership principles or stated
values), but never fabricate a value the answer doesn't actually support. Keep "note" to one or two
sentences on the fit and the single highest-leverage thing to add to land better for this company.
This AUGMENTS the STAR grade — it never replaces it. If no TARGET JOB is provided, OMIT jobFit
entirely.`,
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
      storyFidelity: {
        type: 'object',
        description:
          "Content critique vs. the candidate's true stories. INCLUDE ONLY when true stories were provided; otherwise omit this field.",
        properties: {
          matchedStoryTitle: {
            type: 'string',
            description: 'Title of the provided story the answer was telling; empty string if none matched.',
          },
          underSold: {
            type: 'array',
            description: 'Where the telling sold the work short of its real scope/impact.',
            items: { type: 'string' },
          },
          omittedImpact: {
            type: 'array',
            description: 'Concrete impact in the true story left out of the telling.',
            items: { type: 'string' },
          },
          misattributedToTeam: {
            type: 'array',
            description: 'Spots where solo work was framed as "we"/team.',
            items: { type: 'string' },
          },
          betterExampleTitle: {
            type: 'string',
            description: 'Title of a stronger provided story for this question; empty string if none.',
          },
          note: { type: 'string', description: 'One or two sentence overall content note.' },
        },
        required: ['matchedStoryTitle', 'underSold', 'omittedImpact', 'misattributedToTeam', 'betterExampleTitle', 'note'],
        additionalProperties: false,
      },
      jobFit: {
        type: 'object',
        description:
          'Fit of this answer to the target company/JD bar. INCLUDE ONLY when a TARGET JOB was provided; otherwise omit this field.',
        properties: {
          company: { type: 'string', description: 'The target company this answer was graded against.' },
          score: { type: 'integer', enum: SCORE_ENUM, description: '1 (off-target for this role) to 5 (strong fit).' },
          mustHavesHit: {
            type: 'array',
            description: "JD must-haves / keywords the answer genuinely evidenced.",
            items: { type: 'string' },
          },
          mustHavesMissed: {
            type: 'array',
            description: "Relevant JD must-haves the answer could have surfaced for this role but didn't.",
            items: { type: 'string' },
          },
          valuesSignaled: {
            type: 'array',
            description: "Company values / behavioral signals the answer demonstrated (only those genuinely supported).",
            items: { type: 'string' },
          },
          note: { type: 'string', description: 'One or two sentences: the fit, and the highest-leverage thing to add for this company.' },
        },
        required: ['company', 'score', 'mustHavesHit', 'mustHavesMissed', 'valuesSignaled', 'note'],
        additionalProperties: false,
      },
    },
    required: ['conforms', 'perBeat', 'scores', 'summary', 'deliveryHabits', 'levelSignal', 'coachingNotes'],
    additionalProperties: false,
  },
}

export const DEFAULT_CRITERIA = STAR_CRITERIA
