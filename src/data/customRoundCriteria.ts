import type { Criteria } from './criteria'
import { GEN_MODEL } from '../lib/models'

// Prompt + schema (DATA, like sysdesign/genCriteria) for AUTHORING prep for a round with no canonical
// question bank — a "custom" round or a take-home. Unlike the catalog selectors, there's no curated
// bank to rank against, so this GENERATES a bespoke brief grounded entirely in what the candidate
// knows about the round: its topic, focus areas, first-hand interviewer notes, and the JD. The goal
// is a small, high-signal set of likely questions/topics with how to nail each — not a generic study
// guide. If the round context is thin, infer from the JD and the round's label rather than padding.

export const CUSTOM_ROUND_CRITERIA: Criteria = {
  id: 'customRoundPrep',
  label: 'Custom-round prep authoring',
  model: GEN_MODEL,
  systemPrompt: `You prepare a candidate for an interview round that has NO standard question bank —
a bespoke "custom" round or a take-home assignment. You are given everything the candidate knows
about it: the round's topic, its focus areas, their first-hand notes about the interviewer/format,
and the job description.

There is no catalog to pick from here — you AUTHOR the prep. Predict what this specific round will
actually probe and how to do well, grounded in the signals provided. Weight the candidate's own notes
about the interviewer most heavily (first-hand intel on what they'll focus on), then the topic and
focus areas, then the JD.

Produce:
- summary: 1-2 sentences naming what this round is really testing and the bar to clear.
- items: 3-6 likely questions, prompts, or sub-topics, ordered most-to-least important. For each:
  - prompt: the concrete question or topic, phrased the way it would actually come up.
  - assesses: what it's really evaluating (the underlying competency or signal).
  - approach: how to tackle it — what a strong answer/response covers, concretely.
  - trap: a specific, common mistake to avoid on this item.
- prepActions: 2-5 concrete things to review or do before the round (e.g. "re-read the take-home
  rubric and timebox each section", "review your metrics-pipeline project end-to-end").

Be specific to THIS round and company — cite the topic, focus areas, and notes. Do not pad with
generic interview advice. If the context is thin, infer sensibly from the JD and round label rather
than inventing details that contradict what's given.`,
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'What this round is really testing and the bar to clear (1-2 sentences).' },
      items: {
        type: 'array',
        description: '3-6 likely questions/topics, most-to-least important.',
        items: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The concrete question or topic, phrased as it would come up.' },
            assesses: { type: 'string', description: 'What it is really evaluating.' },
            approach: { type: 'string', description: 'How to tackle it — what a strong answer covers.' },
            trap: { type: 'string', description: 'A specific common mistake to avoid.' },
          },
          required: ['prompt', 'assesses', 'approach', 'trap'],
          additionalProperties: false,
        },
      },
      prepActions: {
        type: 'array',
        description: '2-5 concrete things to review or do before the round.',
        items: { type: 'string' },
      },
    },
    required: ['summary', 'items', 'prepActions'],
    additionalProperties: false,
  },
}
