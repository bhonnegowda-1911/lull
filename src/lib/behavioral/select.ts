import { selectPromptRound, type SelectOptions } from '../promptRoundSelect'
import { BEHAVIORAL_SELECT_CRITERIA } from '../../data/behavioralCriteria'
import type { JobDescription, BehavioralPick } from '../../types'

// JD → ranked behavioral/managerial questions. Matches the job's stated values to the curated bank
// (see behavioralCriteria), excluding the recruiter-screen set — those get their own round/section.
// `opts.interviewerContext` (the round's notes) biases the ranking toward what this interviewer asks.
export function selectBehavioralQuestions(job: JobDescription, opts?: SelectOptions): Promise<BehavioralPick[]> {
  return selectPromptRound(job, BEHAVIORAL_SELECT_CRITERIA, (category) => category !== 'Recruiter screen', opts)
}
