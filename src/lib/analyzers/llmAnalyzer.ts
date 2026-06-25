import { chatStructured } from '../llmClient'
import { DEFAULT_CRITERIA, type Criteria } from '../../data/criteria'
import type { Story } from '../../data/stories'
import { FACETS, facetText, type Project } from '../../data/projects'
import type { AnalyzerContext, FillerResult, LlmAnalyzerResult, ParsedJob, StarGrading, Transcript } from '../../types'

// Criteria-driven analyzer. The criteria object supplies the system prompt and the
// response schema; this analyzer just assembles the user message (question + transcript +
// injected filler summary +, in coaching mode, the candidate's true stories) and calls the
// provider-agnostic client. One LLM call total.

function storiesBlock(stories: Story[]): string {
  const lines = [
    `CANDIDATE'S TRUE STORIES (ground truth — coach the telling against these; do not invent facts):`,
  ]
  for (const s of stories) {
    lines.push('')
    lines.push(`- TITLE: ${s.title}${s.roleRef ? ` (${s.roleRef})` : ''}`)
    if (s.star.situation) lines.push(`  Situation: ${s.star.situation}`)
    if (s.star.task) lines.push(`  Task: ${s.star.task}`)
    if (s.star.actions?.length) lines.push(`  Actions: ${s.star.actions.join('; ')}`)
    if (s.star.result) lines.push(`  Result: ${s.star.result}`)
    if (s.star.takeaway) lines.push(`  Takeaway: ${s.star.takeaway}`)
    if (s.impact.metrics?.length) lines.push(`  Metrics: ${s.impact.metrics.join('; ')}`)
    lines.push(`  Ownership: ${s.impact.ownership}; blast radius: ${s.impact.blastRadius}`)
    if (s.trueCeilingLevel) lines.push(`  Work demonstrates up to: ${s.trueCeilingLevel}`)
  }
  return lines.join('\n')
}

function projectsBlock(projects: Project[]): string {
  const lines = [
    `CANDIDATE'S TRUE PROJECTS (deeper ground truth — the work behind the stories; do not invent facts):`,
  ]
  for (const p of projects) {
    lines.push('')
    lines.push(`- PROJECT: ${p.title}${p.roleRef ? ` (${p.roleRef})` : ''}`)
    if (p.summary) lines.push(`  Built: ${p.summary}`)
    for (const facet of FACETS) {
      const val = facetText(p.facets?.[facet.id]).trim()
      if (val) lines.push(`  ${facet.label}: ${val}`)
    }
  }
  return lines.join('\n')
}

function jobBlock(job: ParsedJob): string {
  const lines = [
    `TARGET JOB (grade fit against this company/role — apply what you know about how ${job.company || 'this company'} evaluates behavioral answers; never fabricate fit):`,
    `- Role: ${job.title}${job.company ? ` @ ${job.company}` : ''} (${job.seniority})`,
  ]
  if (job.mustHaveSkills.length) lines.push(`- Must-haves: ${job.mustHaveSkills.map((s) => s.skill).join(', ')}`)
  if (job.keywords.length) lines.push(`- Keywords: ${job.keywords.join(', ')}`)
  if (job.responsibilities.length) lines.push(`- Responsibilities: ${job.responsibilities.join('; ')}`)
  return lines.join('\n')
}

function buildUserMessage({
  question,
  transcript,
  durationSec,
  filler,
  stories,
  projects,
  job,
}: {
  question: string
  transcript: Transcript
  durationSec: number | null
  filler?: FillerResult
  stories?: Story[]
  projects?: Project[]
  job?: ParsedJob | null
}): string {
  const lines: string[] = []
  lines.push(`INTERVIEW QUESTION:\n${question || '(none provided)'}`)
  lines.push('')
  if (durationSec) lines.push(`SPOKEN ANSWER (${Math.round(durationSec)}s):`)
  else lines.push('SPOKEN ANSWER:')
  lines.push(transcript?.text || '(empty transcript)')
  lines.push('')
  if (filler) {
    const rate = filler.perMinute != null ? `${filler.perMinute.toFixed(1)} per minute` : 'rate unknown'
    lines.push(`FILLER-WORD SUMMARY (computed locally, do not recompute):`)
    lines.push(`- Total: ${filler.total} (${rate})`)
    const top = Object.entries(filler.byWord || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w, c]) => `${w} ×${c}`)
    if (top.length) lines.push(`- Most frequent: ${top.join(', ')}`)
  }
  if (stories?.length) {
    lines.push('')
    lines.push(storiesBlock(stories))
  }
  if (projects?.length) {
    lines.push('')
    lines.push(projectsBlock(projects))
  }
  if (job) {
    lines.push('')
    lines.push(jobBlock(job))
  }
  return lines.join('\n')
}

export function makeLlmAnalyzer(criteria: Criteria = DEFAULT_CRITERIA) {
  return {
    id: criteria.id,
    label: criteria.label,
    async run(ctx: AnalyzerContext): Promise<LlmAnalyzerResult> {
      const user = buildUserMessage({
        question: ctx.question,
        transcript: ctx.transcript,
        durationSec: ctx.durationSec,
        filler: ctx.filler,
        stories: ctx.stories,
        projects: ctx.projects,
        job: ctx.job,
      })

      const { parsed, raw } = await chatStructured<StarGrading>({
        provider: 'anthropic',
        model: criteria.model,
        system: criteria.systemPrompt,
        user,
        schema: criteria.schema,
        maxTokens: criteria.maxTokens,
        signal: ctx.signal,
      })

      return {
        id: criteria.id,
        label: criteria.label,
        status: 'ok',
        scores: parsed.scores || {},
        findings: parsed.coachingNotes || [],
        summary: parsed.summary || '',
        raw: parsed,
        rawResponse: raw,
      }
    },
  }
}
