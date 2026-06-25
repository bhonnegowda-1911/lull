import { chatStructured } from '../llmClient'
import { PREP_PLAN_CRITERIA } from '../../data/prepPlanCriteria'
import { getProblem } from '../../data/sysdesign/problems'
import { getPrompt } from '../../data/prompts'
import { roundCatalog, roundLabel } from '../../data/rounds'
import { activeRounds, addDays, daysBetween, toISODate } from './schedule'
import type {
  Application,
  GlobalPrepDay,
  GlobalPrepPlan,
  GlobalPrepTask,
  InterviewRoundInstance,
  JobDescription,
  RoundType,
} from '../../types'

// One cross-application prep plan, built from ALL active interviews at once. Each in-flight company
// contributes its active (current-stage) scheduled round; a single LLM call lays out a day-by-day
// schedule across the parallel loops — respecting each interview's deadline and balancing daily load —
// and every task is attributed back to the interview it serves. Replaces the per-round prepPlan +
// client-side agenda merge. Regeneration is driven by `prepInputSignature`: when the active interviews
// change, the stored plan's signature no longer matches and the UI offers a rebuild.

const MAX_DAYS = 21

/** Application statuses that are no longer in flight — their rounds don't feed the plan. */
const TERMINAL: ReadonlySet<Application['status']> = new Set(['rejected', 'withdrawn', 'accepted'])

/** One scheduled interview to prep: a round from a company's active session (an onsite contributes
 *  several). Already known to have a date. */
export interface ActiveInterview {
  jobId: string
  company: string
  role: string
  round: InterviewRoundInstance
}

/** The named items a round is likely to cover, resolved from the job's saved picks via the round's
 *  catalog pick-source. Project/custom rounds have no curated picks — they lean on topic/focus areas. */
function roundItems(job: JobDescription, type: RoundType): string[] {
  switch (roundCatalog(type).picks) {
    case 'recruiter':
      return job.recruiterPicks.map((p) => getPrompt(p.promptId).label)
    case 'behavioral':
      return job.behavioralPicks.map((p) => getPrompt(p.promptId).label)
    case 'problem':
      return job.problemPicks.map((p) => getProblem(p.problemId).title)
    case 'mixed':
      return [
        ...job.behavioralPicks.map((p) => getPrompt(p.promptId).label),
        ...job.problemPicks.map((p) => getProblem(p.problemId).title),
      ]
    default:
      return []
  }
}

/**
 * Every in-flight company's active-session interviews that have a date — the units the plan is built
 * from. A bundled onsite contributes each of its dated rounds. Sorted soonest-first (then by jobId)
 * so the numbering is stable for the prompt and the signature.
 */
export function activeInterviews(jobs: JobDescription[]): ActiveInterview[] {
  return jobs
    .flatMap((job): ActiveInterview[] => {
      const app = job.application
      if (!app || TERMINAL.has(app.status)) return []
      return activeRounds(app)
        .filter((round) => round.scheduledAt)
        .map((round) => ({ jobId: job.id, company: job.company || job.title, role: job.title, round }))
    })
    .sort((a, b) =>
      a.round.scheduledAt! !== b.round.scheduledAt!
        ? a.round.scheduledAt! < b.round.scheduledAt!
          ? -1
          : 1
        : a.jobId < b.jobId
          ? -1
          : 1,
    )
}

/**
 * A stable fingerprint of the inputs that should trigger a rebuild. Covers each active interview's
 * round identity, date, outcome, manual grounding, and predicted items — but NOT today's date, so the
 * plan isn't marked stale just because a day passed (past days are dropped at render time instead).
 */
export function prepInputSignature(jobs: JobDescription[], findJob = byId(jobs)): string {
  const norm = activeInterviews(jobs).map((i) => {
    const job = findJob(i.jobId)
    return {
      jobId: i.jobId,
      roundId: i.round.id,
      type: i.round.type,
      label: i.round.label,
      scheduledAt: i.round.scheduledAt,
      outcome: i.round.outcome,
      topic: i.round.topic ?? '',
      focusAreas: (i.round.focusAreas ?? []).filter((a) => a.trim()),
      items: job ? roundItems(job, i.round.type) : [],
    }
  })
  return JSON.stringify(norm)
}

function byId(jobs: JobDescription[]) {
  const map = new Map(jobs.map((j) => [j.id, j]))
  return (id: string) => map.get(id) ?? null
}

type RawTask = { interview: number | null; round: GlobalPrepTask['round']; text: string }
type RawDay = { dayIndex: number; focus: string; tasks: RawTask[] }

/**
 * Generate the single cross-application prep plan from every active interview. dayIndex 1 = today,
 * counting forward to the furthest interview within the window (capped at MAX_DAYS). Returns an empty
 * plan when nothing is scheduled.
 */
export async function generateGlobalPrepPlan(
  jobs: JobDescription[],
  signal?: AbortSignal,
): Promise<GlobalPrepPlan> {
  const today = toISODate()
  const interviews = activeInterviews(jobs)
  const signature = prepInputSignature(jobs)

  if (interviews.length === 0) {
    return { generatedAt: new Date().toISOString(), signature, days: [] }
  }

  const findJob = byId(jobs)
  // Each interview's calendar day (today = day 1) and the plan window: out to the furthest interview,
  // clamped to MAX_DAYS so the run-up stays actionable.
  const withDay = interviews.map((i) => ({ ...i, day: daysBetween(today, i.round.scheduledAt!) + 1 }))
  const span = Math.min(Math.max(...withDay.map((i) => i.day), 1), MAX_DAYS)

  const lines = withDay.map((i, idx) => {
    const job = findJob(i.jobId)
    const items = job ? roundItems(job, i.round.type) : []
    const focus = (i.round.focusAreas ?? []).filter((a) => a.trim())
    return [
      `${idx + 1}. ${i.company} — ${i.role} · ${i.round.label || roundLabel(i.round.type)} · interview on day ${i.day} (${i.round.scheduledAt})`,
      i.round.topic ? `   About: ${i.round.topic}` : '',
      focus.length ? `   Focus areas (the candidate flagged these): ${focus.join('; ')}` : '',
      items.length ? `   Likely items: ${items.join('; ')}` : '   Likely items: (none selected — build general prep from the round + focus areas)',
    ]
      .filter(Boolean)
      .join('\n')
  })

  const user = [
    `TODAY is day 1. Build ONE plan over exactly ${span} day(s) (dayIndex 1..${span}).`,
    `These interviews run in parallel — reference each by its number:`,
    '',
    lines.join('\n'),
  ].join('\n')

  const { parsed } = await chatStructured<{ days: RawDay[] }>({
    provider: 'anthropic',
    model: PREP_PLAN_CRITERIA.model,
    system: PREP_PLAN_CRITERIA.systemPrompt,
    user,
    schema: PREP_PLAN_CRITERIA.schema,
    maxTokens: 3000,
    signal,
  })

  const days: GlobalPrepDay[] = parsed.days
    .filter((d) => d.dayIndex >= 1 && d.dayIndex <= span)
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((d) => ({
      date: addDays(today, d.dayIndex - 1),
      focus: d.focus,
      tasks: d.tasks.map((t) => {
        const iv = t.interview != null ? withDay[t.interview - 1] : undefined
        const task: GlobalPrepTask = { round: t.round, text: t.text, done: false }
        if (iv) {
          task.jobId = iv.jobId
          task.company = iv.company
          task.role = iv.role
          task.roundLabel = iv.round.label || roundLabel(iv.round.type)
        }
        return task
      }),
    }))

  return { generatedAt: new Date().toISOString(), signature, days }
}
