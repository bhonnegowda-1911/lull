import { chatStructured } from '../llmClient'
import { CODING_SELECT_CRITERIA } from '../../data/coding/genCriteria'
import { problemCatalog } from '../../data/coding/problems'
import type { JobDescription, CodingPick } from '../../types'

// JD → ranked canonical coding/DSA problems for a technical screen. One LLM call that MATCHES the
// role to the curated coding bank (it never invents a problem or grading key — see genCriteria). The
// raw JD text is included on purpose: the highest-signal clues for which patterns to expect live in
// prose. Picks referencing an unknown id are dropped defensively. Mirrors sysdesign/generate.ts.

// The catalog is identical for every job and every re-select, so it goes in `cachePrefix` (cached
// after the first call within the window) while only the per-job parsed structure + raw JD sit in the
// volatile `user` turn.
function catalogPrefix(): string {
  const catalog = problemCatalog()
    .map((c) => `- ${c.id}: ${c.title} [${c.topics.join(', ')}] — ${c.statement}`)
    .join('\n')
  return `CATALOG OF CANONICAL PROBLEMS (pick problemId only from these ids):\n${catalog}`
}

function jobContext(job: JobDescription): string {
  const p = job.parsed
  const parsed = p
    ? [
        `Title: ${p.title}`,
        `Company: ${p.company}`,
        `Seniority: ${p.seniority}`,
        `Must-have skills: ${p.mustHaveSkills.map((s) => s.skill).join(', ')}`,
        `Responsibilities: ${p.responsibilities.join(' | ')}`,
      ].join('\n')
    : `Title: ${job.title}\nCompany: ${job.company}`
  return `PARSED STRUCTURE:\n${parsed}\n\nRAW JOB DESCRIPTION:\n${job.rawText.trim()}`
}

export async function selectCodingProblems(job: JobDescription, signal?: AbortSignal): Promise<CodingPick[]> {
  const { parsed } = await chatStructured<{ picks: CodingPick[] }>({
    provider: 'anthropic',
    model: CODING_SELECT_CRITERIA.model,
    system: CODING_SELECT_CRITERIA.systemPrompt,
    cachePrefix: catalogPrefix(),
    user: jobContext(job),
    schema: CODING_SELECT_CRITERIA.schema,
    // Adaptive thinking shares the max_tokens budget; widen so a long JD's reasoning can't starve the
    // picks output into a truncated, unparseable response.
    maxTokens: 3000,
    thinking: 'adaptive',
    signal,
  })
  const known = new Set(problemCatalog().map((c) => c.id))
  return parsed.picks.filter((p) => known.has(p.problemId))
}
