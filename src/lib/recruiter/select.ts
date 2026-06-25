import { selectPromptRound, type SelectOptions } from '../promptRoundSelect'
import { RECRUITER_SELECT_CRITERIA } from '../../data/recruiterCriteria'
import type { JobDescription, RecruiterPick } from '../../types'

// JD → ranked recruiter-screen questions. Matches the job to the curated bank's "Recruiter screen"
// set only (motivation, logistics, high-level fit) — see recruiterCriteria for the why.
// `opts.interviewerContext` (the round's notes) biases the ranking toward what this recruiter asks.
export function selectRecruiterQuestions(job: JobDescription, opts?: SelectOptions): Promise<RecruiterPick[]> {
  return selectPromptRound(job, RECRUITER_SELECT_CRITERIA, (category) => category === 'Recruiter screen', opts)
}
