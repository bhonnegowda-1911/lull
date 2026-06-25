import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Filter, Target, Gauge, Dumbbell, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { loadEvents } from '../../lib/metrics/events'
import { funnel, roundOutcomeStats, fitCalibration, practiceLift, type OutcomeStat } from '../../lib/metrics/compute'

// Personal outcomes dashboard — the user's OWN pipeline, charted from the local metric event log
// (lib/metrics). Styled like the Progress "arcade": a dark surface so the numbers read as a record
// of real results. Everything shows its sample size, because at small N these are noise — the
// honest framing matters more here than a pretty number. Cross-user / business aggregates are NOT
// here by design (see the README TODO); this view is one person's funnel and validity.

const MODE_LABEL: Record<string, string> = { behavioral: 'Behavioral', coding: 'Coding', sysdesign: 'System design', build: 'Build' }
const MODE_COLOR: Record<string, string> = {
  behavioral: 'from-terracotta-400 to-terracotta-600',
  coding: 'from-sky-400 to-sky-600',
  sysdesign: 'from-emerald-400 to-emerald-600',
  build: 'from-violet-400 to-violet-600',
}

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)

function Card({ icon: Icon, title, subtitle, children }: { icon: typeof Target; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-stone-900 p-5 shadow-sm ring-1 ring-white/10">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-stone-300">
          <Icon size={16} aria-hidden />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-[11px] text-stone-400">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

/** A horizontal bar that fills on mount; value 0–1 of the track. */
function Bar({ value, gradient, delay = 0 }: { value: number; gradient: string; delay?: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
      />
    </div>
  )
}

/** Small "n=" chip — the sample-size honesty marker shown on every stat. */
function N({ n }: { n: number }) {
  return <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-stone-400">n={n}</span>
}

function OutcomePill({ stat }: { stat: OutcomeStat }) {
  const thin = stat.n < 3
  return (
    <span className={`text-sm font-semibold ${thin ? 'text-stone-400' : 'text-white'}`}>
      {pct(stat.passRate)}
      <span className="ml-1 text-[11px] font-normal text-stone-500">({stat.passed}/{stat.n})</span>
    </span>
  )
}

export default function MetricsDashboard() {
  const events = useMemo(() => loadEvents(), [])
  const stages = useMemo(() => funnel(events), [events])
  const outcomes = useMemo(() => roundOutcomeStats(events), [events])
  const calib = useMemo(() => fitCalibration(events), [events])
  const lift = useMemo(() => practiceLift(events), [events])

  const hasAny = events.length > 0
  const maxStage = Math.max(1, ...stages.map((s) => s.count))

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-2xl bg-gradient-to-b from-stone-950 to-stone-900 p-5 ring-1 ring-white/10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Outcomes</h2>
          <p className="text-xs text-stone-400">Does your prep show up in real results? Your pipeline, pass rates, and whether the scores predict outcomes.</p>
        </div>
      </div>
      {children}
    </div>
  )

  if (!hasAny) {
    return (
      <Shell>
        <p className="text-sm text-stone-400">
          No outcome data yet. As you mark interview rounds passed/failed and finish practice sessions,
          this fills in: your pipeline funnel, real-round pass rates, and whether your fit score and
          practice level actually predict who passes. (Everything here is yours alone — nothing is shared.)
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pipeline funnel */}
        <Card icon={Filter} title="Pipeline funnel" subtitle="Distinct applications reaching each stage">
          <ul className="space-y-2.5">
            {stages.map((s, i) => (
              <li key={s.key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-stone-300">{s.label}</span>
                  <span className="text-stone-400">
                    {s.count}
                    {s.fromPrev != null && <span className="ml-1.5 text-stone-500">({pct(s.fromPrev)} of prev)</span>}
                  </span>
                </div>
                <Bar value={s.count / maxStage} gradient="from-terracotta-400 to-terracotta-600" delay={i * 0.05} />
              </li>
            ))}
          </ul>
        </Card>

        {/* Real-round pass rate */}
        <Card icon={Target} title="Real-round pass rate" subtitle="Outcomes you logged on actual interview rounds">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{pct(outcomes.overall.passRate)}</span>
            <span className="text-xs text-stone-400">overall</span>
            <span className="ml-auto"><N n={outcomes.overall.n} /></span>
          </div>
          <ul className="mt-3 space-y-2">
            {(['behavioral', 'coding', 'sysdesign', 'build'] as const).map((m) => {
              const stat = outcomes.byMode[m]
              if (!stat) return null
              return (
                <li key={m} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs text-stone-300">{MODE_LABEL[m]}</span>
                  <div className="flex-1"><Bar value={stat.passRate ?? 0} gradient={MODE_COLOR[m]} /></div>
                  <span className="w-20 shrink-0 text-right"><OutcomePill stat={stat} /></span>
                </li>
              )
            })}
          </ul>
        </Card>

        {/* Fit calibration — the credibility chart */}
        <Card icon={Gauge} title="Fit-score calibration" subtitle="Does the predicted fit match who actually passes?">
          {calib.n === 0 ? (
            <p className="text-xs text-stone-500">No rounds with a saved fit score yet. Run a fit check on an application, then log the round outcome.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {calib.buckets.filter((b) => b.n > 0).map((b) => (
                  <li key={b.label} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs text-stone-300">{b.label}</span>
                    <div className="flex-1"><Bar value={b.passRate ?? 0} gradient="from-emerald-400 to-emerald-600" /></div>
                    <span className="w-24 shrink-0 text-right text-xs text-stone-300">
                      {pct(b.passRate)} <span className="text-stone-500">passed</span>
                    </span>
                    <N n={b.n} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-stone-400">
                Well-calibrated means a bucket like “80–100” passes ~80% of the time. Fit↔pass correlation:{' '}
                <span className="font-semibold text-stone-200">{calib.correlation == null ? '—' : calib.correlation.toFixed(2)}</span>
                {calib.n < 8 && <span className="text-stone-500"> · too few rounds to trust yet</span>}
              </p>
            </>
          )}
        </Card>

        {/* Practice payoff */}
        <Card icon={Dumbbell} title="Practice payoff" subtitle="Pass rate when you practiced the matching mode vs not">
          {lift.length === 0 ? (
            <p className="text-xs text-stone-500">No resolved rounds with a matching practice mode yet.</p>
          ) : (
            <ul className="space-y-3">
              {lift.map((l) => {
                const dir = l.lift == null ? null : l.lift > 0.01 ? 'up' : l.lift < -0.01 ? 'down' : 'flat'
                const DirIcon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus
                const dirCls = dir === 'up' ? 'text-emerald-400' : dir === 'down' ? 'text-rose-400' : 'text-stone-400'
                return (
                  <li key={l.mode} className="rounded-lg bg-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-stone-200">{MODE_LABEL[l.mode]}</span>
                      {l.lift != null && (
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${dirCls}`}>
                          <DirIcon size={13} aria-hidden />
                          {l.lift > 0 ? '+' : ''}{Math.round(l.lift * 100)} pts
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-stone-400">Practiced</div>
                        <OutcomePill stat={l.withPractice} />
                      </div>
                      <div>
                        <div className="text-stone-400">Didn’t</div>
                        <OutcomePill stat={l.withoutPractice} />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-stone-500">
            Correlation, not proof — motivated candidates both practice and pass. Treat as a signal, not a guarantee.
          </p>
        </Card>
      </div>
    </Shell>
  )
}
