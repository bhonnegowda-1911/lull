import type { Criteria } from './criteria'
import { DEFAULT_MODEL } from '../lib/models'

// Prompt + schema (DATA, like resumeCriteria/genCriteria) for the JD → behavioral SELECTOR. A
// company's behavioral/managerial round probes the competencies and VALUES it states — "Ship, ship,
// ship", "Build with AI", "Compassionate Candor", high agency, customer trust. This ranks the curated
// question bank by how likely each question is for THIS company and explains the fit, citing the JD's
// stated values. It never writes a new question or a grading key (STAR grading is question-agnostic);
// every returned promptId is one from the provided catalog.

export const BEHAVIORAL_SELECT_CRITERIA: Criteria = {
  id: 'behavioralSelect',
  label: 'Behavioral question selection',
  model: DEFAULT_MODEL,
  systemPrompt: `You predict which behavioral / managerial-round questions a specific company is likely
to ask, from their job description and a CATALOG of curated questions.

The behavioral round tests the competencies and especially the VALUES a company states. Read the JD —
its "how we work", values, responsibilities, and seniority — and map each stated value to the
questions that probe it. Examples: "Ship, ship, ship / bias to action" → the ship-fast question;
"Build with AI" → the AI-tools question; "Compassionate Candor / ego in check" → the hard-feedback and
disagreement questions; "Be the Conductor / high agency" → the ownership/agency questions; "Earn the
customer's trust" → the customer-problem question; the JD listing open-source as a plus → the OSS
question. A managerial/HM round (esp. senior/staff) also tends to ask the fit questions (why this
company, ambiguity, managing up).

Pick the 5-7 MOST LIKELY questions, ranked. For each:
- promptId: MUST be an id from the catalog. Never invent an id or a question.
- confidence: high / medium / low — drives the ranking.
- rationale: why THIS company asks it, citing the specific JD value/competency it maps to.

Ground every choice in the JD. Don't pick a question the JD gives no signal for just to fill the list.`,
  schema: {
    type: 'object',
    properties: {
      picks: {
        type: 'array',
        description: '5-7 catalog questions, ranked most-to-least likely (highest confidence first).',
        items: {
          type: 'object',
          properties: {
            promptId: { type: 'string', description: 'An id taken verbatim from the provided catalog.' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Likelihood of this question; drives ranking.' },
            rationale: { type: 'string', description: 'Why this company asks it, citing the JD value/competency it maps to.' },
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
