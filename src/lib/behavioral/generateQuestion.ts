import { chatStructured } from '../llmClient'
import { BEHAVIORAL_GEN_CRITERIA } from '../../data/behavioralGenCriteria'
import { PROMPTS, type Prompt } from '../../data/prompts'
import { loadCustomPrompts } from './customQuestions'

// One LLM call that AUTHORS a new behavioral question (the prompt text + its prep guidance) from a short
// user spec. The id is derived client-side from the label and de-duped against the curated bank and any
// prior generated questions, so it slots cleanly into the selector alongside curated prompts.

export interface BehavioralQuestionSpec {
  /** Optional competency/category to bias toward, e.g. "Leadership". */
  focus?: string
  /** Free-text: the question they were asked, or what they want to practice. */
  prompt: string
}

type GeneratedFields = Omit<Prompt, 'id'>

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'custom-question'
  )
}

function uniqueId(base: string): string {
  const taken = new Set([...PROMPTS.map((p) => p.id), ...loadCustomPrompts().map((p) => p.id)])
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export async function generateBehavioralQuestion(spec: BehavioralQuestionSpec, signal?: AbortSignal): Promise<Prompt> {
  const user = [
    spec.focus?.trim() ? `Competency focus: ${spec.focus.trim()}` : null,
    `Request: ${spec.prompt.trim()}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { parsed } = await chatStructured<GeneratedFields>({
    provider: 'anthropic',
    model: BEHAVIORAL_GEN_CRITERIA.model,
    system: BEHAVIORAL_GEN_CRITERIA.systemPrompt,
    user,
    schema: BEHAVIORAL_GEN_CRITERIA.schema,
    // Adaptive thinking spends tokens before the output, and max_tokens caps the TOTAL (thinking +
    // output). The authored question is small, but thinking can be large — give a generous ceiling
    // clear of any thinking spend, or the JSON truncates and fails to parse.
    maxTokens: 8000,
    thinking: 'adaptive',
    signal,
  })

  return { ...parsed, id: uniqueId(slugify(parsed.label)) }
}
