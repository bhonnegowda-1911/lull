import { getProblem as getCodingProblem } from '../../data/coding/problems'
import { getProblem } from '../../data/sysdesign/problems'
import { getPrompt } from '../../data/prompts'
import { roundCatalog, roundLabel, type PracticeMode } from '../../data/rounds'
import { activeRounds, addDays, daysBetween, toISODate } from './schedule'
import type {
  Application,
  GlobalPrepDay,
  GlobalPrepPlan,
  GlobalPrepTask,
  InterviewRoundInstance,
  JobDescription,
  PrepTaskLink,
  RoundType,
} from '../../types'

// One cross-application prep plan, built from ALL active interviews at once. Each in-flight company
// contributes its active (current-stage) scheduled round, and every round already carries the exact
// questions to practice (the JD-selector picks saved on the job). This lays those SAME saved items out
// deterministically day-by-day across the parallel loops — front-loading each interview's reps in its
// run-up and closing with a timed mock — instead of re-inventing tasks with an LLM. Every task is
// attributed back to the interview it serves. Regeneration is driven by `prepInputSignature`: when the
// active interviews or their picks change, the stored plan's signature no longer matches and the UI
// offers a rebuild.

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

/** One thing to practice, drawn straight from a saved pick, with a suggested time-box and a deep-link
 *  to the page where it's actually practiced. */
interface Practice {
  text: string
  minutes: number
  link?: PrepTaskLink
}

// Per-item time-boxes (minutes) by practice kind, and the length of a full timed mock per round.
const REHEARSE_MIN = { recruiter: 15, behavioral: 20 } as const
const SOLVE_MIN = { coding: 30, sysdesign: 45 } as const
const MOCK_MIN: Partial<Record<RoundType, number>> = {
  recruiter: 20,
  technical_screen: 45,
  hiring_manager: 30,
  system_design: 60,
  behavioral: 30,
  onsite_loop: 90,
}

/** The practice page each mode lives on — the route a task deep-links into. */
const PRACTICE_ROUTE: Record<NonNullable<PracticeMode>, string> = {
  behavioral: '/practice/behavioral',
  coding: '/practice/coding',
  sysdesign: '/practice/sysdesign',
  build: '/practice/build',
}

/** The exact saved questions to practice for a round, resolved from the job's picks via the round's
 *  catalog pick-source — each deep-linked to its practice page — plus a closing timed mock. Project/
 *  custom/take-home rounds have no curated picks; they fall back to the round's topic/focus. */
function roundPractice(job: JobDescription, type: RoundType): { items: Practice[]; mock: Practice | null } {
  const jobId = job.id
  const behavioral = (promptId: string, persona: 'recruiter' | 'hiring_manager'): PrepTaskLink => ({
    to: '/practice/behavioral',
    state: { startPromptId: promptId, jobId, persona },
  })
  const coding = (problemId: string): PrepTaskLink => ({ to: '/practice/coding', state: { startProblemId: problemId } })
  const sysdesign = (problemId: string): PrepTaskLink => ({ to: '/practice/sysdesign', state: { startProblemId: problemId } })

  const codingItems = () => job.codingPicks.map((p) => ({ text: `Solve: ${getCodingProblem(p.problemId).title}`, minutes: SOLVE_MIN.coding, link: coding(p.problemId) }))
  const sysItems = () => job.problemPicks.map((p) => ({ text: `Practice: ${getProblem(p.problemId).title}`, minutes: SOLVE_MIN.sysdesign, link: sysdesign(p.problemId) }))
  const behavItems = () => job.behavioralPicks.map((p) => ({ text: `Rehearse: ${getPrompt(p.promptId).label}`, minutes: REHEARSE_MIN.behavioral, link: behavioral(p.promptId, 'hiring_manager') }))

  let items: Practice[] = []
  switch (roundCatalog(type).picks) {
    case 'recruiter':
      items = job.recruiterPicks.map((p) => ({ text: `Rehearse: ${getPrompt(p.promptId).label}`, minutes: REHEARSE_MIN.recruiter, link: behavioral(p.promptId, 'recruiter') }))
      break
    case 'behavioral':
      items = behavItems()
      break
    case 'coding':
      items = codingItems()
      break
    case 'problem':
      items = sysItems()
      break
    case 'mixed':
      items = [...codingItems(), ...sysItems(), ...behavItems()]
      break
  }

  // The mock deep-links to the round's practice mode (no specific start item), carrying job context so
  // a behavioral mock opens with the right persona. Rounds with no single practice mode (onsite/custom)
  // get no link.
  const mode = roundCatalog(type).practiceMode
  const mockLink: PrepTaskLink | undefined = mode
    ? { to: PRACTICE_ROUTE[mode], state: mode === 'behavioral' ? { jobId, persona: type === 'recruiter' ? 'recruiter' : 'hiring_manager' } : undefined }
    : undefined
  const mockMin = MOCK_MIN[type]
  const mock = mockMin != null ? { text: `Full timed mock: ${roundLabel(type)}`, minutes: mockMin, link: mockLink } : null
  return { items, mock }
}

/** Just the practice titles — the stable slice of a round's picks the signature fingerprints. */
function roundItems(job: JobDescription, type: RoundType): string[] {
  return roundPractice(job, type).items.map((p) => p.text)
}

/**
 * Every in-flight company's active-session interviews still ahead of us — the units the plan is built
 * from. A round must have a date that is today-or-later; interviews already in the past are dropped so
 * a completed-but-unmarked round never lands in the run-up. A bundled onsite contributes each of its
 * dated rounds. Sorted soonest-first (then by jobId) so the numbering is stable for the prompt and the
 * signature.
 */
export function activeInterviews(jobs: JobDescription[], today = toISODate()): ActiveInterview[] {
  return jobs
    .flatMap((job): ActiveInterview[] => {
      const app = job.application
      if (!app || TERMINAL.has(app.status)) return []
      return activeRounds(app)
        .filter((round) => round.scheduledAt && daysBetween(today, round.scheduledAt) >= 0)
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
 * round identity, date, outcome, manual grounding, and predicted items. It does depend on `today` only
 * insofar as an interview slipping into the past drops out of the active set — a plan built for an
 * interview that has since happened is genuinely stale and should be rebuilt.
 */
export function prepInputSignature(jobs: JobDescription[], today = toISODate(), findJob = byId(jobs)): string {
  const norm = activeInterviews(jobs, today).map((i) => {
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

/** A short label for a day, from the companies it touches: "Acme system design" for a single loop,
 *  else the distinct company names joined. */
function dayFocus(tasks: GlobalPrepTask[]): string {
  const companies = [...new Set(tasks.map((t) => t.company).filter((c): c is string => !!c))]
  if (companies.length === 1) return `${companies[0]} ${(tasks[0].roundLabel ?? 'prep').toLowerCase()}`
  return companies.join(' + ') || 'Review'
}

/**
 * Build the single cross-application prep plan by laying each active interview's SAVED practice picks
 * across its run-up. dayIndex 1 = today, counting forward to the furthest interview within the window
 * (capped at MAX_DAYS). Each interview's items are spread over the days before it (front-loaded), with a
 * timed mock reserved for the interview day itself; a round with no saved picks gets one grounding
 * review task. Fully deterministic — no LLM call. Returns an empty plan when nothing is scheduled.
 *
 * Kept `async` so callers can `await` it uniformly (and to leave room for future async grounding).
 */
export async function generateGlobalPrepPlan(jobs: JobDescription[]): Promise<GlobalPrepPlan> {
  const today = toISODate()
  const interviews = activeInterviews(jobs, today)
  const signature = prepInputSignature(jobs, today)

  if (interviews.length === 0) {
    return { generatedAt: new Date().toISOString(), signature, days: [] }
  }

  const findJob = byId(jobs)
  // Each interview's calendar day (today = day 1) and the plan window: out to the furthest interview,
  // clamped to MAX_DAYS so the run-up stays actionable.
  const withDay = interviews.map((i) => ({ ...i, day: daysBetween(today, i.round.scheduledAt!) + 1 }))
  const span = Math.min(Math.max(...withDay.map((i) => i.day), 1), MAX_DAYS)

  // dayIndex (1..span) → its tasks, filled interview by interview.
  const buckets = new Map<number, GlobalPrepTask[]>()
  const put = (dayIndex: number, task: GlobalPrepTask) => {
    const d = Math.min(Math.max(dayIndex, 1), span)
    const bucket = buckets.get(d) ?? []
    bucket.push(task)
    buckets.set(d, bucket)
  }

  for (const iv of withDay) {
    const roundLbl = iv.round.label || roundLabel(iv.round.type)
    const attribute = (p: Practice): GlobalPrepTask => ({
      round: iv.round.type,
      text: p.text,
      minutes: p.minutes,
      done: false,
      jobId: iv.jobId,
      company: iv.company,
      role: iv.role,
      roundLabel: roundLbl,
      ...(p.link ? { link: p.link } : {}),
    })

    const job = findJob(iv.jobId)
    const { items, mock } = job ? roundPractice(job, iv.round.type) : { items: [], mock: null }
    const end = Math.min(iv.day, span) // the interview's own day, within the window
    // Reserve the interview day for the mock when there's at least one earlier day to prep on.
    const contentEnd = mock && end > 1 ? end - 1 : end

    if (items.length === 0) {
      // No curated picks (take-home / project / custom, or nothing selected yet): a single grounding
      // review task, using the round's own topic/focus if the candidate flagged any.
      const focus = (iv.round.focusAreas ?? []).filter((a) => a.trim())
      const about = iv.round.topic?.trim() || focus.join(', ') || 'key topics + your stories'
      put(contentEnd, attribute({ text: `Review ${roundLbl}: ${about}`, minutes: 30, link: { to: `/app/${iv.jobId}` } }))
    } else {
      // Spread the saved questions evenly over days 1..contentEnd, front-loaded (earliest reps first).
      items.forEach((p, k) => put(1 + Math.floor((k * contentEnd) / items.length), attribute(p)))
    }
    if (mock) put(end, attribute(mock))
  }

  const days: GlobalPrepDay[] = []
  for (let d = 1; d <= span; d++) {
    const tasks = buckets.get(d)
    if (tasks?.length) days.push({ date: addDays(today, d - 1), focus: dayFocus(tasks), tasks })
  }

  return { generatedAt: new Date().toISOString(), signature, days }
}
