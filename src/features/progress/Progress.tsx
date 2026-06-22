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
import { summarizeGame, type GameStat } from './game'

// Progress view — the north-star screen. Answers "am I improving?" by charting comparable
// metrics across reps: level over time for every mode, plus delivery metrics (filler rate,
// STAR scores) for behavioral. Read-only; data comes from the durable session store.

const KIND_LABEL: Record<string, string> = { behavioral: 'Behavioral', sysdesign: 'System design', build: 'Build' }

function arrow(dir: Direction): { glyph: string; cls: string; label: string } {
  if (dir === 'up') return { glyph: '↑', cls: 'text-emerald-400', label: 'improving' }
  if (dir === 'down') return { glyph: '↓', cls: 'text-rose-400', label: 'slipping' }
  return { glyph: '→', cls: 'text-slate-500', label: 'flat' }
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
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-medium text-slate-400">{title}</h4>
        {latest != null && <span className="text-sm font-semibold text-slate-100">{format(latest)}</span>}
      </div>
      <div className="mt-2">
        <Sparkline points={points} min={min} max={max} color={color} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
        <span>{points.length} rep{points.length === 1 ? '' : 's'}</span>
        <Trend {...arrow(trendDirection(points, lowerIsBetter))} />
      </div>
    </div>
  )
}

// Metallic tier gradients — pure Tailwind, no stylesheet. The rank medallion and its glow ring
// are themed off the tier so gold *looks* gold and diamond shimmers cool.
const TIER_GRADIENT: Record<string, string> = {
  Bronze: 'from-amber-500 to-amber-800',
  Silver: 'from-slate-200 to-slate-500',
  Gold: 'from-yellow-300 to-amber-600',
  Platinum: 'from-cyan-200 to-cyan-500',
  Diamond: 'from-indigo-300 via-sky-300 to-violet-500',
}
const TIER_GLOW: Record<string, string> = {
  Bronze: 'ring-amber-500/40',
  Silver: 'ring-slate-300/40',
  Gold: 'ring-amber-400/50',
  Platinum: 'ring-cyan-300/50',
  Diamond: 'ring-violet-400/50',
}

/** Eases a number up to its target with rAF — the one bit of game feel CSS can't do. */
function useCountUp(target: number, ms = 700): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3)))) // easeOutCubic
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return n
}

function rankMovement(dir: Direction): { text: string; cls: string } {
  if (dir === 'up') return { text: '▲ Ranked up', cls: 'text-emerald-300' }
  if (dir === 'down') return { text: '▼ Slipped', cls: 'text-rose-300' }
  return { text: 'Holding rank', cls: 'text-white/40' }
}

/** Gamified header: a dark "rank panel" with a level crest, tier medallion, and an animated XP bar. */
function GameHeader({ game }: { game: GameStat }) {
  const [filled, setFilled] = useState(false)
  useEffect(() => setFilled(true), [])
  const into = useCountUp(game.into)
  const move = rankMovement(game.rankDir)
  const gradient = TIER_GRADIENT[game.rank.tier] ?? 'from-slate-400 to-slate-600'
  const glow = TIER_GLOW[game.rank.tier] ?? 'ring-white/30'

  return (
    <div className="mt-3 flex items-center gap-4 rounded-xl bg-gradient-to-br from-slate-800 to-slate-700/90 p-4 text-white shadow-md ring-1 ring-white/10">
      {/* Level crest */}
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_22px_-6px_rgba(99,102,241,0.9)] ring-2 ring-white/20">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-100">Lv</span>
        <span className="-mt-1 text-2xl font-bold leading-none">{game.level}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {/* Tier medallion — division inside, tier conveyed by the metallic color */}
            <div
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br ${gradient} text-slate-900 shadow ring-2 ${glow} ${
                game.rankDir !== 'flat' ? 'animate-pulse' : ''
              }`}
            >
              <span className="text-sm font-black tracking-tight">{game.rank.division}</span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{game.rank.label}</div>
              <div className={`text-[11px] font-medium ${move.cls}`}>{move.text}</div>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/30">
            +{game.lastXp} XP
          </span>
        </div>

        {/* XP bar — fills on mount via a Tailwind width transition */}
        <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-400 shadow-[0_0_8px_rgba(129,140,248,0.7)] transition-[width] duration-700 ease-out"
            style={{ width: `${filled ? Math.round(game.progress * 100) : 0}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-white/50">
          <span>{into} / {game.need} XP</span>
          <span>{game.toNext} to Lv {game.level + 1}</span>
        </div>
      </div>
    </div>
  )
}

function ModeCard({ trend }: { trend: ModeTrend }) {
  const levels = trend.level
  const current = levels.length ? ordinalLabel(levels[levels.length - 1].value) : '—'
  const best = levels.length ? ordinalLabel(Math.max(...levels.map((p) => p.value))) : '—'
  const game = summarizeGame(trend.score)

  return (
    <div className="rounded-xl bg-slate-900 p-5 shadow-sm ring-1 ring-white/10">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-white">{KIND_LABEL[trend.kind] ?? trend.kind}</h3>
        <span className="text-xs text-slate-400">{trend.count} completed</span>
      </div>

      {game && <GameHeader game={game} />}

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

  // The whole tab is a dark "arcade" surface so the rank panels and tier colors read as a game.
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-2xl bg-gradient-to-b from-slate-950 to-slate-900 p-5 ring-1 ring-white/10">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Your progress</h2>
        <p className="text-xs text-slate-400">Are you improving over reps? Level up across your completed sessions.</p>
      </div>
      {children}
    </div>
  )

  if (loading) return <Shell><p className="text-sm text-slate-400">Loading…</p></Shell>

  if (trends.length === 0) {
    return (
      <Shell>
        <p className="text-sm text-slate-400">
          No completed sessions yet. Finish a few behavioral, system-design, or build sessions and
          your level and delivery trends will chart here. (Needs the backend running for durable
          history — see the README.)
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="space-y-4">
        {trends.map((t) => (
          <ModeCard key={t.kind} trend={t} />
        ))}
      </div>
    </Shell>
  )
}
