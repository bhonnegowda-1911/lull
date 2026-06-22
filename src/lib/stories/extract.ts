import { chatStructured } from '../llmClient'
import { DEFAULT_MODEL, GRADING_TEMPERATURE } from '../models'
import { STORY_THEMES, type StoryDraft } from '../../data/stories'
import type { Transcript } from '../../types'

// Capture-from-reps: distill a practice answer's transcript into a structured story draft, so the
// bank fills as a byproduct of practicing. The draft is best-effort and saved as 'draft' for the
// user to review/confirm in the Story Bank — we never treat extracted content as ground truth
// until they confirm it. One LLM call, via the same gateway as grading.

const SYSTEM = `You convert a candidate's spoken interview answer into a single structured STORY
for their personal story bank. Extract ONLY what they actually said — do not invent facts,
numbers, or outcomes. If a field wasn't covered, leave it empty/short rather than fabricating.

Produce:
- title: a short, memorable label for this story (e.g. "Cut billing latency 40%").
- roleRef: the company/role/team if mentioned, else an empty string.
- star: situation, task, a list of the key actions THEY took, and the result.
- impact: any concrete metrics they cited (verbatim figures), whether the work was theirs ("i"),
  shared ("we"), or mixed, and the blast radius (self/team/org) the story implies.
- themes: which of the allowed categories this story can answer.
- trueCeilingLevel: the seniority the WORK itself plausibly demonstrates judged by scope/ownership/
  impact; choose the lowest level the evidence supports rather than inflating.`

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short memorable label for the story.' },
    roleRef: { type: 'string', description: 'Company/role/team if mentioned, else empty string.' },
    star: {
      type: 'object',
      properties: {
        situation: { type: 'string' },
        task: { type: 'string' },
        actions: { type: 'array', items: { type: 'string' }, description: 'Key actions THEY took.' },
        result: { type: 'string' },
      },
      required: ['situation', 'task', 'actions', 'result'],
      additionalProperties: false,
    },
    impact: {
      type: 'object',
      properties: {
        metrics: { type: 'array', items: { type: 'string' }, description: 'Concrete figures they cited.' },
        ownership: { type: 'string', enum: ['i', 'we', 'mixed'] },
        blastRadius: { type: 'string', enum: ['self', 'team', 'org'] },
      },
      required: ['metrics', 'ownership', 'blastRadius'],
      additionalProperties: false,
    },
    themes: {
      type: 'array',
      description: 'Which categories this story can answer.',
      items: { type: 'string', enum: STORY_THEMES },
    },
    trueCeilingLevel: {
      type: 'string',
      enum: ['junior', 'mid', 'senior', 'staff', 'principal'],
      description: 'Seniority the work itself demonstrates; lowest level the evidence supports.',
    },
  },
  required: ['title', 'roleRef', 'star', 'impact', 'themes', 'trueCeilingLevel'],
  additionalProperties: false,
}

export async function extractStory({
  question,
  transcript,
  signal,
}: {
  question: string
  transcript: Transcript
  signal?: AbortSignal
}): Promise<StoryDraft> {
  const user = [
    `INTERVIEW QUESTION:\n${question}`,
    '',
    `CANDIDATE'S ANSWER (transcript):\n${transcript?.text || '(empty)'}`,
  ].join('\n')

  const { parsed } = await chatStructured<StoryDraft>({
    provider: 'anthropic',
    model: DEFAULT_MODEL,
    system: SYSTEM,
    user,
    schema: SCHEMA,
    maxTokens: 900,
    temperature: GRADING_TEMPERATURE,
    signal,
  })
  return parsed
}
