import type { Criteria } from './criteria'
import { GEN_MODEL } from '../lib/models'

// Prompt + schema (DATA) for ON-DEMAND behavioral-question AUTHORING. The parallel to the coding /
// system-design authors (genProblemCriteria), but simpler: STAR grading is question-agnostic, so there
// is no per-question grading key to write. This just turns a user's request — a specific question they
// were asked, or a competency they want to drill — into one clean bank-shaped prompt: the question text
// plus the same prep guidance every curated prompt carries (what it assesses, a tip, the trap, what to
// leave out). Selecting it then runs the identical follow-up + grading pipeline as a curated question.

export const BEHAVIORAL_GEN_CRITERIA: Criteria = {
  id: 'behavioralGenQuestion',
  label: 'Behavioral question authoring',
  model: GEN_MODEL,
  systemPrompt: `You are an expert interview coach. Given a short request — a free-text description of
what the user wants to practice (often a specific behavioral/managerial question they were asked, or a
competency they want to drill) and an optional competency focus — author ONE realistic behavioral
interview question in the style of a curated bank question, with its prep guidance.

If the request already contains a concrete question, keep its intent but phrase it as a clean, natural
interviewer prompt. If it only names a topic or competency, write the most likely question a strong
interviewer would ask to probe it. Keep the question open-ended and story-eliciting ("Tell me about a
time…", "Describe a situation…") — never a yes/no or trivia question.

Produce:
- category: the competency bucket it belongs to, e.g. "Conflict", "Leadership", "Failure & mistakes",
  "Ownership", "Ambiguity", "Collaboration". Reuse a common competency name; prefer the user's focus
  when given.
- label: a short menu label (2-5 words), e.g. "Disagreement with a peer".
- text: the interview question itself, one or two sentences, in the interviewer's voice.
- assesses: what the interviewer is really evaluating with this question.
- tip: one specific, actionable pointer for answering it well.
- trap: the common mistake that sinks this answer.
- avoid: what to leave out of the answer.

Be concrete and honest — the guidance must be specific to THIS question, not generic STAR advice.`,
  schema: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Competency bucket, e.g. "Conflict", "Leadership".' },
      label: { type: 'string', description: 'Short menu label (2-5 words).' },
      text: { type: 'string', description: 'The interview question, in the interviewer\'s voice.' },
      assesses: { type: 'string', description: 'What the interviewer is really evaluating.' },
      tip: { type: 'string', description: 'One specific pointer for answering well.' },
      trap: { type: 'string', description: 'The common mistake that sinks this answer.' },
      avoid: { type: 'string', description: 'What to leave out of the answer.' },
    },
    required: ['category', 'label', 'text', 'assesses', 'tip', 'trap', 'avoid'],
    additionalProperties: false,
  },
}
