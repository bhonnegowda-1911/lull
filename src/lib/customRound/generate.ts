import { chatStructured } from '../llmClient'
import { CUSTOM_ROUND_CRITERIA } from '../../data/customRoundCriteria'
import { roundCatalog } from '../../data/rounds'
import type { CustomRoundPrep, InterviewRoundInstance, JobDescription } from '../../types'

// Round (custom / take-home) → bespoke prep brief. There's no canonical bank for these, so this
// AUTHORS the prep (see customRoundCriteria) grounded in what the candidate knows about the round:
// its topic, focus areas, first-hand interviewer notes, and the JD. Returns a stamped CustomRoundPrep.

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
  return [
    'Author prep for this round. First infer WHO is interviewing (role/seniority) and the company\'s',
    'STAGE from the intel and JD, then build the questions around that read.',
    '',
    notes,
    `ROUND: ${round.label} (${roundCatalog(round.type).label})`,
    `ABOUT THIS ROUND: ${round.topic?.trim() || '(not specified)'}`,
    `FOCUS AREAS: ${focusAreas.length ? focusAreas.join(', ') : '(not specified)'}`,
    `\nPARSED JOB STRUCTURE:\n${jobLines.join('\n')}`,
    `\nRAW JOB DESCRIPTION:\n${job.rawText.trim()}`,
  ].join('\n')
}

/** True when there's enough round context to author meaningful prep (topic, focus, or notes). */
export function hasCustomPrepContext(round: InterviewRoundInstance): boolean {
  return !!(round.topic?.trim() || (round.focusAreas ?? []).some((a) => a.trim()) || round.notes?.trim())
}

export async function generateCustomRoundPrep(
  round: InterviewRoundInstance,
  job: JobDescription,
  signal?: AbortSignal,
): Promise<CustomRoundPrep> {
  const { parsed } = await chatStructured<Omit<CustomRoundPrep, 'generatedAt'>>({
    provider: 'anthropic',
    model: CUSTOM_ROUND_CRITERIA.model,
    system: CUSTOM_ROUND_CRITERIA.systemPrompt,
    user: roundContext(round, job),
    schema: CUSTOM_ROUND_CRITERIA.schema,
    // Authors a full prep brief (summary + items + prepActions) with adaptive thinking, which shares
    // the max_tokens budget — needs headroom or it truncates and fails to parse.
    maxTokens: 6000,
    thinking: 'adaptive',
    signal,
  })
  return { ...parsed, generatedAt: new Date().toISOString() }
}
