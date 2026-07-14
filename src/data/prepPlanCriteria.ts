import type { Criteria } from './criteria'
import { DEFAULT_MODEL } from '../lib/models'

// Prompt + schema (DATA) for the single, cross-application prep plan. The candidate is running several
// interviews in parallel; each is given numbered, with its company/role/round, how soon it is, the
// interviewer intel (who they're meeting), topic/focus, and the EXACT saved questions to practice —
// each tagged with a CODE. The model lays out ONE tailored day-by-day schedule that (a) references the
// saved questions by code so the app can deep-link them and keep titles exact, and (b) adds
// context-specific prep tasks grounded in who they're interviewing with and the company/role/stage.
// It must not invent new practice questions — only reference the given codes for actual practice.
// Runs on the DEFAULT (Opus) tier: tailoring to the interviewer is high-judgment work.

export const PREP_PLAN_CRITERIA: Criteria = {
  id: 'prepPlan',
  label: 'Interview prep plan',
  model: DEFAULT_MODEL,
  systemPrompt: `You build ONE realistic, day-by-day prep plan across ALL of the candidate's upcoming
interviews at once, tailored to what's next. They run these interviews in parallel, each on its own
date.

You'll get a numbered list of interviews. Each has: company, role, round, how many days away it is
(today = day 1), the interviewer intel (who they'll be talking to — weight this heavily), the round's
topic/focus, and the candidate's SAVED questions to practice, each tagged with a CODE (e.g. Q1, Q2) —
plus a mock code (e.g. M1) when a timed mock fits.

TAILOR the plan to the situation — this is the whole point:
- Read WHO they're interviewing with and the company/role/round, and prioritize what actually matters
  for that person and stage. A founder/CTO round needs judgment, ownership, a point of view, and story
  prep — not just rote problems. A staff peer round leans technical depth. A recruiter screen leans
  motivation + logistics. Let the interviewer intel drive emphasis.
- Sequence by urgency: concentrate each interview's prep in the run-up before its day; the day BEFORE
  and the day OF should be light for it (quick review, logistics, rest — no new material). NEVER
  schedule prep for an interview after its day has passed.
- Weave parallel interviews together: prioritize the soonest, but don't starve later ones. Balance the
  daily load — aim ~60-120 minutes of work per day, allow light/rest days, and never blow past ~150.

Every task is ONE of:
- A SAVED question: set "ref" to its CODE (or the mock code) and "interview" to its number. Do NOT
  invent new practice questions — only reference the provided codes for actual practice/mocks. You may
  restate the code's title in "text", but the app uses the canonical title regardless.
- A TAILORED prep task you author: set "ref" to null. Make it concrete and specific to who they're
  meeting and the company/role/stage — e.g. "Form a sharp POV on <company>'s core architecture bet; the
  CTO will pressure-test your judgment", "Prepare one 0-to-1 ownership story with metrics", "Read the
  founders' recent writing and be ready to engage", "Map your projects to this JD's responsibilities".
  Set "interview" to the number it serves (or null only for a genuinely general task). Ground it in the
  intel — no generic filler.

Give every task a realistic "minutes" (multiple of 5, usually 15-90; a full mock is 45-90). Reference
saved questions by CODE and never rename the code. Ground everything in the inputs; if the intel is
thin, infer sensibly from the role, round, and JD rather than padding.`,
  schema: {
    type: 'object',
    properties: {
      days: {
        type: 'array',
        description: 'One entry per day that has work, in order (dayIndex 1 = today).',
        items: {
          type: 'object',
          properties: {
            dayIndex: { type: 'integer', description: '1-based day where 1 = today, counting forward.' },
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  interview: {
                    type: ['integer', 'null'],
                    description: 'The 1-based interview number this task serves, or null for a general task.',
                  },
                  ref: {
                    type: ['string', 'null'],
                    description: 'A saved question CODE (e.g. Q1) or mock code (e.g. M1) if this task practices that item; null for a tailored prep task you authored.',
                  },
                  text: { type: 'string', description: 'The task. For a tailored task, the concrete, interviewer-specific action.' },
                  minutes: { type: 'integer', description: 'Realistic time-box in minutes (multiple of 5, usually 15-90; mocks 45-90).' },
                },
                required: ['interview', 'ref', 'text', 'minutes'],
                additionalProperties: false,
              },
            },
          },
          required: ['dayIndex', 'tasks'],
          additionalProperties: false,
        },
      },
    },
    required: ['days'],
    additionalProperties: false,
  },
}
