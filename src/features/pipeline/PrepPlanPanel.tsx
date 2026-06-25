import { useEffect, useMemo, useState } from 'react'
import { ListChecks, CalendarPlus, RefreshCw, Sparkles } from 'lucide-react'
import { roundLabel } from '../../data/rounds'
import { daysBetween, relativeDay, toISODate } from '../../lib/application/schedule'
import { activeInterviews, generateGlobalPrepPlan, prepInputSignature } from '../../lib/application/globalPrepPlan'
import { getPrepPlan, savePrepPlan } from '../../lib/prepPlanStore'
import Pending from '../../components/Pending'
import type { GlobalPrepPlan, GlobalPrepTask, JobDescription } from '../../types'

// The single, cross-application prep plan: one dated schedule merged from every active interview.
// Generated on demand (one LLM call), persisted server-side, and marked stale via an input signature
// when the active interviews change — so the user rebuilds with one click rather than authoring a plan
// per application. Replaces the old per-round-plan merge that used to live in PipelineHome.

const OVERLOAD_THRESHOLD = 4

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
  const [plan, setPlan] = useState<GlobalPrepPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = toISODate()
  const interviews = useMemo(() => activeInterviews(jobs), [jobs])
  const signature = useMemo(() => prepInputSignature(jobs), [jobs])

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
      setError(e instanceof Error ? e.message : 'Could not build the plan — is the backend running and an LLM key set?')
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
          <p className="text-xs text-stone-500">One schedule across every active interview. Heavy days are flagged so parallel loops stay balanced.</p>
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

      {building && <Pending label="Building one plan across your interviews…" />}
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
        <ol className="mt-3 space-y-2">
          {days.map((day, di) => {
            const overloaded = day.tasks.length >= OVERLOAD_THRESHOLD
            return (
              <li key={day.date} className={`rounded-lg border bg-white p-3 ${overloaded ? 'border-amber-300 ring-1 ring-amber-200' : 'border-stone-200'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-800">
                    {day.date} <span className="font-normal text-stone-400">· {relativeDay(day.date)} · {day.focus}</span>
                  </span>
                  {overloaded && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Heavy day ({day.tasks.length})</span>}
                </div>
                <ul className="mt-2 space-y-1">
                  {day.tasks.map((t, ti) => {
                    const tag = taskTag(t)
                    return (
                      <li key={ti} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" checked={t.done} onChange={() => toggle(di, ti)} className="mt-1 accent-terracotta-600" />
                        <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${t.done ? 'bg-stone-100 text-stone-400' : tag.cls}`}>{tag.label}</span>
                        <span className={t.done ? 'text-stone-400 line-through' : 'text-stone-700'}>{t.text}</span>
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
