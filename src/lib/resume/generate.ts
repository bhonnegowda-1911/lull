import { chatStructured } from '../llmClient'
import { RESUME_GEN_CRITERIA } from '../../data/resumeCriteria'
import { FACETS, facetText, type Project } from '../../data/projects'
import { emptyStory, type Story, type Profile } from '../../data/stories'
import type { GeneratedResume, ParsedJob, ResumeFit } from '../../types'

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

/** Turn the prior resume↔JD fit run into an explicit worklist of what to SURFACE while tailoring: the
 *  requirements the stored resume under-evidences and the gaps the analyzer thinks the candidate can
 *  actually close from their own history. This is the signal that tells the generator where to promote
 *  latent story/project experience instead of just echoing the resume verbatim. Pure. */
export function serializeTailoringTargets(fit: ResumeFit): string {
  const weak = fit.requirementCoverage.filter((r) => r.status !== 'covered')
  // 'reword' = they likely have it, resume just doesn't show it; 'add_story' = a story covers it.
  // 'genuine_gap' is a real missing qualification — surface it so the model does NOT try to fake it.
  const closeable = fit.gaps.filter((g) => g.fixable === 'reword' || g.fixable === 'add_story')
  const realGaps = fit.gaps.filter((g) => g.fixable === 'genuine_gap')

  const lines: string[] = [
    'FIT ANALYSIS OF THE STORED RESUME AGAINST THIS JOB — use it to decide what to SURFACE (do NOT invent):',
  ]
  if (fit.keywordCoverage.missing.length)
    lines.push(`- JD keywords the stored resume is missing: ${fit.keywordCoverage.missing.join(', ')}`)
  if (weak.length) {
    lines.push('- Requirements the stored resume under-evidences (surface real experience for these from ANY source — resume, stories, or projects):')
    for (const r of weak) lines.push(`    • [${r.status}] ${r.requirement}`)
  }
  if (closeable.length) {
    lines.push('- Gaps the analyzer believes you can close from your own history — pull the matching story/project forward as a bullet:')
    for (const g of closeable) lines.push(`    • (${g.fixable}) ${g.title}: ${g.detail}`)
  }
  if (realGaps.length) {
    lines.push('- GENUINE gaps (no source supports these — do NOT fabricate experience for them):')
    for (const g of realGaps) lines.push(`    • ${g.title}`)
  }
  return lines.join('\n')
}

/** A gap the candidate answered with a fresh story while tailoring: the JD requirement (from the fit
 *  run) and the candidate's own note describing the real experience that covers it. */
export interface GapFill {
  requirement: string
  note: string
}

/** Turn gap answers the candidate typed at generate-time into first-class Story sources so the
 *  generator can ground bullets on them exactly like bank stories (sourceStoryId → id). Ids are
 *  deterministic `gapfill-N` so provenance stays checkable; the note becomes the story situation and
 *  the requirement its title so the tailoring targets line up. Empty notes are dropped. Pure. */
export function gapFillsToStories(fills: GapFill[]): Story[] {
  return fills
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.note.trim())
    .map(({ f, i }) => {
      const s = emptyStory(`gapfill-${i}`)
      s.title = f.requirement.trim() || `Gap ${i + 1}`
      s.star.situation = f.note.trim()
      s.status = 'draft'
      return s
    })
}

/** Deterministic one-page guard. Even with firm length rules in the prompt, the model sometimes
 *  overshoots and the exported resume spills onto a second page. This caps the bullet count so it
 *  can't — keeping the model's ordering (it's told to lead with the most JD-relevant bullets): the
 *  most recent role keeps up to FIRST_ROLE_BULLETS, older roles up to OLDER_ROLE_BULLETS, with a hard
 *  overall ceiling. Trimming only removes the least-relevant trailing bullets; nothing is reworded.
 *  Pure, so it's unit-tested. */
export function trimResumeToOnePage(resume: GeneratedResume): GeneratedResume {
  const FIRST_ROLE_BULLETS = 5
  const OLDER_ROLE_BULLETS = 3
  const MAX_TOTAL_BULLETS = 15
  let used = 0
  const experience = resume.experience.map((exp, i) => {
    const cap = i === 0 ? FIRST_ROLE_BULLETS : OLDER_ROLE_BULLETS
    const remaining = Math.max(0, MAX_TOTAL_BULLETS - used)
    const bullets = exp.bullets.slice(0, Math.min(cap, remaining))
    used += bullets.length
    return { ...exp, bullets }
  })
  return { ...resume, experience }
}

/** Render a generated resume to markdown — used for both export and re-scoring against the JD. Pure. */
export function resumeToMarkdown(resume: GeneratedResume): string {
  const out: string[] = []
  if (resume.header.name) out.push(`# ${resume.header.name}`)
  if (resume.header.title) out.push(`_${resume.header.title}_`)
  if (resume.header.contact) out.push(resume.header.contact)
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

/** A safe download filename for the resume, slugified from the candidate's name. Pure. */
export function resumeFileName(resume: GeneratedResume, ext: 'pdf' | 'docx' = 'pdf'): string {
  const slug = (resume.header.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `${slug}-resume.${ext}` : `resume.${ext}`
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
  fit,
  signal,
}: {
  profile: Profile
  stories: Story[]
  projects: Project[]
  /** The parsed target job to tailor toward; omit for a generic resume. */
  job?: ParsedJob | null
  /** The prior resume↔JD fit run, if one exists — its gaps/coverage tell the generator which real
   *  experience the stored resume failed to surface, so tailoring promotes it instead of parroting. */
  fit?: ResumeFit | null
  signal?: AbortSignal
}): Promise<GeneratedResume> {
  const user = [
    job ? `TARGET JOB (tailor toward this, but only with real experience):\n${JSON.stringify(job, null, 2)}` : 'NO TARGET JOB — write a strong generic resume.',
    ...(job && fit ? [serializeTailoringTargets(fit)] : []),
    serializeSources({ profile, stories, projects }),
  ].join('\n\n')

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
  // Backstop the prompt's length rules so an over-eager draft can never overflow a page.
  return trimResumeToOnePage(parsed)
}
