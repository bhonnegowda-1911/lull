import { chatStructured } from '../llmClient'
import { SYSDESIGN_GEN_PROBLEM_CRITERIA } from '../../data/sysdesign/genProblemCriteria'
import { PROBLEMS, type Problem } from '../../data/sysdesign/problems'
import { loadCustomSysDesignProblems } from './customProblems'

// One LLM call that AUTHORS a new system-design problem (framing + per-stage grading hints) from a
// short user spec. The id is derived client-side from the title and de-duped against the curated
// library and any prior generated problems, so it slots cleanly into getProblem()/the picker.

export interface SysDesignProblemSpec {
  /** Optional target difficulty. Empty = let the model choose. */
  difficulty?: 'Warm-up' | 'Core' | 'Hard' | ''
  /** Free-text description of the domain / system the user wants to practice. */
  prompt: string
}

type GeneratedFields = Omit<Problem, 'id'>

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/^design (a |an |the )?/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'custom-problem'
  )
}

function uniqueId(base: string): string {
  const taken = new Set([...PROBLEMS.map((p) => p.id), ...loadCustomSysDesignProblems().map((p) => p.id)])
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export async function generateSysDesignProblem(spec: SysDesignProblemSpec, signal?: AbortSignal): Promise<Problem> {
  const user = [spec.difficulty ? `Target difficulty: ${spec.difficulty}` : null, `Request: ${spec.prompt.trim()}`]
    .filter(Boolean)
    .join('\n')

  const { parsed } = await chatStructured<GeneratedFields>({
    provider: 'anthropic',
    model: SYSDESIGN_GEN_PROBLEM_CRITERIA.model,
    system: SYSDESIGN_GEN_PROBLEM_CRITERIA.systemPrompt,
    user,
    schema: SYSDESIGN_GEN_PROBLEM_CRITERIA.schema,
    maxTokens: 2500,
    thinking: 'adaptive',
    signal,
  })

  return { ...parsed, id: uniqueId(slugify(parsed.title)) }
}
