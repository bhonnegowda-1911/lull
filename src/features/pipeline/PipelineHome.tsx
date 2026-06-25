import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarClock, ListChecks, Briefcase, Plus, ArrowRight, Sparkles, Trash2 } from 'lucide-react'
import { listJobs, deleteJob } from '../../lib/jobStore'
import { activeRounds, daysBetween, relativeDay, toISODate } from '../../lib/application/schedule'
import { upcomingRounds } from '../../lib/application/agenda'
import { fadeUp, stagger, staggerItem, liftOnHover } from '../../lib/ui/motion'
import PrepPlanPanel from './PrepPlanPanel'
import type { Application, GlobalPrepPlan, JobDescription } from '../../types'

// The home / pipeline: every application as a journey card + a unified, cross-company agenda that
// merges each active round's countdown plan into one dated view. This is the app's center of
// gravity — pick a company to open its journey (/app/:id), or work today's merged task list.

const STATUS_STYLE: Record<Application['status'], string> = {
  not_applied: 'bg-stone-100 text-stone-600',
  applied: 'bg-sky-100 text-sky-700',
  active: 'bg-terracotta-100 text-terracotta-700',
  offer: 'bg-emerald-100 text-emerald-700',
  accepted: 'bg-emerald-600 text-white',
  rejected: 'bg-red-100 text-red-700',
  withdrawn: 'bg-stone-200 text-stone-600',
}
const STATUS_LABEL: Record<Application['status'], string> = {
  not_applied: 'Not applied', applied: 'Applied', active: 'Interviewing', offer: 'Offer',
  accepted: 'Accepted', rejected: 'Rejected', withdrawn: 'Withdrawn',
}

function JobCard({ job, onDelete }: { job: JobDescription; onDelete: (job: JobDescription) => void }) {
  const app = job.application
  // The active session's still-undecided interviews; the first is the headline "up next", the rest a +N.
  const sessionRounds = activeRounds(app)
  const active = sessionRounds[0] ?? null
  const more = sessionRounds.length - 1
  const total = app?.rounds.length ?? 0
  return (
    <motion.div variants={staggerItem} {...liftOnHover} className="group/card relative">
      {/* Delete — floats at the corner, revealed on hover. Stops the click from following the card link. */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onDelete(job)
        }}
        aria-label={`Delete ${job.title || 'application'}`}
        className="absolute -right-2 -top-2 z-10 grid h-7 w-7 place-items-center rounded-full border border-stone-200 bg-white text-stone-400 opacity-0 shadow-sm transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover/card:opacity-100"
      >
        <Trash2 size={13} aria-hidden />
      </button>
      <Link
        to={`/app/${job.id}`}
        className="block h-full rounded-xl border border-stone-200/80 bg-white/70 p-4 shadow-sm transition-colors hover:border-terracotta-300 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-stone-900">{job.title || 'Untitled role'}</p>
            {job.company && <p className="truncate text-sm text-stone-500">{job.company}</p>}
          </div>
          {app && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[app.status]}`}>{STATUS_LABEL[app.status]}</span>}
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-sm">
          {active ? (
            <p className="text-stone-700">
              Up next: <span className="font-medium">{active.label}</span>{more > 0 ? <span className="text-stone-500"> +{more} more</span> : null}
              {active.scheduledAt
                ? <span className="text-stone-500"> — {active.scheduledAt} ({relativeDay(active.scheduledAt)})</span>
                : <span className="text-amber-600"> — no date set</span>}
            </p>
          ) : (
            <p className="text-stone-400">{total > 0 ? 'Loop complete' : 'No loop yet — open to set it up'}</p>
          )}
          <ArrowRight size={14} className="ml-auto shrink-0 text-stone-300 transition-all group-hover/card:translate-x-0.5 group-hover/card:text-terracotta-500" aria-hidden />
        </div>
      </Link>
    </motion.div>
  )
}

/** One stat in the momentum hero: an icon, a big number, and a label. */
function HeroStat({ icon: Icon, value, label, accent }: { icon: typeof Briefcase; value: string; label: string; accent: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${accent}`}>
        <Icon size={18} aria-hidden />
      </div>
      <div className="min-w-0 leading-tight">
        <div className="text-xl font-semibold text-stone-900">{value}</div>
        <div className="truncate text-xs text-stone-500">{label}</div>
      </div>
    </div>
  )
}

/** A momentum strip across the top of the home screen — turns "here's a list" into "here's your run". */
function MomentumHero({
  activeCount,
  nextLabel,
  nextWhen,
  prepDone,
  prepTotal,
}: {
  activeCount: number
  nextLabel: string
  nextWhen: string
  prepDone: number
  prepTotal: number
}) {
  const prepPct = prepTotal > 0 ? Math.round((prepDone / prepTotal) * 100) : 0
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="grid gap-4 rounded-2xl border border-stone-200/70 bg-white/70 p-5 shadow-sm sm:grid-cols-3"
    >
      <HeroStat icon={Briefcase} value={String(activeCount)} label={activeCount === 1 ? 'application in flight' : 'applications in flight'} accent="bg-terracotta-100 text-terracotta-700" />
      <HeroStat icon={CalendarClock} value={nextWhen} label={nextLabel} accent="bg-sky-100 text-sky-700" />
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
          <ListChecks size={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-xl font-semibold text-stone-900">
            {prepTotal > 0 ? `${prepDone}/${prepTotal}` : '—'}
          </div>
          <div className="truncate text-xs text-stone-500">today’s prep done</div>
          {prepTotal > 0 && (
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-200/70">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                initial={{ width: 0 }}
                animate={{ width: `${prepPct}%` }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function PipelineHome() {
  const [jobs, setJobs] = useState<JobDescription[]>([])
  const [plan, setPlan] = useState<GlobalPrepPlan | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setJobs(await listJobs())
      setLoading(false)
    })()
  }, [])

  async function removeJob(job: JobDescription) {
    setJobs((prev) => prev.filter((j) => j.id !== job.id)) // optimistic — remove instantly, no prompt
    await deleteJob(job.id)
  }

  const today = toISODate()
  const upcoming = useMemo(() => upcomingRounds(jobs, today), [jobs, today])

  // Real numbers for the momentum hero — no new plumbing, all derived from what's already loaded.
  const activeCount = useMemo(() => jobs.filter((j) => j.application?.status === 'active').length, [jobs])
  const nextUp = upcoming[0]
  const nextWhen = nextUp ? (() => { const d = daysBetween(today, nextUp.round.scheduledAt!); return d <= 0 ? 'Today' : d === 1 ? 'Tomorrow' : `${d}d` })() : '—'
  const nextLabel = nextUp ? `${nextUp.company} · ${nextUp.round.label}` : 'no interview scheduled'
  const todayPrep = useMemo(() => plan?.days.find((d) => d.date === today)?.tasks ?? [], [plan, today])
  const prepDone = todayPrep.filter((t) => t.done).length

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-stone-900">Pipeline</h2>
          <p className="text-sm text-stone-500">Every application, fit to offer — and one schedule across all of them.</p>
        </div>
        <Link to="/library?tab=jobs" className="flex items-center gap-1.5 rounded-md bg-terracotta-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-terracotta-500">
          <Plus size={15} aria-hidden /> New application
        </Link>
      </div>

      {jobs.length === 0 ? (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-stone-300 bg-white/50 p-12 text-center"
        >
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-terracotta-400 to-terracotta-600 text-white shadow-md">
            <Sparkles size={26} aria-hidden />
          </div>
          <div>
            <p className="font-serif text-lg font-semibold text-stone-900">Start your first journey</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">
              Add a target job and we’ll score your fit, map the interview loop, and build a day-by-day countdown plan.
            </p>
          </div>
          <Link to="/library?tab=jobs" className="flex items-center gap-1.5 rounded-md bg-terracotta-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-terracotta-500">
            <Plus size={15} aria-hidden /> Add a target job
          </Link>
        </motion.div>
      ) : (
        <>
          <MomentumHero
            activeCount={activeCount}
            nextLabel={nextLabel}
            nextWhen={nextWhen}
            prepDone={prepDone}
            prepTotal={todayPrep.length}
          />

          {/* Upcoming interviews across companies. */}
          {upcoming.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {upcoming.map((u) => {
                const d = daysBetween(today, u.round.scheduledAt!)
                return (
                  <Link key={u.jobId} to={`/app/${u.jobId}`} className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 transition-colors hover:border-terracotta-300 hover:text-stone-900">
                    <CalendarClock size={12} className="text-terracotta-500" aria-hidden />
                    <span className="font-medium text-stone-800">{u.company}</span> · {u.round.label} · {d <= 0 ? 'today' : `in ${d}d`}
                  </Link>
                )
              })}
            </div>
          )}

          <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
            {jobs.map((job) => <JobCard key={job.id} job={job} onDelete={removeJob} />)}
          </motion.div>

          {/* The single cross-application prep plan. */}
          <PrepPlanPanel jobs={jobs} onPlanChange={setPlan} />
        </>
      )}
    </div>
  )
}
