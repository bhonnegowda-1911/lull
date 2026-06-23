import { chatStructured } from '../llmClient'
import { BEHAVIORAL_SELECT_CRITERIA } from '../../data/behavioralCriteria'
import { promptCatalog } from '../../data/prompts'
import type { JobDescription, BehavioralPick } from '../../types'

// JD → ranked behavioral/managerial questions. One LLM call that MATCHES the job's stated values to
// the curated question bank (it never invents a question or grading key — see behavioralCriteria).
// The raw JD text is included on purpose: a company's values usually live in prose ("how we work"),
// not in the parsed fields. Picks referencing an unknown id are dropped defensively.

function jobContext(job: JobDescription): string {
  const p = job.parsed
  const parsed = p
    ? [
        `Title: ${p.title}`,
        `Company: ${p.company}`,
        `Seniority: ${p.seniority}`,
        `Responsibilities: ${p.responsibilities.join(' | ')}`,
      ].join('\n')
    : `Title: ${job.title}\nCompany: ${job.company}`
  const catalog = promptCatalog()
    .map((c) => `- ${c.id} [${c.category}]: ${c.text}`)
    .join('\n')
  return `CATALOG OF BEHAVIORAL QUESTIONS (pick promptId only from these ids):\n${catalog}\n\nPARSED STRUCTURE:\n${parsed}\n\nRAW JOB DESCRIPTION:\n${job.rawText.trim()}`
}

export async function selectBehavioralQuestions(
  job: JobDescription,
  signal?: AbortSignal,
): Promise<BehavioralPick[]> {
  const { parsed } = await chatStructured<{ picks: BehavioralPick[] }>({
    provider: 'anthropic',
    model: BEHAVIORAL_SELECT_CRITERIA.model,
    system: BEHAVIORAL_SELECT_CRITERIA.systemPrompt,
    user: jobContext(job),
    schema: BEHAVIORAL_SELECT_CRITERIA.schema,
    maxTokens: 1800,
    thinking: 'adaptive',
    signal,
  })
  const known = new Set(promptCatalog().map((c) => c.id))
  return parsed.picks.filter((p) => known.has(p.promptId))
}
