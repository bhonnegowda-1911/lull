import { chatStructured } from './llmClient'
import { promptCatalog } from '../data/prompts'
import type { Criteria } from '../data/criteria'
import type { JobDescription } from '../types'

// Shared core for JD → curated-question-bank selectors (behavioral and recruiter rounds). Given a
// criteria (prompt + schema) and a category filter, it matches the job to a SUBSET of the bank and
// returns ranked picks. The LLM only ever returns ids from the filtered catalog — it never invents a
// question or a grading key (STAR grading is question-agnostic, so the bank stays the source of
// truth). The raw JD text is included on purpose: values and logistics usually live in prose.

export interface PromptPick {
  promptId: string
  confidence: 'high' | 'medium' | 'low'
  rationale: string
}

function jobContext(job: JobDescription, catalog: { id: string; text: string; category: string }[]): string {
  const p = job.parsed
  const parsed = p
    ? [
        `Title: ${p.title}`,
        `Company: ${p.company}`,
        `Seniority: ${p.seniority}`,
        `Responsibilities: ${p.responsibilities.join(' | ')}`,
      ].join('\n')
    : `Title: ${job.title}\nCompany: ${job.company}`
  const list = catalog.map((c) => `- ${c.id} [${c.category}]: ${c.text}`).join('\n')
  return `CATALOG OF QUESTIONS (pick promptId only from these ids):\n${list}\n\nPARSED STRUCTURE:\n${parsed}\n\nRAW JOB DESCRIPTION:\n${job.rawText.trim()}`
}

export async function selectPromptRound(
  job: JobDescription,
  criteria: Criteria,
  includeCategory: (category: string) => boolean,
  signal?: AbortSignal,
): Promise<PromptPick[]> {
  const catalog = promptCatalog().filter((c) => includeCategory(c.category))
  const { parsed } = await chatStructured<{ picks: PromptPick[] }>({
    provider: 'anthropic',
    model: criteria.model,
    system: criteria.systemPrompt,
    user: jobContext(job, catalog),
    schema: criteria.schema,
    maxTokens: 1800,
    thinking: 'adaptive',
    signal,
  })
  const known = new Set(catalog.map((c) => c.id))
  return parsed.picks.filter((p) => known.has(p.promptId))
}
