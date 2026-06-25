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
  const notes = round.notes?.trim()
    ? `\n\nCANDIDATE'S FIRST-HAND NOTES ABOUT THIS INTERVIEWER / ROUND (weight this most — it's the sharpest signal of what they'll actually focus on):\n${round.notes.trim()}`
    : ''
  return [
    `ROUND: ${round.label} (${roundCatalog(round.type).label})`,
    `ABOUT THIS ROUND: ${round.topic?.trim() || '(not specified)'}`,
    `FOCUS AREAS: ${focusAreas.length ? focusAreas.join(', ') : '(not specified)'}`,
    notes,
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
    maxTokens: 2000,
    thinking: 'adaptive',
    signal,
  })
  return { ...parsed, generatedAt: new Date().toISOString() }
}
