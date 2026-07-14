import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListChecks, CalendarPlus, RefreshCw, Sparkles, Clock, ChevronRight } from 'lucide-react'
import { roundLabel } from '../../data/rounds'
import { daysBetween, relativeDay, toISODate } from '../../lib/application/schedule'
import { activeInterviews, generateGlobalPrepPlan, prepInputSignature } from '../../lib/application/globalPrepPlan'
import { getPrepPlan, savePrepPlan } from '../../lib/prepPlanStore'
import Pending from '../../components/Pending'
import type { GlobalPrepPlan, GlobalPrepTask, JobDescription } from '../../types'

// The single, cross-application prep plan: one dated schedule laid out from every active interview's
// saved question picks. Built deterministically on demand, persisted server-side, and marked stale via
// an input signature when the active interviews or their picks change — so the user rebuilds with one
// click. Each task deep-links into the page where it's practiced. Replaces the old per-round-plan merge.

const OVERLOAD_THRESHOLD = 4

/** Split a 'YYYY-MM-DD' date into the pieces the day chip shows: weekday abbrev + day-of-month. */
function dayParts(iso: string): { weekday: string; dayNum: number } {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return { weekday: dt.toLocaleDateString(undefined, { weekday: 'short' }), dayNum: d }
}

/** Compact time-box label, e.g. 45 → "45m", 90 → "1h 30m", 120 → "2h". */
function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function taskTag(t: GlobalPrepTask): { label: string; cls: string } {
  if (t.company) return { label: t.company, cls: 'bg-terracotta-100 text-terracotta-700' }
  if (t.round === 'rest') return { label: 'Rest', cls: 'bg-emerald-100 text-emerald-700' }
  if (t.round === 'review') return { label: 'Review', cls: 'bg-stone-100 text-stone-600' }
  return { label: roundLabel(t.round), cls: 'bg-stone-100 text-stone-600' }
}

/** Carry done-state forward across a rebuild for tasks whose text is unchanged. */
function preserveDone(prev: GlobalPrepPlan | null, next: GlobalPrepPlan): GlobalPrepPlan {
  const doneText = new Set((prev?.days ?? []).flatMap((d) => d.tasks).filter((t) => t.done).map((t) => t.text))
  return { ...next, days: next.days.map((d) => ({ ...d, tasks: d.tasks.map((t) => (doneText.has(t.text) ? { ...t, done: true } : t)) })) }
}

interface Props {
  jobs: JobDescription[]
  /** Bubble the loaded/updated plan up so the home momentum hero can count today's tasks. */
  onPlanChange?: (plan: GlobalPrepPlan | null) => void
}

export default function PrepPlanPanel({ jobs, onPlanChange }: Props) {
  const navigate = useNavigate()
  const [plan, setPlan] = useState<GlobalPrepPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = toISODate()
  const interviews = useMemo(() => activeInterviews(jobs, today), [jobs, today])
  const signature = useMemo(() => prepInputSignature(jobs, today), [jobs, today])

  function publish(next: GlobalPrepPlan | null) {
    setPlan(next)
    onPlanChange?.(next)
  }

  useEffect(() => {
    void (async () => {
      const p = await getPrepPlan()
      setPlan(p)
      onPlanChange?.(p)
      setLoading(false)
    })()
    // Load once on mount; subsequent changes flow through generate/toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function build() {
    if (building) return
    setBuilding(true)
    setError(null)
    try {
      const built = preserveDone(plan, await generateGlobalPrepPlan(jobs))
      await savePrepPlan(built)
      publish(built)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the plan — is the backend running?')
    } finally {
      setBuilding(false)
    }
  }

  function toggle(dayIdx: number, taskIdx: number) {
    if (!plan) return
    const next: GlobalPrepPlan = {
      ...plan,
      days: plan.days.map((d, di) =>
        di !== dayIdx ? d : { ...d, tasks: d.tasks.map((t, ti) => (ti !== taskIdx ? t : { ...t, done: !t.done })) },
      ),
    }
    publish(next)
    void savePrepPlan(next)
  }

  // Only today-forward days, so a plan stays useful as days pass without a rebuild.
  const days = (plan?.days ?? []).filter((d) => daysBetween(today, d.date) >= 0)
  const stale = plan != null && plan.signature !== signature
  const empty = interviews.length === 0

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-stone-900">
            <ListChecks size={15} className="text-terracotta-500" aria-hidden /> Prep plan
          </h3>
          <p className="text-xs text-stone-500">Your saved practice questions from every active interview, laid out day by day up to each date.</p>
        </div>
        {!empty && (
          <button
            type="button"
            onClick={() => void build()}
            disabled={building}
            className="flex items-center gap-1.5 rounded-md border border-terracotta-300 bg-white px-3 py-1.5 text-sm font-medium text-terracotta-700 hover:bg-terracotta-50 disabled:opacity-50"
          >
            {plan ? <RefreshCw size={14} aria-hidden /> : <Sparkles size={14} aria-hidden />}
            {building ? 'Building…' : plan ? 'Regenerate' : 'Generate plan'}
          </button>
        )}
      </div>

      {building && <Pending label="Laying out your saved questions across every interview…" />}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {stale && !building && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Your interviews changed since this plan was built — regenerate to bring it up to date.
        </p>
      )}

      {loading ? (
        <p className="mt-3 text-sm text-stone-500">Loading…</p>
      ) : empty ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-stone-300 bg-white/50 p-4 text-sm text-stone-500">
          <CalendarPlus size={16} className="shrink-0 text-stone-400" aria-hidden />
          No scheduled interviews yet. Open an application, set a round's date, then generate a plan.
        </p>
      ) : days.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-stone-300 bg-white/50 p-4 text-sm text-stone-500">
          <Sparkles size={16} className="shrink-0 text-stone-400" aria-hidden />
          {plan ? 'No upcoming days in this plan — regenerate for your current interviews.' : `${interviews.length} interview${interviews.length === 1 ? '' : 's'} scheduled. Generate a plan to get a day-by-day run-up.`}
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {days.map((day, di) => {
            const total = day.tasks.length
            const done = day.tasks.filter((t) => t.done).length
            const complete = total > 0 && done === total
            const overloaded = total >= OVERLOAD_THRESHOLD
            const dayMinutes = day.tasks.reduce((sum, t) => sum + (t.minutes ?? 0), 0)
            const isToday = daysBetween(today, day.date) === 0
            const { weekday, dayNum } = dayParts(day.date)
            return (
              <li key={day.date} className={`overflow-hidden rounded-xl border bg-white ${isToday ? 'border-terracotta-300 ring-1 ring-terracotta-200' : 'border-stone-200'}`}>
                <div className={`flex items-center gap-3 px-3 py-2.5 ${isToday ? 'bg-terracotta-50/70' : 'bg-stone-50/60'}`}>
                  <div className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg leading-none ${isToday ? 'bg-terracotta-600 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-200'}`}>
                    <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">{weekday}</span>
                    <span className="text-base font-bold">{dayNum}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-xs font-semibold ${isToday ? 'text-terracotta-700' : 'text-stone-500'}`}>{relativeDay(day.date)}</span>
                      {dayMinutes > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-stone-400">
                          <Clock size={11} aria-hidden /> {formatMinutes(dayMinutes)}
                        </span>
                      )}
                      {overloaded && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Heavy day</span>}
                    </div>
                    <p className="truncate text-sm font-medium text-stone-800">{day.focus}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold tabular-nums ${complete ? 'text-emerald-600' : 'text-stone-400'}`}>{done}/{total}</span>
                </div>
                <ul className="divide-y divide-stone-100">
                  {day.tasks.map((t, ti) => {
                    const tag = taskTag(t)
                    const linked = !!t.link
                    return (
                      <li key={ti} className="flex items-start gap-2.5 px-3 py-2 transition-colors hover:bg-stone-50">
                        <input
                          type="checkbox"
                          checked={t.done}
                          onChange={() => toggle(di, ti)}
                          aria-label={t.done ? 'Mark not done' : 'Mark done'}
                          className="mt-1 h-4 w-4 shrink-0 accent-terracotta-600"
                        />
                        <button
                          type="button"
                          disabled={!linked}
                          onClick={() => t.link && navigate(t.link.to, { state: t.link.state })}
                          title={linked ? 'Open this in the practice page' : undefined}
                          className="group flex min-w-0 flex-1 items-start gap-2.5 text-left disabled:cursor-default"
                        >
                          <span className={`mt-px shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${t.done ? 'bg-stone-100 text-stone-400' : tag.cls}`}>{tag.label}</span>
                          <span className={`text-sm ${t.done ? 'text-stone-400 line-through' : linked ? 'text-stone-700 group-hover:text-terracotta-700 group-hover:underline' : 'text-stone-700'}`}>
                            {t.text}
                          </span>
                          {t.minutes ? (
                            <span className={`ml-auto shrink-0 self-center whitespace-nowrap text-xs font-medium tabular-nums ${t.done ? 'text-stone-300' : 'text-stone-400'}`}>
                              {formatMinutes(t.minutes)}
                            </span>
                          ) : null}
                          {linked && (
                            <ChevronRight size={14} className={`${t.minutes ? '' : 'ml-auto'} mt-0.5 shrink-0 text-stone-300 group-hover:text-terracotta-500`} aria-hidden />
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
