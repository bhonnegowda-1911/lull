import type { Criteria } from './criteria'
import { DEFAULT_MODEL } from '../lib/models'

// Prompt + schema (DATA) for the JD → recruiter-screen SELECTOR. The recruiter screen is the first
// call: a quick background read, motivation, logistics (comp, timeline, work authorization, location),
// and a high-level fit check — it screens OUT more than it screens in. This ranks the curated
// "Recruiter screen" question set by how likely/important each is for THIS job, citing JD signals
// (seniority, location/remote, listed process). It never invents a question; every returned promptId
// is one from the provided catalog.

export const RECRUITER_SELECT_CRITERIA: Criteria = {
  id: 'recruiterSelect',
  label: 'Recruiter-screen question selection',
  model: DEFAULT_MODEL,
  systemPrompt: `You predict which recruiter-screen questions a specific company is likely to ask, from
their job description and a CATALOG of curated recruiter-screen questions.

The recruiter screen is the first call — usually with a recruiter, not the hiring manager. It probes
motivation, a crisp background read, LOGISTICS (compensation expectations, timeline, work
authorization, location/remote/onsite), and a high-level fit check. It is a fast screen-out round.

Read the JD for signals that make certain questions more pointed: location/remote/onsite expectations
and relocation → the logistics question; seniority and a competitive market → comp and timeline;
a strong product/mission → why-this-company. Most recruiter screens cover the background overview and
"why now" regardless.

Pick the 4-6 MOST LIKELY/important questions, ranked. For each:
- promptId: MUST be an id from the catalog. Never invent an id or a question.
- confidence: high / medium / low — drives the ranking.
- rationale: why this question matters for THIS screen, citing concrete JD signals where relevant.

Ground every choice in the JD where you can; the universal screen questions are fine to include.`,
  schema: {
    type: 'object',
    properties: {
      picks: {
        type: 'array',
        description: '4-6 catalog questions, ranked most-to-least likely (highest confidence first).',
        items: {
          type: 'object',
          properties: {
            promptId: { type: 'string', description: 'An id taken verbatim from the provided catalog.' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Likelihood/importance; drives ranking.' },
            rationale: { type: 'string', description: 'Why this question matters for this screen, citing JD signals where relevant.' },
          },
          required: ['promptId', 'confidence', 'rationale'],
          additionalProperties: false,
        },
      },
    },
    required: ['picks'],
    additionalProperties: false,
  },
}
