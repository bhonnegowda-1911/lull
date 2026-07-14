import { resumeToMarkdown, ungroundedBullets } from '../lib/resume/generate'
import type { GeneratedResume, ParsedJob } from '../types'

// Deterministic, offline scorers for a generated resume — the L0 (grounding/faithfulness) and
// L2 (gap-surfacing) layers of the resume eval. Everything here is pure so it runs in `npm test`
// at zero API cost and pins down the failures that matter most: fabrication and dropped answers.
// The subjective layers (tailoring lift, voice) live in the model-driven runner (resume.eval.ts).

/** Number-ish tokens the way a reader sees them: "40%", "2M", "800ms", "3x", "12". Used to catch a
 *  metric that appears in the resume but in none of the candidate's sources (an invented number). */
export function numericTokens(text: string): string[] {
  // Unit order matters: longer units first (ms before m, hrs before s) so "480ms" isn't cut to "480m".
  return (text.toLowerCase().match(/\d[\d.,]*\s*(?:%|ms|hrs?|s|x|k|m|b)?/g) ?? []).map((t) => t.replace(/\s+/g, ''))
}

/** Numbers asserted in the resume that appear in NONE of the candidate's source material — the
 *  hallucinated-metric check. `sourceText` is everything the model was grounded on (serializeSources
 *  output is ideal). Returns the offending tokens; empty is a pass. */
export function numericHallucinations(resume: GeneratedResume, sourceText: string): string[] {
  const known = new Set(numericTokens(sourceText))
  const bad: string[] = []
  for (const exp of resume.experience) {
    for (const b of exp.bullets) {
      for (const tok of numericTokens(`${b.text} ${b.metric ?? ''}`)) {
        // Ignore bare year-like / single-digit noise; flag substantive metrics only.
        if (tok.length >= 2 && !known.has(tok)) bad.push(tok)
      }
    }
  }
  return bad
}

/** True when the header identity is copied, not invented: the name is non-empty and every contact
 *  token the model emitted actually occurs in the candidate's real resume text. */
export function identityPreserved(resume: GeneratedResume, resumeText: string): boolean {
  const hay = resumeText.toLowerCase()
  if (!resume.header.name.trim()) return false
  if (!hay.includes(resume.header.name.toLowerCase().trim())) return false
  const contactBits = resume.header.contact.split(/[·|,\n]/).map((s) => s.trim()).filter(Boolean)
  return contactBits.every((bit) => hay.includes(bit.toLowerCase()))
}

/** Skill categories the model emitted that DON'T appear in the source resume — i.e. re-categorization,
 *  which the prompt forbids. The one sanctioned new category ("AI / Developer Tools" for Claude) is
 *  allowed via `allow`. Empty result is a pass. */
export function inventedSkillCategories(resume: GeneratedResume, resumeText: string, allow: RegExp = /ai|developer tools/i): string[] {
  const hay = resumeText.toLowerCase()
  return resume.skills
    .map((s) => s.category)
    .filter((c) => !hay.includes(c.toLowerCase().trim()) && !allow.test(c))
}

/** Fraction (0–1) of the JD's must-have skills + ATS keywords whose terms appear in the resume text.
 *  A coarse coverage proxy for the deterministic layer; the real lift metric is the re-score. */
export function requirementCoverage(resume: GeneratedResume, job: ParsedJob): number {
  const hay = resumeToMarkdown(resume).toLowerCase()
  const terms = [...job.mustHaveSkills.map((s) => s.skill), ...job.keywords].map((t) => t.toLowerCase().trim()).filter(Boolean)
  if (!terms.length) return 1
  const hit = terms.filter((t) => hay.includes(t)).length
  return hit / terms.length
}

/** The gap-surfacing check (this feature's core): each marker phrase from a provided gap-fill answer
 *  must appear in the resume, AND at least one bullet must cite a `gapfill-*` source. Returns the
 *  markers that never made it in — empty is a pass. */
export function gapMarkersMissing(resume: GeneratedResume, markers: string[]): string[] {
  const hay = resumeToMarkdown(resume).toLowerCase()
  return markers.filter((m) => !hay.includes(m.toLowerCase().trim()))
}

/** True if any bullet is grounded on a gap-fill story (id `gapfill-*`) — proves the answers were used,
 *  not silently dropped. */
export function usesGapFillSource(resume: GeneratedResume): boolean {
  return resume.experience.some((e) => e.bullets.some((b) => b.sourceStoryId?.startsWith('gapfill-')))
}

/** Terms the resume must NOT assert (genuine gaps with no supporting source and no gap-fill) that
 *  nonetheless show up — an over-claim. Empty is a pass. */
export function overClaimedTerms(resume: GeneratedResume, mustNotClaim: string[]): string[] {
  const hay = resumeToMarkdown(resume).toLowerCase()
  return mustNotClaim.filter((t) => hay.includes(t.toLowerCase().trim()))
}

/** Roll the deterministic checks into one report for a case run. `known` powers the grounding check. */
export function scoreResume(args: {
  resume: GeneratedResume
  job: ParsedJob
  resumeText: string
  sourceText: string
  known: { storyIds: Set<string>; projectIds: Set<string> }
  gapMarkers?: string[]
  mustNotClaim?: string[]
}) {
  const { resume, job, resumeText, sourceText, known, gapMarkers = [], mustNotClaim = [] } = args
  const ungrounded = ungroundedBullets(resume, known)
  const halluc = numericHallucinations(resume, sourceText)
  const badCats = inventedSkillCategories(resume, resumeText)
  const missingMarkers = gapMarkersMissing(resume, gapMarkers)
  const overClaims = overClaimedTerms(resume, mustNotClaim)
  return {
    grounded: ungrounded.length === 0,
    ungroundedBullets: ungrounded,
    noInventedMetrics: halluc.length === 0,
    inventedMetrics: halluc,
    identityPreserved: identityPreserved(resume, resumeText),
    skillsFaithful: badCats.length === 0,
    inventedSkillCategories: badCats,
    requirementCoverage: requirementCoverage(resume, job),
    gapsSurfaced: missingMarkers.length === 0 && (gapMarkers.length === 0 || usesGapFillSource(resume)),
    missingGapMarkers: missingMarkers,
    noOverClaims: overClaims.length === 0,
    overClaims,
  }
}
