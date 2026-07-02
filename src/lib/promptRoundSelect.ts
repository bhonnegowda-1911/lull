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

// The filtered question catalog is the same for every job asking this round, so it goes in
// `cachePrefix` (cached after the first call within the window). Only the per-job parsed structure,
// interviewer intel, and raw JD sit in the volatile `user` turn.
function catalogPrefix(catalog: { id: string; text: string; category: string }[]): string {
  const list = catalog.map((c) => `- ${c.id} [${c.category}]: ${c.text}`).join('\n')
  return `CATALOG OF QUESTIONS (pick promptId only from these ids):\n${list}`
}

function jobContext(job: JobDescription, interviewerContext?: string): string {
  const p = job.parsed
  const parsed = p
    ? [
        `Title: ${p.title}`,
        `Company: ${p.company}`,
        `Seniority: ${p.seniority}`,
        `Responsibilities: ${p.responsibilities.join(' | ')}`,
      ].join('\n')
    : `Title: ${job.title}\nCompany: ${job.company}`
  // The candidate's own intel about THIS interviewer/round (who they are, what they focus on) —
  // weight the ranking toward it. Often the sharpest signal of what will actually be asked.
  const intel = interviewerContext?.trim()
    ? `\n\nWHAT THE CANDIDATE KNOWS ABOUT THIS INTERVIEWER / ROUND (weight the ranking toward this — it's first-hand intel on what they'll actually focus on):\n${interviewerContext.trim()}`
    : ''
  return `PARSED STRUCTURE:\n${parsed}${intel}\n\nRAW JOB DESCRIPTION:\n${job.rawText.trim()}`
}

export interface SelectOptions {
  /** First-hand intel about the interviewer/round — biases the ranking toward what they'll ask. */
  interviewerContext?: string
  signal?: AbortSignal
}

export async function selectPromptRound(
  job: JobDescription,
  criteria: Criteria,
  includeCategory: (category: string) => boolean,
  { interviewerContext, signal }: SelectOptions = {},
): Promise<PromptPick[]> {
  const catalog = promptCatalog().filter((c) => includeCategory(c.category))
  const { parsed } = await chatStructured<{ picks: PromptPick[] }>({
    provider: 'anthropic',
    model: criteria.model,
    system: criteria.systemPrompt,
    cachePrefix: catalogPrefix(catalog),
    user: jobContext(job, interviewerContext),
    schema: criteria.schema,
    // Adaptive thinking shares the max_tokens budget; widen so reasoning can't starve the selection
    // output into a truncated, unparseable response.
    maxTokens: 3000,
    thinking: 'adaptive',
    signal,
  })
  const known = new Set(catalog.map((c) => c.id))
  return parsed.picks.filter((p) => known.has(p.promptId))
}
