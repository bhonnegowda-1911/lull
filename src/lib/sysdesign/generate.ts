import { chatStructured } from '../llmClient'
import { SYSDESIGN_SELECT_CRITERIA } from '../../data/sysdesign/genCriteria'
import { problemCatalog } from '../../data/sysdesign/problems'
import type { JobDescription, ProblemPick } from '../../types'

// JD → ranked canonical system-design problems. One LLM call that MATCHES the job to the curated
// library (it never invents a problem or grading key — see genCriteria). The raw JD text is included
// on purpose: the highest-signal clues (untrusted code, flaky endpoints, 3am breaking-change alerts)
// live in prose, not in the parsed fields. Picks referencing an unknown id are dropped defensively.

// The catalog is identical for every job and every re-select, so it goes in `cachePrefix` (cached
// after the first call within the window) while only the per-job parsed structure + raw JD sit in the
// volatile `user` turn.
function catalogPrefix(): string {
  const catalog = problemCatalog()
    .map((c) => `- ${c.id}: ${c.title} — ${c.statement}`)
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

export async function selectInterviewProblems(
  job: JobDescription,
  signal?: AbortSignal,
): Promise<ProblemPick[]> {
  const { parsed } = await chatStructured<{ picks: ProblemPick[] }>({
    provider: 'anthropic',
    model: SYSDESIGN_SELECT_CRITERIA.model,
    system: SYSDESIGN_SELECT_CRITERIA.systemPrompt,
    cachePrefix: catalogPrefix(),
    user: jobContext(job),
    schema: SYSDESIGN_SELECT_CRITERIA.schema,
    // Adaptive thinking shares the max_tokens budget; widen so a long JD's reasoning can't starve the
    // picks output into a truncated, unparseable response.
    maxTokens: 3000,
    thinking: 'adaptive',
    signal,
  })
  const known = new Set(problemCatalog().map((c) => c.id))
  return parsed.picks.filter((p) => known.has(p.problemId))
}
