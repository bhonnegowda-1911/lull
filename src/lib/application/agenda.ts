import { nextInterview, toISODate } from './schedule'
import type { InterviewRoundInstance, JobDescription } from '../../types'

// The cross-application "upcoming" rail: the next scheduled interview per company. The day-by-day
// schedule itself now lives in the single GlobalPrepPlan (see globalPrepPlan.ts) rather than being
// merged here from per-round plans.

/** A company's next scheduled, not-yet-decided interview — for the "upcoming" rail. */
export interface UpcomingRound {
  jobId: string
  company: string
  role: string
  round: InterviewRoundInstance
}

/** The next interview per company, soonest first — null-safe and sorted by date. */
export function upcomingRounds(jobs: JobDescription[], today = toISODate()): UpcomingRound[] {
  return jobs
    .map((job) => {
      const round = nextInterview(job.application, today)
      return round ? { jobId: job.id, company: job.company || job.title, role: job.title, round } : null
    })
    .filter((u): u is UpcomingRound => u !== null)
    .sort((a, b) => (a.round.scheduledAt! < b.round.scheduledAt! ? -1 : 1))
}
