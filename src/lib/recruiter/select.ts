import { selectPromptRound } from '../promptRoundSelect'
import { RECRUITER_SELECT_CRITERIA } from '../../data/recruiterCriteria'
import type { JobDescription, RecruiterPick } from '../../types'

// JD → ranked recruiter-screen questions. Matches the job to the curated bank's "Recruiter screen"
// set only (motivation, logistics, high-level fit) — see recruiterCriteria for the why.
export function selectRecruiterQuestions(job: JobDescription, signal?: AbortSignal): Promise<RecruiterPick[]> {
  return selectPromptRound(job, RECRUITER_SELECT_CRITERIA, (category) => category === 'Recruiter screen', signal)
}
