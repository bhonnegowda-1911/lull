import { selectPromptRound } from '../promptRoundSelect'
import { BEHAVIORAL_SELECT_CRITERIA } from '../../data/behavioralCriteria'
import type { JobDescription, BehavioralPick } from '../../types'

// JD → ranked behavioral/managerial questions. Matches the job's stated values to the curated bank
// (see behavioralCriteria), excluding the recruiter-screen set — those get their own round/section.
export function selectBehavioralQuestions(job: JobDescription, signal?: AbortSignal): Promise<BehavioralPick[]> {
  return selectPromptRound(job, BEHAVIORAL_SELECT_CRITERIA, (category) => category !== 'Recruiter screen', signal)
}
