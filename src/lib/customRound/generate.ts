import { chatStructured } from '../llmClient'
import { CUSTOM_ROUND_CRITERIA } from '../../data/customRoundCriteria'
import { LEADERSHIP_ROUND_CRITERIA } from '../../data/leadershipRoundCriteria'
import { specializedRoundBrief } from '../../data/specializedRoundBriefs'
import { roundCatalog } from '../../data/rounds'
import type { CustomRoundPrep, InterviewRoundInstance, JobDescription } from '../../types'

// No-bank round (custom / take-home / leadership / specialized onsite exercises) → bespoke prep brief.
// There's no canonical bank for these, so this AUTHORS the prep grounded in what the candidate knows
// about the round: its topic, focus areas, first-hand interviewer notes, and the JD. Leadership rounds
// (CEO / head of engineering) use their own criteria — a leader evaluates through a different lens.
// Specialized onsite rounds (refactoring / AI-building / architecture / working-with-product) use the
// generic authoring criteria PLUS a per-type format brief (specializedRoundBriefs) injected below, so
// each generates the right KIND of exercise separately. Returns a stamped CustomRoundPrep.

function roundContext(round: InterviewRoundInstance, job: JobDescription): string {
  const focusAreas = (round.focusAreas ?? []).filter((a) => a.trim())
  const p = job.parsed
  const jobLines = p
    ? [`Title: ${p.title}`, `Company: ${p.company}`, `Seniority: ${p.seniority}`, `Responsibilities: ${p.responsibilities.join(' | ')}`]
    : [`Title: ${job.title}`, `Company: ${job.company}`]
  // The candidate's own notes are the sharpest signal — who's interviewing, format, what to expect.
  // Lead with them (when present) so the interviewer/stage read is anchored on first-hand intel.
  const notes = round.notes?.trim()
    ? `INTERVIEWER / ROUND INTEL — the candidate's first-hand notes (WEIGHT THIS MOST; it's the truest signal of who's interviewing and what they'll actually probe):\n${round.notes.trim()}\n`
    : `INTERVIEWER / ROUND INTEL: (none given — infer the likely interviewer and company stage from the round label and the JD below)\n`
  // Specialized onsite rounds have a very specific FORMAT (a refactoring exercise, an AI build, an
  // architecture design, a product conversation). Inject that format brief so the authored items are the
  // right kind of exercise for THIS round, not generic questions.
  const format = specializedRoundBrief(round.type)
  const formatBlock = format
    ? `\nWHAT THIS ROUND IS — author the prep to fit THIS exact format; the items must be exercises/questions of this kind:\n${format}\n`
    : ''
  return [
    'Author prep for this round. First infer WHO is interviewing (role/seniority) and the company\'s',
    'STAGE from the intel and JD, then build the questions/exercises around that read.',
    '',
    notes,
    formatBlock,
    `ROUND: ${round.label} (${roundCatalog(round.type).label})`,
    `ABOUT THIS ROUND: ${round.topic?.trim() || '(not specified)'}`,
    `FOCUS AREAS: ${focusAreas.length ? focusAreas.join(', ') : '(not specified)'}`,
    `\nPARSED JOB STRUCTURE:\n${jobLines.join('\n')}`,
    `\nRAW JOB DESCRIPTION:\n${job.rawText.trim()}`,
  ].join('\n')
}

/** True when there's enough round context to author meaningful prep (topic, focus, or notes). A
 *  leadership round and the specialized onsite rounds are the exception: the round type itself plus the
 *  JD supplies the frame (a known interviewer or a known exercise format), so they can be authored even
 *  with no topic/focus/notes entered. */
export function hasCustomPrepContext(round: InterviewRoundInstance): boolean {
  if (round.type === 'leadership' || specializedRoundBrief(round.type)) return true
  return !!(round.topic?.trim() || (round.focusAreas ?? []).some((a) => a.trim()) || round.notes?.trim())
}

export async function generateCustomRoundPrep(
  round: InterviewRoundInstance,
  job: JobDescription,
  signal?: AbortSignal,
): Promise<CustomRoundPrep> {
  const criteria = round.type === 'leadership' ? LEADERSHIP_ROUND_CRITERIA : CUSTOM_ROUND_CRITERIA
  const { parsed } = await chatStructured<Omit<CustomRoundPrep, 'generatedAt'>>({
    provider: 'anthropic',
    model: criteria.model,
    system: criteria.systemPrompt,
    user: roundContext(round, job),
    schema: criteria.schema,
    // Authors a full prep brief (summary + items + prepActions) with adaptive thinking, which shares
    // the max_tokens budget — needs headroom or it truncates and fails to parse.
    maxTokens: 6000,
    thinking: 'adaptive',
    signal,
  })
  return { ...parsed, generatedAt: new Date().toISOString() }
}
