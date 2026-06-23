import { chatStructured } from '../llmClient'
import { RESUME_GEN_CRITERIA } from '../../data/resumeCriteria'
import { FACETS, facetText, type Project } from '../../data/projects'
import type { Story, Profile } from '../../data/stories'
import type { GeneratedResume, ParsedJob } from '../../types'

// Generate a JD-targeted resume grounded STRICTLY in the candidate's own ground truth (story bank +
// project facets). The generator's objective is the Phase-1 fit score: a tailored draft should beat
// the stored resume against the same JD (see MatchTab's "Score this draft"). The grounding rule —
// every bullet traces to a provided story/project id, no invented metrics — lives in the system
// prompt (resumeCriteria.ts); here we just serialize the sources and make one structured call.

/** Serialize the candidate's roles, stories, and project facets into grounded source material with
 *  ids the model must cite back as bullet provenance. Pure, so it's unit-tested. */
export function serializeSources({
  profile,
  stories,
  projects,
}: {
  profile: Profile
  stories: Story[]
  projects: Project[]
}): string {
  const roles = profile.roles.length
    ? profile.roles
        .map((r) => `- ${r.title || '(role)'} @ ${r.company || '(company)'}${r.start || r.end ? ` (${r.start ?? '?'}–${r.end ?? 'present'})` : ''}`)
        .join('\n')
    : '(no roles on file)'

  const storyBlock = stories.length
    ? stories
        .map((s) => {
          const lines = [`STORY id=${s.id} — ${s.title || '(untitled)'}${s.roleRef ? ` [${s.roleRef}]` : ''}`]
          if (s.star.situation) lines.push(`  Situation: ${s.star.situation}`)
          if (s.star.task) lines.push(`  Task: ${s.star.task}`)
          if (s.star.actions?.length) lines.push(`  Actions: ${s.star.actions.join('; ')}`)
          if (s.star.result) lines.push(`  Result: ${s.star.result}`)
          if (s.star.takeaway) lines.push(`  Takeaway: ${s.star.takeaway}`)
          if (s.impact.metrics?.length) lines.push(`  Metrics: ${s.impact.metrics.join('; ')}`)
          lines.push(`  Ownership: ${s.impact.ownership}; blast radius: ${s.impact.blastRadius}`)
          return lines.join('\n')
        })
        .join('\n\n')
    : '(no stories)'

  const projectBlock = projects.length
    ? projects
        .map((p) => {
          const lines = [`PROJECT id=${p.id} — ${p.title || '(untitled)'}${p.roleRef ? ` [${p.roleRef}]` : ''}`]
          if (p.summary) lines.push(`  Summary: ${p.summary}`)
          for (const f of FACETS) {
            const t = facetText(p.facets?.[f.id]).trim()
            if (t) lines.push(`  ${f.label}: ${t}`)
          }
          return lines.join('\n')
        })
        .join('\n\n')
    : '(no projects)'

  const resumeBlock = profile.resumeText.trim() || '(no resume on file)'

  return [
    `CANDIDATE ROLES (group experience under these, use their dates):\n${roles}`,
    '',
    `EXISTING RESUME — reuse its real companies/titles/dates/bullets; for bullets taken from here set sourceResume true:\n${resumeBlock}`,
    '',
    `STORY BANK — cite the id as sourceStoryId:\n${storyBlock}`,
    '',
    `PROJECTS — cite the id as sourceProjectId:\n${projectBlock}`,
  ].join('\n')
}

/** Render a generated resume to markdown — used for both export and re-scoring against the JD. Pure. */
export function resumeToMarkdown(resume: GeneratedResume): string {
  const out: string[] = []
  if (resume.header.headline) out.push(`# ${resume.header.headline}`)
  if (resume.header.targetRole) out.push(`_Target: ${resume.header.targetRole}_`)
  if (resume.summary) out.push('', resume.summary)
  if (resume.skills.length) {
    out.push('', '## Skills')
    for (const s of resume.skills) out.push(`- **${s.category}:** ${s.items.join(', ')}`)
  }
  if (resume.experience.length) {
    out.push('', '## Experience')
    for (const e of resume.experience) {
      out.push('', `### ${e.role} — ${e.company}${e.dates ? ` (${e.dates})` : ''}`)
      for (const b of e.bullets) out.push(`- ${b.text}${b.metric ? ` (${b.metric})` : ''}`)
    }
  }
  return out.join('\n')
}

/** Bullets whose provenance doesn't resolve to a story/project id or the resume — the grounding check. Pure. */
export function ungroundedBullets(
  resume: GeneratedResume,
  known: { storyIds: Set<string>; projectIds: Set<string> },
): string[] {
  const bad: string[] = []
  for (const exp of resume.experience) {
    for (const b of exp.bullets) {
      const okStory = b.sourceStoryId != null && known.storyIds.has(b.sourceStoryId)
      const okProject = b.sourceProjectId != null && known.projectIds.has(b.sourceProjectId)
      if (!okStory && !okProject && !b.sourceResume) bad.push(b.text)
    }
  }
  return bad
}

export async function generateResume({
  profile,
  stories,
  projects,
  job,
  signal,
}: {
  profile: Profile
  stories: Story[]
  projects: Project[]
  /** The parsed target job to tailor toward; omit for a generic resume. */
  job?: ParsedJob | null
  signal?: AbortSignal
}): Promise<GeneratedResume> {
  const user = [
    job ? `TARGET JOB (tailor toward this, but only with real experience):\n${JSON.stringify(job, null, 2)}` : 'NO TARGET JOB — write a strong generic resume.',
    '',
    serializeSources({ profile, stories, projects }),
  ].join('\n')

  const { parsed } = await chatStructured<GeneratedResume>({
    provider: 'anthropic',
    model: RESUME_GEN_CRITERIA.model,
    system: RESUME_GEN_CRITERIA.systemPrompt,
    user,
    schema: RESUME_GEN_CRITERIA.schema,
    maxTokens: 3500,
    // Opus 4.7 rejects `temperature` — omit it (steer via prompt instead).
    signal,
  })
  return parsed
}
