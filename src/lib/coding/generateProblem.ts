import { chatStructured } from '../llmClient'
import { CODING_GEN_PROBLEM_CRITERIA } from '../../data/coding/genProblemCriteria'
import { PROBLEMS, type CodingProblem } from '../../data/coding/problems'
import { loadCustomCodingProblems } from './customProblems'

// One LLM call that AUTHORS a new coding problem (statement + examples + the grading hints) from a
// short user spec. The id is derived client-side from the title and de-duped against the curated
// library and any prior generated problems, so it slots cleanly into getProblem()/the picker.

export interface CodingProblemSpec {
  /** Optional DSA topic/pattern to bias toward, e.g. "sliding window". */
  topic?: string
  /** Optional target difficulty. Empty = let the model choose. */
  difficulty?: 'Easy' | 'Medium' | 'Hard' | ''
  /** Free-text description of what the user wants to practice. */
  prompt: string
}

type GeneratedFields = Omit<CodingProblem, 'id'>

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'custom-problem'
  )
}

function uniqueId(base: string): string {
  const taken = new Set([...PROBLEMS.map((p) => p.id), ...loadCustomCodingProblems().map((p) => p.id)])
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export async function generateCodingProblem(spec: CodingProblemSpec, signal?: AbortSignal): Promise<CodingProblem> {
  const user = [
    spec.topic?.trim() ? `Topic / pattern focus: ${spec.topic.trim()}` : null,
    spec.difficulty ? `Target difficulty: ${spec.difficulty}` : null,
    `Request: ${spec.prompt.trim()}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { parsed } = await chatStructured<GeneratedFields>({
    provider: 'anthropic',
    model: CODING_GEN_PROBLEM_CRITERIA.model,
    system: CODING_GEN_PROBLEM_CRITERIA.systemPrompt,
    user,
    schema: CODING_GEN_PROBLEM_CRITERIA.schema,
    maxTokens: 2500,
    thinking: 'adaptive',
    signal,
  })

  return { ...parsed, id: uniqueId(slugify(parsed.title)) }
}
