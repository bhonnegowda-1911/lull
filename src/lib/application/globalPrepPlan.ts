import { chatStructured } from '../llmClient'
import { PREP_PLAN_CRITERIA } from '../../data/prepPlanCriteria'
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
// contributes its active (current-stage) scheduled round, and every round carries the exact questions
// to practice (the JD-selector picks saved on the job). An LLM lays out ONE tailored day-by-day
// schedule across the parallel loops: it reads each interview's company/role/round, how soon it is, and
// the interviewer intel (round notes), then references the SAVED questions by code — so the plan can
// deep-link them and keep titles exact — and adds context-specific prep grounded in who the candidate
// is meeting. If the LLM call fails, a deterministic scheduler lays the same saved picks out as a
// fallback so there's always a plan. Regeneration is driven by `prepInputSignature`: when the active
// interviews, their picks, or the interviewer notes change, the stored plan's signature no longer
// matches and the UI offers a rebuild.

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

/** The round's practice-mode page (no specific start item), with job context so a behavioral round
 *  opens with the right persona. Undefined for rounds with no single practice mode (onsite/custom). */
function practiceModeLink(jobId: string, type: RoundType): PrepTaskLink | undefined {
  const mode = roundCatalog(type).practiceMode
  if (!mode) return undefined
  return { to: PRACTICE_ROUTE[mode], state: mode === 'behavioral' ? { jobId, persona: type === 'recruiter' ? 'recruiter' : 'hiring_manager' } : undefined }
}

/** The round's context as a single free-text string, to ground a conversational mock. */
function roundInterviewerContext(round: InterviewRoundInstance): string {
  const focus = (round.focusAreas ?? []).filter((a) => a.trim())
  return [round.topic?.trim(), round.notes?.trim(), focus.length ? `Focus: ${focus.join(', ')}` : '']
    .filter(Boolean)
    .join(' — ')
}

/** A context-grounded conversational mock for a round with no bank prompt: opens the behavioral page
 *  seeded with the round's interviewer context and an ad-hoc question (its own authored prompt, or a
 *  neutral opener) — so it never lands on a random bank STAR question. */
function behavioralMockLink(jobId: string, round: InterviewRoundInstance, startPrompt: NonNullable<PrepTaskLink['state']>['startPrompt']): PrepTaskLink {
  const interviewerContext = roundInterviewerContext(round)
  return {
    to: '/practice/behavioral',
    state: { jobId, persona: 'hiring_manager', ...(interviewerContext ? { interviewerContext } : {}), ...(startPrompt ? { startPrompt } : {}) },
  }
}

/** Where an attributed task with no specific saved-question lands. Rounds with a practice mode go to it;
 *  rounds with none (custom / onsite / founder chats) still get to PRACTICE — a context-grounded
 *  behavioral mock with a neutral opener — rather than dumping to the application. */
function fallbackLink(jobId: string, round: InterviewRoundInstance): PrepTaskLink {
  const mode = practiceModeLink(jobId, round.type)
  if (mode) return mode
  return behavioralMockLink(jobId, round, {
    text: 'Tell me about your background and why this role — the interviewer will take it from there.',
    label: `${round.label || roundLabel(round.type)} — open`,
  })
}

/** The exact saved questions to practice for a round: the job's picks via the round's catalog
 *  pick-source (each deep-linked to its practice page), or — for a custom/no-bank round that has an
 *  authored brief — that brief's own questions (each opening a context-grounded behavioral mock). Plus
 *  a closing timed mock. A round with neither falls back to the round's topic/focus at schedule time. */
function roundPractice(job: JobDescription, round: InterviewRoundInstance): { items: Practice[]; mock: Practice | null } {
  const jobId = job.id
  const type = round.type
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

  // No catalog picks but an authored brief (custom / take-home round): its own questions ARE the saved
  // items — each opens a behavioral mock grounded in the round context, on that exact question.
  if (items.length === 0 && round.customPrep?.items.length) {
    items = round.customPrep.items.map((it) => ({
      text: `Rehearse: ${it.prompt}`,
      minutes: REHEARSE_MIN.behavioral,
      link: behavioralMockLink(jobId, round, {
        text: it.prompt,
        label: `${round.label || roundLabel(type)} question`,
        assesses: it.assesses,
        tip: it.approach,
        trap: it.trap,
      }),
    }))
  }

  // The mock deep-links to the round's practice mode; rounds with no single practice mode get no link.
  const mockMin = MOCK_MIN[type]
  const mock = mockMin != null ? { text: `Full timed mock: ${roundLabel(type)}`, minutes: mockMin, link: practiceModeLink(jobId, type) } : null
  return { items, mock }
}

/** Just the practice titles — the stable slice of a round's questions the signature fingerprints. */
function roundItems(job: JobDescription, round: InterviewRoundInstance): string[] {
  return roundPractice(job, round).items.map((p) => p.text)
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
      notes: (i.round.notes ?? '').trim(),
      items: job ? roundItems(job, i.round) : [],
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

/** An active interview plus its calendar day (today = 1). */
type IvDay = ActiveInterview & { day: number }

/** Collapse a dayIndex→tasks map into ordered, non-empty GlobalPrepDays. */
function daysFromBuckets(buckets: Map<number, GlobalPrepTask[]>, today: string, span: number): GlobalPrepDay[] {
  const days: GlobalPrepDay[] = []
  for (let d = 1; d <= span; d++) {
    const tasks = buckets.get(d)
    if (tasks?.length) days.push({ date: addDays(today, d - 1), focus: dayFocus(tasks), tasks })
  }
  return days
}

/**
 * The single cross-application prep plan. Reads every active interview's context — company, role,
 * round, how soon it is, the interviewer intel, and the SAVED questions to practice — and has an LLM
 * lay out ONE tailored day-by-day schedule. The model references saved questions by code (so we attach
 * the exact title + deep-link) and authors context-specific prep for who the candidate is meeting. On
 * any failure it falls back to the deterministic scheduler, so there's always a plan. Empty when nothing
 * is scheduled.
 */
export async function generateGlobalPrepPlan(jobs: JobDescription[]): Promise<GlobalPrepPlan> {
  const today = toISODate()
  const interviews = activeInterviews(jobs, today)
  const signature = prepInputSignature(jobs, today)
  const generatedAt = new Date().toISOString()

  if (interviews.length === 0) return { generatedAt, signature, days: [] }

  const findJob = byId(jobs)
  // Each interview's calendar day (today = day 1) and the plan window: out to the furthest interview,
  // clamped to MAX_DAYS so the run-up stays actionable.
  const withDay: IvDay[] = interviews.map((i) => ({ ...i, day: daysBetween(today, i.round.scheduledAt!) + 1 }))
  const span = Math.min(Math.max(...withDay.map((i) => i.day), 1), MAX_DAYS)

  try {
    const days = await planWithLLM(withDay, findJob, today, span)
    if (days.length) return { generatedAt, signature, days }
  } catch {
    // Backend down / no key / bad parse — fall through to the deterministic plan below.
  }
  return { generatedAt, signature, days: buildDeterministicDays(withDay, findJob, today, span) }
}

type RawTask = { interview: number | null; ref: string | null; text: string; minutes: number }
type RawDay = { dayIndex: number; tasks: RawTask[] }

/** Resolve one LLM task into an attributed GlobalPrepTask. A `ref` that matches a saved-question code
 *  becomes that exact pick (canonical title + deep-link); anything else is a tailored task the model
 *  authored, attributed to its interview and linked to the application. Returns null if unusable. */
function mapRawTask(t: RawTask, registry: Map<string, { practice: Practice; iv: IvDay }>, withDay: IvDay[]): GlobalPrepTask | null {
  const minutes = typeof t.minutes === 'number' && t.minutes > 0 ? t.minutes : undefined

  // Match the leading code token (Q3, M1), tolerating a model that appends the title after it.
  const code = t.ref?.trim().match(/^[qm]\d+/i)?.[0].toUpperCase()
  const reg = code ? registry.get(code) : undefined
  if (reg) {
    const { practice, iv } = reg
    return {
      round: iv.round.type,
      text: practice.text,
      minutes: minutes ?? practice.minutes,
      done: false,
      jobId: iv.jobId,
      company: iv.company,
      role: iv.role,
      roundLabel: iv.round.label || roundLabel(iv.round.type),
      ...(practice.link ? { link: practice.link } : {}),
    }
  }

  const text = t.text?.trim()
  if (!text) return null
  const iv = t.interview != null ? withDay[t.interview - 1] : undefined
  const task: GlobalPrepTask = { round: iv ? iv.round.type : 'review', text, done: false }
  if (minutes) task.minutes = minutes
  if (iv) {
    task.jobId = iv.jobId
    task.company = iv.company
    task.role = iv.role
    task.roundLabel = iv.round.label || roundLabel(iv.round.type)
    // Land on the round's practice page (not the application) so a prep task still opens where it's worked.
    task.link = fallbackLink(iv.jobId, iv.round)
  }
  return task
}

/** Ask the LLM for a tailored plan grounded in each interview's context + coded saved questions. */
async function planWithLLM(withDay: IvDay[], findJob: (id: string) => JobDescription | null, today: string, span: number): Promise<GlobalPrepDay[]> {
  const registry = new Map<string, { practice: Practice; iv: IvDay }>()
  let q = 0

  const lines = withDay.map((iv, idx) => {
    const job = findJob(iv.jobId)
    const { items, mock } = job ? roundPractice(job, iv.round) : { items: [], mock: null }
    const roundLbl = iv.round.label || roundLabel(iv.round.type)
    const codeLines: string[] = []
    for (const it of items) {
      const code = `Q${++q}`
      registry.set(code, { practice: it, iv })
      codeLines.push(`     ${code} ${it.text} (${it.minutes}m)`)
    }
    if (mock) {
      const code = `M${idx + 1}`
      registry.set(code, { practice: mock, iv })
      codeLines.push(`     ${code} ${mock.text} (${mock.minutes}m)`)
    }
    const focus = (iv.round.focusAreas ?? []).filter((a) => a.trim())
    return [
      `${idx + 1}. ${iv.company} — ${iv.role} · ${roundLbl} · interview in ${iv.day - 1} day(s), on day ${iv.day} (${iv.round.scheduledAt})`,
      `   Interviewer intel: ${iv.round.notes?.trim() || '(none given — infer from role, round, and JD)'}`,
      iv.round.topic?.trim() ? `   Topic: ${iv.round.topic.trim()}` : '',
      focus.length ? `   Focus areas: ${focus.join('; ')}` : '',
      codeLines.length
        ? `   Saved questions to practice (reference by CODE, don't rename):\n${codeLines.join('\n')}`
        : '   Saved questions: (none selected — author tailored prep from the round + intel)',
    ]
      .filter(Boolean)
      .join('\n')
  })

  const user = [
    `TODAY is day 1. Build ONE plan over exactly ${span} day(s) (dayIndex 1..${span}).`,
    'These interviews run in parallel — reference each by its number:',
    '',
    lines.join('\n'),
  ].join('\n')

  const { parsed } = await chatStructured<{ days: RawDay[] }>({
    provider: 'anthropic',
    model: PREP_PLAN_CRITERIA.model,
    system: PREP_PLAN_CRITERIA.systemPrompt,
    user,
    schema: PREP_PLAN_CRITERIA.schema,
    maxTokens: 5000,
    thinking: 'adaptive',
  })

  const buckets = new Map<number, GlobalPrepTask[]>()
  for (const d of parsed.days ?? []) {
    if (!(d.dayIndex >= 1 && d.dayIndex <= span)) continue
    for (const t of d.tasks ?? []) {
      const task = mapRawTask(t, registry, withDay)
      if (task) (buckets.get(d.dayIndex) ?? buckets.set(d.dayIndex, []).get(d.dayIndex)!).push(task)
    }
  }
  return daysFromBuckets(buckets, today, span)
}

/** Deterministic fallback: lay each interview's saved picks across its run-up, front-loaded, with the
 *  timed mock on the interview day; a pick-less round gets one grounding review task. No LLM. */
function buildDeterministicDays(withDay: IvDay[], findJob: (id: string) => JobDescription | null, today: string, span: number): GlobalPrepDay[] {
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
    const { items, mock } = job ? roundPractice(job, iv.round) : { items: [], mock: null }
    const end = Math.min(iv.day, span)
    const contentEnd = mock && end > 1 ? end - 1 : end

    if (items.length === 0) {
      const focus = (iv.round.focusAreas ?? []).filter((a) => a.trim())
      const about = iv.round.topic?.trim() || focus.join(', ') || 'key topics + your stories'
      put(contentEnd, attribute({ text: `Review ${roundLbl}: ${about}`, minutes: 30, link: fallbackLink(iv.jobId, iv.round) }))
    } else {
      items.forEach((p, k) => put(1 + Math.floor((k * contentEnd) / items.length), attribute(p)))
    }
    if (mock) put(end, attribute(mock))
  }

  return daysFromBuckets(buckets, today, span)
}
