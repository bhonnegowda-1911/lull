import { useEffect, useState } from 'react'
import Sparkline from './Sparkline'
import {
  loadProgress,
  ordinalLabel,
  trendDirection,
  MAX_LEVEL,
  type Direction,
  type ModeTrend,
  type Point,
} from './trends'

// Progress view — the north-star screen. Answers "am I improving?" by charting comparable
// metrics across reps: level over time for every mode, plus delivery metrics (filler rate,
// STAR scores) for behavioral. Read-only; data comes from the durable session store.

const KIND_LABEL: Record<string, string> = { behavioral: 'Behavioral', sysdesign: 'System design', build: 'Build' }

function arrow(dir: Direction): { glyph: string; cls: string; label: string } {
  if (dir === 'up') return { glyph: '↑', cls: 'text-emerald-600', label: 'improving' }
  if (dir === 'down') return { glyph: '↓', cls: 'text-rose-600', label: 'slipping' }
  return { glyph: '→', cls: 'text-slate-400', label: 'flat' }
}

function Trend({ glyph, cls, label }: ReturnType<typeof arrow>) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cls}`}>
      <span aria-hidden>{glyph}</span>
      {label}
    </span>
  )
}

/** A single labelled metric: heading, latest value, trend arrow, sparkline. */
function Metric({
  title,
  points,
  min,
  max,
  color,
  lowerIsBetter = false,
  format,
}: {
  title: string
  points: Point[]
  min: number
  max: number
  color: 'indigo' | 'emerald' | 'rose' | 'violet'
  lowerIsBetter?: boolean
  format: (v: number) => string
}) {
  const latest = points.length ? points[points.length - 1].value : null
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-medium text-slate-500">{title}</h4>
        {latest != null && <span className="text-sm font-semibold text-slate-800">{format(latest)}</span>}
      </div>
      <div className="mt-2">
        <Sparkline points={points} min={min} max={max} color={color} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>{points.length} rep{points.length === 1 ? '' : 's'}</span>
        <Trend {...arrow(trendDirection(points, lowerIsBetter))} />
      </div>
    </div>
  )
}

function ModeCard({ trend }: { trend: ModeTrend }) {
  const levels = trend.level
  const current = levels.length ? ordinalLabel(levels[levels.length - 1].value) : '—'
  const best = levels.length ? ordinalLabel(Math.max(...levels.map((p) => p.value))) : '—'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{KIND_LABEL[trend.kind] ?? trend.kind}</h3>
        <span className="text-xs text-slate-400">{trend.count} completed</span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          title={`Level · now ${current} · best ${best}`}
          points={levels}
          min={1}
          max={MAX_LEVEL}
          color="indigo"
          format={(v) => ordinalLabel(v)}
        />
        {trend.fillerPerMin && (
          <Metric
            title="Filler / min"
            points={trend.fillerPerMin}
            min={0}
            max={Math.max(8, ...trend.fillerPerMin.map((p) => p.value))}
            color="rose"
            lowerIsBetter
            format={(v) => v.toFixed(1)}
          />
        )}
        {trend.starAvg && (
          <Metric
            title="STAR score (avg)"
            points={trend.starAvg}
            min={1}
            max={5}
            color="emerald"
            format={(v) => v.toFixed(1)}
          />
        )}
      </div>
    </div>
  )
}

export default function Progress() {
  const [trends, setTrends] = useState<ModeTrend[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    loadProgress().then((t) => {
      if (live) {
        setTrends(t)
        setLoading(false)
      }
    })
    return () => {
      live = false
    }
  }, [])

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>

  if (trends.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Progress</h2>
        <p className="mt-2 text-sm text-slate-500">
          No completed sessions yet. Finish a few behavioral, system-design, or build sessions and
          your level and delivery trends will chart here. (Needs the backend running for durable
          history — see the README.)
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Progress</h2>
        <p className="text-xs text-slate-500">Are you improving over reps? Trends across your completed sessions.</p>
      </div>
      {trends.map((t) => (
        <ModeCard key={t.kind} trend={t} />
      ))}
    </div>
  )
}
